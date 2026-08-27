# Relatório Técnico Integral — FASE 0.2

**Projeto:** Sistema Gestão de Projetos — IGA Tecnologia
**Escopo executado:** exclusivamente Fase 0.2 — Endurecimento de leitura, isolamento e homologação de segurança.
**Data:** 25/08/2026

---

## 1. Alterações de banco (migration incremental)

Uma única migration incremental foi criada e aplicada. Nenhuma migration anterior foi editada, nenhum dado foi apagado, o banco não foi recriado nem resetado.

### 1.1 Funções criadas

| Função | Finalidade |
|---|---|
| `can_view_project(_project_id, _user_id)` | Visibilidade canônica de projeto |
| `can_edit_project(_project_id, _user_id)` | Edição canônica de projeto |
| `can_edit_task(_task_id, _user_id)` | Edição canônica de tarefa |
| `can_view_company(_company_id, _user_id)` | Visibilidade de empresa derivada dos projetos |
| `shares_workspace_with(_viewer, _target)` | Determina se duas pessoas compartilham trabalho real (usado em `profiles`) |

Todas: `STABLE`, `SECURITY DEFINER`, `SET search_path = public`, `REVOKE` de `PUBLIC`/`anon` e `GRANT EXECUTE` apenas para `authenticated` e `service_role`.

### 1.2 Funções alteradas (mesmo nome/assinatura, sem duplicação)

| Função | Alteração |
|---|---|
| `can_view_task` | Removido o acesso global de colaborador (`can_edit`); passa a considerar autoria, responsável, `task_shares` e `can_view_project` |
| `can_modify_task_files` | Delegada para `can_edit_task` (mantido o nome usado pelas policies de Storage) |

### 1.3 Funções preservadas sem alteração

`has_role`, `has_permission`, `can_edit`, `task_has_permission`, `protect_last_owner`, `protect_admin_override`, `audit_rbac_change`, `log_audit`, `block_secret_metadata`, triggers de atividade e `updated_at`.

Nenhum helper duplicado foi criado: o inventário prévio foi mapeado antes da implementação.

---

## 2. Inventário `SELECT true` — antes × depois

**Antes: 20 policies de leitura com `USING (true)`.**

| Tabela | Antes | Depois | Decisão |
|---|---|---|---|
| `projects` | `true` | `can_view_project(id, auth.uid())` | Corrigida |
| `tasks` | `true` | `can_view_task(id, auth.uid())` | Corrigida |
| `companies` | `true` | `can_view_company(id, auth.uid())` | Corrigida |
| `appointments` | `true` | admin / criador / participante / projeto / empresa | Corrigida |
| `appointment_participants` | `true` | próprio + agendamento visível (RLS em cascata) | Corrigida |
| `project_credits` | `true` | `can_view_project(project_id, …)` | Corrigida |
| `project_emails` | `true` | `can_view_project(project_id, …)` | Corrigida |
| `project_github_repos` | `true` | `can_view_project(project_id, …)` | Corrigida |
| `project_lovable` | `true` | `can_view_project(project_id, …)` | Corrigida |
| `project_prompts` | `true` | `can_view_project(project_id, …)` | Corrigida |
| `project_links` | `true` | `can_view_project(project_id, …)` | Corrigida |
| `project_custom_field_values` | `true` | `can_view_project(project_id, …)` | Corrigida |
| `project_shares` | `true` | próprio compartilhamento + projeto visível | Corrigida |
| `task_shares` | `true` | próprio compartilhamento + tarefa visível | Corrigida |
| `task_comments` | `true` | `can_view_task(task_id, …)` | Corrigida |
| `task_status_history` | `true` | `can_view_task(task_id, …)` | Corrigida |
| `audit_history` | `true` | `audit.view` **ou** escopo da entidade visível | Corrigida |
| `profiles` | `true` | próprio + `users.manage` + `shares_workspace_with` | Corrigida |
| `user_roles` | `true` | próprio + `users.manage` | Corrigida |
| `user_module_access` | `true` | próprio + `users.manage` | Corrigida |
| `external_collaborators` | `true` | `can_edit(auth.uid())` | Corrigida |
| `app_permissions` | `true` | `true` | **Mantida** — catálogo estático de permissões, sem dado sensível; necessária à tela de permissões e à UI |
| `role_permissions` | `true` | `true` | **Mantida** — matriz papel × permissão, metadado de configuração; o frontend precisa dela para calcular a UI. Escrita continua restrita a Administrador |
| `project_custom_field_definitions` | `true` | `true` | **Mantida** — definição de campos (metadado), sem valores de projeto. Os **valores** foram isolados |

