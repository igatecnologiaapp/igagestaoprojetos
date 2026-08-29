# Auditoria Formal de Reconciliação e Plano de Evolução — Módulo Projetos

**Projeto:** Sistema Gestão de Projetos — IGA Tecnologia
**Repositório oficial:** igatecnologiaapp/igagestaoprojetos
**Data:** 29/08/2026
**Natureza desta rodada:** diagnóstico e planejamento. **Nenhuma** tabela, migration, coluna, aba, policy, RLS ou fluxo de Auth foi criado ou alterado.

---

## 1. Evidências coletadas

Fontes auditadas: banco Supabase em produção (catálogo `pg_proc`, `pg_trigger`, policies), 20 migrations existentes, `src/routes/projects.tsx` (406 linhas), `src/components/project-detail.tsx` (391), `project-records.tsx` (245), `project-custom-fields.tsx` (263), `audit-history.tsx` (65), `src/lib/auth-context.tsx`, `docs/FASE-0.2-RELATORIO-TECNICO.md`, `docs/RELATORIO-INCIDENTE-AUTENTICACAO-FASE-0.2.md` e a Baseline Arquitetural incorporada.

**Estrutura canônica confirmada (não duplicar):** `projects`, `project_emails`, `project_github_repos`, `project_lovable`, `project_credits`, `project_prompts`, `project_links`, `project_accounts`, `project_custom_field_definitions`, `project_custom_field_values`, `project_shares`, `tasks`, `task_shares`, `task_comments`, `task_attachments`, `task_status_history`, `appointments`, `audit_history`, `security_access_log`, RBAC (`app_permissions`, `role_permissions`, `user_permission_overrides`, `user_roles`, `user_module_access`).

**Abas existentes no detalhe do projeto:** Visão geral · Tarefas · ChatGPT/Prompts · GitHub · Lovable · E-mails · Links · Acessos (somente Administrador) · Compartilhamento · Histórico. **Todas as abas pedidas pelo documento já existem.** Nenhuma aba nova é necessária.

---

## 2. Matriz principal de reconciliação

| Requisito do documento | Entidade/arquivo atual | Situação atual | Classificação | Duplicidade potencial | Lacuna | Ação recomendada | Bloco |
|---|---|---|---|---|---|---|---|
| Informações principais do projeto | `projects` + `project-detail.tsx` (Visão geral) | nome, empresa, descrição, valor, início, fim, status, `phase`, `next_action`, `owner_id`, `last_activity_at` | **A / B** | Alta se novos campos forem criados fora de `projects` | Nenhum campo obrigatório do documento está ausente; falta apenas exibição consolidada (dossiê) | Manter tabela; evoluir apenas apresentação | 2 |
| E-mails | `project_emails` | email, provider, purpose, notes, created_by, created_at | **A** | Criar `project_mailboxes` seria duplicidade | Nenhuma | Manter | — |
| GitHub | `project_github_repos` | url, owner, repo_name, default_branch, status, notes, created_at | **A** | `project_repos` seria duplicidade | Integração automática (não autorizada nesta fase) | Manter; integração fica para fase futura | 5 |
| Lovable | `project_lovable` | account_email, project_url, public_url, workspace, notes, created_at | **A** | — | Nenhuma | Manter | — |
| Créditos Lovable | `project_credits` (histórico de movimentações) | entry_date, amount, description, notes; total calculado por soma no frontend (`useProjectCredits`) | **A** | Campo estático em `projects` seria regressão arquitetural | Nenhuma; arquitetura correta confirmada | Preservar histórico; **proibido** campo estático | — |
| ChatGPT / Prompts | `project_prompts` | title, url, prompt_type (12 tipos), purpose, prompt_date, sent_to_lovable_at, notes, created_by, created_at | **A / B** | Tabela paralela de prompts seria duplicidade | Apresentação é lista, não linha do tempo cronológica | Evoluir somente a apresentação para timeline | 4 |
| Rastreabilidade Prompt → Commit → Versão → Teste → Homologação | inexistente | — | **D** | — | Total | Não iniciar; pertence a Governança do Desenvolvimento | 5 |
| Links | `project_links` (`category` é texto livre no banco) | categorias na UI: Documentação, Design, Homologação, Produção, Planilha, Outro | **B** | — | Faltam na UI: GitHub, Lovable, ChatGPT, Supabase, Vercel, Domínio, Analytics | Expandir a lista de opções no frontend; banco já é aberto (`text`) | 3 |
| Contas e acessos | `project_accounts` + aviso explícito na UI | platform, url, username, email, notes; **nenhuma senha armazenada**; visível só para Administrador | **A / G** | Cofre paralelo seria duplicidade e risco | Cofre de segredos (bloqueado) | Preservar; **proibido** armazenar senha/API key/token/secret | G |
| Campos personalizados | `project_custom_field_definitions` + `_values` + `project-custom-fields.tsx` | 11 tipos: text, textarea, number, currency, date, datetime, boolean, select, multiselect, url, email | **A** | — | Nenhum tipo relevante ausente | Manter | — |
| Cards e Tabela | `src/routes/projects.tsx` | seletor Cards\|Tabela; colunas: Projeto, Empresa, Status, Etapa, Responsável, Progresso, Créditos, Prazo, Atualizado | **A / B** | — | Ausentes: Próxima ação e (opcional) contagem de tarefas abertas | Adicionar no máximo 1–2 colunas, com truncamento responsivo | 4 |
| Detalhe do projeto | `project-detail.tsx` | 10 abas | **A** | Recriar abas é proibido | Ordenação cronológica e densidade de informação | Somente UX | 4 |
| Subtarefas | inexistente | — | **F** | — | Total | Divergência de premissa / decisão funcional pendente. **Não criar** | — |
| Plataformas genéricas (`project_platforms`) | estruturas específicas GitHub/Lovable | — | **F / D** | Risco real de proliferação (`project_vercel`, `project_openai`, …) | Modelo canônico ausente | Definir modelo genérico antes de qualquer nova integração | 5 |
| Kanban, comentários, anexos, compartilhamentos, auditoria, RBAC | módulos existentes | operacionais e endurecidos | **E** | — | — | Preservar; não expandir automaticamente | — |