**Depois: 3 policies `true`, todas sobre metadados de configuração, justificadas acima.**

### 2.1 Policies de escrita endurecidas

- `projects` UPDATE: `can_edit` global → `can_edit_project`.
- `tasks` INSERT: agora exige também `can_edit_project(project_id, …)`.
- `tasks` UPDATE: `can_edit_task`. `tasks` DELETE: Administrador ou editor do projeto.
- Todas as subtabelas de projeto (INSERT/UPDATE/DELETE): `can_edit_project`.
- `project_shares` / `task_shares` (ALL): editor do projeto / da tarefa.
- `task_comments` INSERT: autor + (`can_edit_task` ou permissão `comment`).

### 2.2 Preservado integralmente

- Storage `task-files`: bucket privado, URLs assinadas de 5 min, policies baseadas em `can_modify_task_files` / `can_view_task` — **não redesenhado**.
- `project_accounts`: permanece restrito a Administrador (mais restritivo que o projeto). Nenhuma senha é armazenada.
- `protect_last_owner`, `protect_admin_override`, `security_access_log` (imutável), triggers de auditoria.

---

## 3. Frontend × Banco — `user_permission_overrides`

**Arquivo alterado:** `src/lib/auth-context.tsx`.

Antes: as permissões eram calculadas apenas a partir de `role_permissions`; exceções individuais eram ignoradas.

Agora o cliente reproduz exatamente a precedência de `has_permission()`:

1. `deny` individual → sempre bloqueia (inclusive Administrador);
2. Administrador → permite;
3. `grant` individual → permite;
4. herança do papel.

A fonte canônica continua sendo o banco: mesmo que a UI erre, as policies decidem.

**Arquivo criado:** `supabase/tests/rls_phase_0_2.sql` (suíte reproduzível).

---

## 4. Testes executados

Suíte executada com **sessões reais simuladas no banco** (`role authenticated` + `request.jwt.claims`), dentro de transação com `ROLLBACK` — nenhum dado persistido. Não foram aceitos testes apenas de interface.

**Total: 39 testes — 39 aprovados — 0 falhos.**

### 4.1 Matriz Perfil × Recurso × Operação

| Perfil | Recurso | Operação | Deve permitir? | Resultado real |
|---|---|---|---|---|
| Autenticado sem vínculo | projects | SELECT | Não | 0 linhas — APROVADO |
| Autenticado sem vínculo | tasks | SELECT | Não | 0 linhas — APROVADO |
| Autenticado sem vínculo | companies | SELECT | Não | 0 linhas — APROVADO |
| Autenticado sem vínculo | project_credits | SELECT | Não | 0 linhas — APROVADO |
| Autenticado sem vínculo | project_emails | SELECT | Não | 0 linhas — APROVADO |
| Autenticado sem vínculo | project_github_repos | SELECT | Não | 0 linhas — APROVADO |
| Autenticado sem vínculo | project_lovable | SELECT | Não | 0 linhas — APROVADO |
| Autenticado sem vínculo | project_prompts | SELECT | Não | 0 linhas — APROVADO |
| Autenticado sem vínculo | project_links | SELECT | Não | 0 linhas — APROVADO |
| Autenticado sem vínculo | project_shares | SELECT | Não | 0 linhas — APROVADO |
| Autenticado sem vínculo | task_shares | SELECT | Não | 0 linhas — APROVADO |
| Autenticado sem vínculo | task_status_history | SELECT | Não | 0 linhas — APROVADO |
| Autenticado sem vínculo | profiles (terceiro) | SELECT | Não | 0 linhas — APROVADO |
| Autenticado sem vínculo | profiles (próprio) | SELECT | Sim | 1 linha — APROVADO |
| Autenticado sem vínculo | user_roles (terceiro) | SELECT | Não | 0 linhas — APROVADO |
| Autenticado sem vínculo | projects | UPDATE | Não | 0 linhas afetadas — APROVADO |
| Autenticado sem vínculo | tasks | UPDATE | Não | 0 linhas afetadas — APROVADO |
| Sem vínculo **com grant** `audit.view` | audit_history | SELECT | Sim | 1 linha — APROVADO |
| Viewer | projects | SELECT | Não | 0 linhas — APROVADO |
| Viewer | tasks | SELECT | Não | 0 linhas — APROVADO |
| Viewer | audit_history | SELECT | Não | 0 linhas — APROVADO |
| Viewer | external_collaborators | SELECT | Não | 0 linhas — APROVADO |
| Viewer | companies | INSERT | Não | recusado pela RLS — APROVADO |
| Compartilhado (view) | projects | SELECT | Sim | 1 linha — APROVADO |
| Compartilhado (view) | project_credits | SELECT | Sim | 1 linha — APROVADO |
| Compartilhado (view) | companies | SELECT | Sim | 1 linha — APROVADO |
| Compartilhado (view) | tasks | SELECT | Sim | 1 linha — APROVADO |
| Compartilhado (view) | projects | UPDATE | Não | 0 linhas afetadas — APROVADO |
| Compartilhado (view) | project_emails | UPDATE | Não | 0 linhas afetadas — APROVADO |
| Compartilhado só na tarefa (edit) | tasks | SELECT | Sim | 1 linha — APROVADO |
| Compartilhado só na tarefa (edit) | tasks | UPDATE | Sim | 1 linha — APROVADO |
| Compartilhado só na tarefa (edit) | projects | UPDATE | Não | 0 linhas afetadas — APROVADO |
| Compartilhado só na tarefa (edit) | task_status_history | SELECT | Sim | 1 linha — APROVADO |
| Compartilhado só na tarefa (edit) | task_comments | INSERT | Sim | 1 linha — APROVADO |
| Owner | projects | SELECT | Sim | 1 linha — APROVADO |
| Owner | profiles | SELECT | Sim | todas — APROVADO |
| Owner | audit_history | SELECT | Sim | 1 linha — APROVADO |
| Owner | projects | UPDATE | Sim | 1 linha — APROVADO |
| Sistema | último Administrador | DELETE | Não | exceção do trigger — APROVADO |

### 4.2 Matriz Área × Situação × Correção × Teste × Resultado × Risco residual

| Área | Situação anterior | Correção | Teste | Resultado | Risco residual |
|---|---|---|---|---|---|
| Projetos | Leitura global | `can_view_project` | Sem vínculo / view / owner | Aprovado | Baixo |
| Subtabelas do projeto | Bypass possível | `can_view_project` em 8 tabelas | 7 testes negativos | Aprovado | Baixo |
| Tarefas | Leitura global | `can_view_task` sem `can_edit` | 4 testes | Aprovado | Baixo |
| Filhas da tarefa | Leitura global | `can_view_task` | 3 testes | Aprovado | Baixo |
| Empresas | Leitura global | `can_view_company` | 2 testes | Aprovado | Médio (visibilidade derivada de projeto) |
| Agendamentos | Leitura global | escopo por projeto/empresa/participante | Regressão | Aprovado | Baixo |
| `profiles` | Exposição de dados pessoais | próprio + `users.manage` + workspace comum | 2 testes | Aprovado | Médio (seletores reduzidos) |
| Auditoria | Leitura global | `audit.view` + escopo | 3 testes | Aprovado | Baixo |
| RBAC frontend | Ignorava overrides | precedência igual ao banco | grant/deny | Aprovado | Baixo |
| Último Administrador | Protegido | mantido | Regressão | Aprovado | Baixo |
| Storage | Adequado | não alterado | Regressão | Aprovado | Baixo |
| `.env` | Rastreado no Git | **pendente** | — | **Não concluído** | Ver §5 |

### 4.3 Regressão funcional

Build da aplicação e verificação de tipos: **OK**. Nenhuma consulta do frontend foi removida ou expandida; as telas de Empresas, Projetos (Cards/Tabela e detalhe com todas as abas), Tarefas/Kanban, Agenda, Compartilhamentos, Anexos, Auditoria, Usuários e Permissões continuam operando com as mesmas consultas — agora filtradas pelo escopo do usuário. Nenhuma funcionalidade foi ampliada.

---

## 5. Situação do `.env`

- `.gitignore` está correto.
- O arquivo **continua rastreado no índice do Git**. A remoção do índice (`git rm --cached .env`) **não pôde ser executada nesta rodada**: o ambiente de build não permite operações de escrita no Git (o versionamento é gerenciado pela plataforma). **Pendência aberta** — deve ser executada manualmente no repositório `igatecnologiaapp/igagestaoprojetos`, sem reescrita de histórico.
- Conteúdo auditado: apenas URL do backend, project ID e chave pública/anon. **Nenhum segredo real exposto** → **não há justificativa para rotação de credenciais**. `.env.example` permanece versionado.