---

## 3. Matriz `last_activity_at`

Função `touch_project_activity()` (AFTER INSERT/UPDATE/DELETE, resolve `project_id`) e `touch_own_project_activity()` (BEFORE UPDATE na própria `projects`).

| Evento | Atualiza `last_activity_at`? | Trigger/Função | Status |
|---|---|---|---|
| Alteração do projeto | Sim | `trg_projects_activity` → `touch_own_project_activity()` | OK |
| Tarefa (criar/editar/excluir) | Sim | `trg_tasks_project_activity` | OK |
| Mudança de status da tarefa | Sim (via UPDATE em `tasks`) | `trg_tasks_project_activity` | OK |
| Prompt | Sim | `trg_project_prompts_activity` | OK |
| Link | Sim | `trg_project_links_activity` | OK |
| Crédito | Sim | `trg_project_credits_activity` | OK |
| E-mail | Sim | `trg_project_emails_activity` | OK |
| GitHub | Sim | `trg_project_github_repos_activity` | OK |
| Lovable | Sim | `trg_project_lovable_activity` | OK |
| Conta/acesso | Sim | `trg_project_accounts_activity` | OK |
| Valor de campo personalizado | Sim | `trg_project_custom_field_values_activity` | OK |
| **Comentário em tarefa** | **Não** | ausente (`task_comments` não tem `project_id` direto) | **Lacuna real** |
| **Anexo de tarefa** | **Não** | ausente | **Lacuna real** |
| **Agendamento vinculado ao projeto** | **Não** | ausente | **Lacuna real** |
| Compartilhamento de projeto/tarefa | Não | ausente | Lacuna menor (evento de governança, não de trabalho) |

Correção proposta apenas onde há lacuna real (Bloco 3), via trigger que resolve o `project_id` pela tarefa.

---

## 4. Cobertura de auditoria (`audit_history`)

`log_audit(<entidade>)` está ativo em: `companies`, `projects`, `tasks`, `project_prompts`, `project_credits`, `project_links`, `project_emails`, `project_github_repos`, `project_lovable`, `project_accounts`, `project_custom_field_definitions`, `project_custom_field_values`. Mudanças de RBAC são gravadas no log imutável `security_access_log` por `audit_rbac_change()`; status de tarefa em `task_status_history`.

**Eventos ainda não cobertos:** `appointments`, `task_comments`, `task_attachments`, `project_shares`, `task_shares`, `external_collaborators`.
**Não criar `activity_log`.** As duas estruturas canônicas são suficientes. Nenhum metadado sensível pode ser gravado (`block_secret_metadata()` continua ativo).

---

## 5. Escopo — Task share × Project share (item 8)

Definição atual de `can_view_project` concede visibilidade do projeto quando o usuário: é Administrador, é `owner_id`, é `created_by`, tem `project_shares`, **é responsável ou autor de qualquer tarefa do projeto**, ou **possui `task_shares` em qualquer tarefa do projeto**.

Consequência mapeada — um usuário compartilhado **apenas em uma tarefa** enxerga hoje:

| Recurso | Acesso atual | Menor privilégio recomendado |
|---|---|---|
| Projeto (cabeçalho, datas, status, valor) | Visível | Visível apenas em versão resumida |
| Créditos Lovable | Visível | **Não** |
| E-mails do projeto | Visível | **Não** |
| GitHub | Visível | **Não** |
| Lovable | Visível | **Não** |
| Prompts | Visível | **Não** |
| Links | Visível | Apenas categorias operacionais |
| Contas e acessos | **Não** (restrito a Administrador) | Manter |

**Recomendação (não aplicada nesta rodada):** separar `can_view_project` (contexto mínimo do projeto pai) de um novo predicado `can_view_project_dossier` usado pelas subtabelas sensíveis (créditos, e-mails, GitHub, Lovable, prompts), que exigiria vínculo direto ao projeto. Mudança com impacto funcional — exige autorização expressa e nova bateria de testes negativos.