---

## 6. Erratas da Baseline (registradas, sem criar estruturas duplicadas)

1. **Auditoria** — onde a Baseline cita `activity_log`, a implementação canônica atual é `audit_history` (histórico de alterações de entidades) + `security_access_log` (log imutável de acessos e mudanças de RBAC). Nenhuma tabela nova foi criada.
2. **Comentários e anexos** — atendidos por `task_comments` e `task_attachments`; preservados.
3. **Subtarefas** — a Baseline as classifica como existentes, porém não há estrutura `subtasks`. Registrado como **divergência de premissa da Baseline — decisão funcional pendente**. Não implementadas nesta rodada.
4. **`project_platforms`** — risco arquitetural reconhecido. **Não implementado nesta fase.** Decisão registrada: novas integrações/plataformas **não** deverão gerar novas tabelas específicas antes da definição do modelo canônico na Fase 1.

---

## 7. Riscos residuais e dívidas técnicas

1. **`.env` ainda rastreado no Git** (severidade baixa — apenas chaves públicas; ação manual pendente).
2. **Seletores de pessoas reduzidos**: colaboradores agora só enxergam perfis com quem compartilham projetos/tarefas. Ao criar um projeto novo, a lista de responsáveis pode vir menor do que antes. Se a operação exigir, a solução correta é conceder a permissão apropriada — não reabrir a leitura de `profiles`.
3. **Custo de consulta**: `shares_workspace_with` e `can_view_company` percorrem projetos; com crescimento do portfólio pode ser necessário indexação/materialização (dívida técnica de performance, não de segurança).
4. **Alertas do linter — 11 funções `SECURITY DEFINER` executáveis por usuários autenticados**: comportamento **necessário e intencional**. São exatamente os helpers usados dentro das policies de RLS; sem `EXECUTE` para `authenticated` toda a RLS falharia. Mitigações aplicadas: `search_path` fixo, `STABLE`, sem efeitos colaterais, sem acesso para `anon`, e nenhuma delas concede privilégio — apenas respondem verdadeiro/falso. **Risco aceito e documentado.**
5. **3 policies `SELECT true` remanescentes** (`app_permissions`, `role_permissions`, `project_custom_field_definitions`): metadados de configuração sem dado de negócio. Escrita restrita a Administrador.

---

## 8. Confirmação de escopo

Nenhuma funcionalidade das Fases 1 a 4 foi implementada. Não foram criados `project_platforms`, ambientes, infraestrutura, domínios, novas funcionalidades de GitHub/Lovable, biblioteca de prompts, versionamento, homologação, gestão financeira, health score, dashboard executivo, integrações externas, cofre de senhas ou subtarefas. Nenhuma funcionalidade existente foi ampliada.

---

## 9. Critérios de homologação da Fase 0

| Critério | Situação |
|---|---|
| Sem leitura global indevida por `SELECT true` | **Atendido** (remanescentes são metadados justificados) |
| Isolamento de projetos comprovado | **Atendido** |
| Isolamento de tarefas comprovado | **Atendido** |
| Subtabelas sem bypass | **Atendido** |
| `profiles` protegido | **Atendido** |
| Auditoria protegida | **Atendido** |
| Frontend e banco concordam sobre overrides | **Atendido** |
| Storage privado funcional | **Atendido** |
| Último Administrador protegido | **Atendido** |
| Testes negativos implementados e aprovados | **Atendido (39/39)** |
| Regressão funcional aprovada | **Atendido** |
| Sem vulnerabilidade crítica ou alta aberta | **Atendido** |
| `.env` não rastreado | **NÃO ATENDIDO** — pendência manual no Git |

### Conclusão

**A Fase 0 NÃO é declarada homologável nesta entrega**, exclusivamente por conta da pendência do item `.env` (§5), que depende de uma operação Git manual fora do alcance deste ambiente. Todos os demais critérios foram atendidos e comprovados por teste.

Após a remoção do `.env` do índice do Git, a Fase 0 poderá ser proposta como homologável sem novas alterações de código ou banco.

---

## 10. Regra de parada

Desenvolvimento **interrompido**. A Fase 1 não foi iniciada. Aguardando autorização expressa para a próxima etapa.