---

## 6. `.env` (item 9)

- Continua **rastreado no HEAD** (`git ls-files` retorna `.env`).
- `.gitignore` está correto; `.env.example` versionado e sem segredo.
- Conteúdo: apenas URL do backend, project ID e chave pública/anon — **nenhum segredo real**. Não há justificativa para rotação.
- Procedimento de fechamento: executar `git rm --cached .env` e commitar no repositório oficial, **sem reescrita de histórico**. Enquanto não executado, a Fase 0 permanece **não homologável**.

---

## 7. Autenticação (item 10)

A correção do incidente pós-Fase 0.2 está preservada: tratamento de erros em `src/routes/auth.tsx`, carregamento resiliente de acessos em `src/lib/auth-context.tsx`, `previewAuthStorage` intocado. **Nenhuma regressão encontrada.** Confirmado: **nenhum** item do plano de evolução do módulo Projetos depende de alteração no mecanismo de autenticação.

---

## 8. Matriz de preservação

| Módulo/estrutura | Estado atual | Preservar? | Pode ser alterado? | Condição |
|---|---|---|---|---|
| Empresas | Operacional | Sim | Não nesta evolução | — |
| Projetos | Canônico | Sim | Sim, incremental | Sem tabela paralela |
| Tarefas | Operacional | Sim | Não | — |
| Kanban | Operacional | Sim | Não | Proibido recriar |
| Comentários | Operacional | Sim | Só trigger de atividade | Sem mudança de UX |
| Anexos | Operacional + storage privado | Sim | Só trigger de atividade | Storage não redesenhado |
| Compartilhamentos | Endurecido | Sim | Somente predicado de dossiê | Autorização expressa |
| Usuários / Permissões | RBAC granular | Sim | Não | — |
| Dashboard | Operacional | Sim | Sim (visão gerencial) | Bloco 4 |
| Agenda | Operacional | Sim | Só trigger/auditoria | — |
| Relatórios | Operacional | Sim | Sim (leitura) | Bloco 4 |
| Auth | Corrigido | Sim | **Não** | Apenas regressão comprovada |
| RBAC / RLS | Fase 0.2 | Sim | Só endurecimento | Proibido `USING (true)` em dado de negócio |
| Auditoria | `audit_history` + `security_access_log` | Sim | Ampliar cobertura | Sem `activity_log` |
| Campos personalizados | Completo | Sim | Não | — |
| GitHub / Lovable / Prompts / Créditos / Links / Acessos | Completos | Sim | Campos e UX pontuais | Sem duplicidade |

---

## 9. Plano de evolução incremental

### BLOCO 1 — Fechamento da Fase 0
Escopo: remover `.env` do índice do Git; reexecutar `supabase/tests/rls_phase_0_2.sql`. Tabelas: nenhuma. Frontend: nenhum. Migrations: nenhuma. RLS: nenhuma. Testes: suíte negativa 39/39. Riscos: nulos. Dependências: acesso Git do usuário. Homologação: `.env` fora do índice + suíte aprovada → Fase 0 homologável.

### BLOCO 2 — Consolidação do Dossiê (somente apresentação)
Escopo: painel consolidado na aba Visão geral (empresa, fase, próxima ação, responsável, prazo, créditos, contagens por entidade). Tabelas: nenhuma. Frontend: `project-detail.tsx`. Migrations/RLS: nenhuma. Testes: regressão visual e de permissão. Riscos: baixos. Homologação: nenhuma informação nova exposta a quem não podia vê-la.

### BLOCO 3 — Evolução das entidades existentes
Escopo: expandir categorias de links na UI (GitHub, Lovable, ChatGPT, Supabase, Vercel, Domínio, Analytics); triggers de `last_activity_at` para comentários, anexos e agendamentos; auditoria para `appointments`, `task_comments`, `task_attachments`, compartilhamentos. Tabelas afetadas: nenhuma criada. Migrations: 1 incremental (apenas triggers). RLS: inalterada. Testes: matriz de atividade + regressão negativa. Riscos: baixos (triggers `AFTER`). Homologação: matriz da §3 sem lacunas reais.

### BLOCO 4 — UX e visão gerencial
Escopo: timeline cronológica de Prompts; coluna "Próxima ação" na tabela de projetos; ordenação/densidade das abas. Tabelas: nenhuma. Frontend: `project-detail.tsx`, `projects.tsx`. Migrations/RLS: nenhuma. Riscos: responsividade. Homologação: uso em 1066px sem quebra.

### BLOCO 5 — Preparação arquitetural
Escopo (somente decisão documentada, sem código): modelo genérico `project_platforms`; separação `can_view_project` × dossiê; decisão sobre subtarefas; arquitetura segura para segredos. Homologação: decisões aprovadas por escrito antes de qualquer implementação.

---

## 10. Regra de parada

Auditoria, matrizes e plano entregues. **Desenvolvimento interrompido.** Nenhuma recomendação foi implementada. Aguardando autorização expressa para o Bloco 1.
