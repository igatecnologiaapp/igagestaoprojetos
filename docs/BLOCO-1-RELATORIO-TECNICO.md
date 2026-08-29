# BLOCO 1 — Fechamento das Pendências da Fase 0

**Sistema Gestão de Projetos — IGA Tecnologia**
Escopo: correção e fechamento de segurança. Nenhuma funcionalidade da Fase 1 foi iniciada.

---

## 1. Controle

| Item | Conteúdo |
|---|---|
| Escopo autorizado | Bloco 1 — fechamento das pendências da Fase 0 |
| Arquivos alterados | `supabase/tests/rls_bloco_1_menor_privilegio.sql` (novo), `supabase/tests/storage_bloco_1_regressao.sql` (novo), `docs/BLOCO-1-RELATORIO-TECNICO.md` (novo) |
| Migrations criadas | 2 migrations incrementais (menor privilégio do dossiê; isolamento de tarefas) |
| Migrations históricas | Não editadas |
| Histórico Git | Não reescrito; nenhum force push |
| Publicação | Não publicado em produção |

Nenhum arquivo de frontend precisou ser alterado: a correção é integralmente de autorização no banco, e a UI já consome as tabelas por RLS.

---

## 2. Banco de dados

### Função criada

`public.can_view_project_dossier(_project_id uuid, _user_id uuid)` — `STABLE SECURITY DEFINER`, `search_path=public`, `EXECUTE` revogado de `PUBLIC`/`anon` e concedido a `authenticated`/`service_role`.

Concede acesso ao **dossiê técnico/administrativo** do projeto quando o usuário é:

- Administrador (`has_role owner`);
- responsável (`owner_id`);
- criador (`created_by`);
- membro por `project_shares`;
- integrante da equipe do projeto (responsável ou criador de alguma tarefa do projeto).

**Exclui deliberadamente** o acesso obtido apenas por `task_shares`.

### Função alterada

`public.can_view_task` — passou a usar `can_view_project_dossier` no lugar de `can_view_project` como fallback de projeto. Sem isso, um usuário com `task_share` enxergava todas as tarefas do projeto (falha detectada e corrigida durante os testes desta rodada).

### Policies alteradas (somente `SELECT`)

`project_credits`, `project_emails`, `project_github_repos`, `project_lovable`, `project_prompts`, `project_links`, `project_custom_field_values`, `audit_history` (entidades de projeto).
Justificativa: aplicar menor privilégio — informação administrativa/técnica do projeto exige vínculo com o projeto, não com uma tarefa.

### Policies preservadas (sem alteração)

- `projects` (`SELECT` via `can_view_project`) — mantida para fornecer **contexto mínimo** do projeto pai (id, nome, empresa, status) à tarefa compartilhada, conforme item 7 da autorização. Nenhuma entidade filha é liberada por essa policy.
- `project_accounts` — continua restrita a administradores (`has_role owner`), inclusive contra `project_share`.
- Todas as policies de `INSERT/UPDATE/DELETE` (`can_edit_project`, `can_edit_task`).
- `tasks`, `task_comments`, `task_attachments`, `task_status_history`, `task_shares`, `project_shares`, `companies`, `appointments`, `profiles`, `user_roles`, `user_permission_overrides`, `user_module_access`, `security_access_log`.
- Policies de `storage.objects` do bucket `task-files` (não redesenhadas).
- `has_permission`, overrides, proteção do último Administrador, triggers de auditoria e de atividade.

Nenhuma proteção foi afrouxada. Nenhum dado foi removido; nenhum reset de banco.

---

## 3. Matriz de menor privilégio

| Recurso | Sem vínculo | Task share | Project share (view) | Owner |
|---|---|---|---|---|
| Tarefa compartilhada | Negado | **Permitido** | Permitido | Permitido |
| Outras tarefas do projeto | Negado | **Negado** | Permitido | Permitido |
| Comentários / anexos da tarefa | Negado | Permitido (conforme nível) | Permitido | Permitido |
| Histórico de status da tarefa | Negado | Permitido | Permitido | Permitido |
| Projeto (contexto mínimo) | Negado | Permitido (leitura) | Permitido | Permitido |
| Edição do projeto | Negado | Negado | Negado | Permitido |
| `project_credits` | Negado | **Negado** | Permitido | Permitido |
| `project_emails` | Negado | **Negado** | Permitido | Permitido |
| `project_github_repos` | Negado | **Negado** | Permitido | Permitido |
| `project_lovable` | Negado | **Negado** | Permitido | Permitido |
| `project_prompts` | Negado | **Negado** | Permitido | Permitido |
| `project_links` | Negado | **Negado** | Permitido | Permitido |
| `project_custom_field_values` | Negado | **Negado** | Permitido | Permitido |
| `project_accounts` | Negado | **Negado** | **Negado** | Permitido |
| `audit_history` do projeto | Negado | **Negado** | Permitido | Permitido |

---

## 4. Testes executados

Mecanismo: execução SQL direta contra o banco, dentro de transação com `ROLLBACK`, assumindo `set local role authenticated`/`anon` com `request.jwt.claims.sub` do usuário testado — as policies foram avaliadas sob o papel esperado, **não** com `service_role` simulando usuário. Os usuários de teste foram criados como contas reais pela Auth Admin API e excluídos ao final (verificado: 0 remanescentes). Nenhuma migration artificial foi criada para elevar privilégio.

Suítes: `supabase/tests/rls_phase_0_2.sql` (existente), `supabase/tests/rls_bloco_1_menor_privilegio.sql`, `supabase/tests/storage_bloco_1_regressao.sql`.

### Autorização — 42 casos

| Teste | Perfil | Recurso | Operação | Esperado | Obtido | Resultado |
|---|---|---|---|---|---|---|
| 1 | Anônimo | projects | SELECT | 0 | 0 | PASS |
| 2 | Anônimo | tasks | SELECT | 0 | 0 | PASS |
| 3 | Sem vínculo | projects | SELECT | 0 | 0 | PASS |
| 4 | Sem vínculo | tasks | SELECT | 0 | 0 | PASS |
| 5 | Sem vínculo | project_credits | SELECT | 0 | 0 | PASS |
| 6 | Sem vínculo | audit_history (projeto) | SELECT | 0 | 0 | PASS |
| 7 | Sem vínculo | tasks do projeto | SELECT | 0 | 0 | PASS |
| 8 | Task share (view) | tarefa compartilhada | SELECT | 1 | 1 | PASS |
| 9 | Task share (view) | outra tarefa do projeto | SELECT | 0 | 0 | PASS |
| 10 | Task share (view) | projects (contexto mínimo) | SELECT | 1 | 1 | PASS |
| 11 | Task share (view) | tarefa compartilhada | UPDATE | 0 | 0 | PASS |
| 12 | Task share (view) | project_credits | SELECT | 0 | 0 | PASS |
| 13 | Task share (view) | project_emails | SELECT | 0 | 0 | PASS |
| 14 | Task share (view) | project_github_repos | SELECT | 0 | 0 | PASS |
| 15 | Task share (view) | project_lovable | SELECT | 0 | 0 | PASS |
| 16 | Task share (view) | project_prompts | SELECT | 0 | 0 | PASS |
| 17 | Task share (view) | project_links | SELECT | 0 | 0 | PASS |
| 18 | Task share (view) | project_accounts | SELECT | 0 | 0 | PASS |
| 19 | Task share (view) | project_custom_field_values | SELECT | 0 | 0 | PASS |
| 20 | Task share (view) | audit_history (projeto) | SELECT | 0 | 0 | PASS |
| 21 | Task share (edit) | tarefa compartilhada | UPDATE | 1 | 1 | PASS |
| 22 | Task share (edit) | task_status_history | SELECT | ≥1 | 1 | PASS |
| 23 | Task share (edit) | task_comments | INSERT | 1 | 1 | PASS |
| 24 | Task share (edit) | project_prompts | SELECT | 0 | 0 | PASS |
| 25 | Task share (edit) | project_credits | SELECT | 0 | 0 | PASS |
| 26 | Task share (edit) | projects | UPDATE | 0 | 0 | PASS |
| 27 | Project share (view) | projects | SELECT | 1 | 1 | PASS |
| 28 | Project share (view) | projects | UPDATE | 0 | 0 | PASS |
| 29 | Project share (view) | tasks do projeto (Kanban) | SELECT | 2 | 2 | PASS |
| 30 | Project share (view) | project_credits | SELECT | 1 | 1 | PASS |
| 31 | Project share (view) | project_emails | SELECT | 1 | 1 | PASS |
| 32 | Project share (view) | project_github_repos | SELECT | 1 | 1 | PASS |
| 33 | Project share (view) | project_lovable | SELECT | 1 | 1 | PASS |
| 34 | Project share (view) | project_prompts | SELECT | 1 | 1 | PASS |
| 35 | Project share (view) | project_links | SELECT | 1 | 1 | PASS |
| 36 | Project share (view) | project_accounts | SELECT | 0 | 0 | PASS |
| 37 | Owner | projects | SELECT/UPDATE | 1 | 1 | PASS |
| 38 | Owner | project_credits | SELECT | 1 | 1 | PASS |
| 39 | Owner | project_accounts | SELECT | 1 | 1 | PASS |
| 40 | Owner | audit_history (projeto) | SELECT | ≥1 | 1 | PASS |
| 41 | Grant individual `audit.view` | audit_history | SELECT | ≥1 | 2 | PASS |
| 42 | Deny individual `audit.view` | audit_history | SELECT | 0 | 0 | PASS |

**42/42 aprovados.** Um caso (nº 9) reprovou na primeira execução e motivou a segunda migration; reexecutado após a correção, aprovado.

A suíte da Fase 0.2 permanece registrada com 39/39; seus cenários equivalentes foram reexecutados nesta rodada com o mecanismo autenticado real acima.

### Storage — regressão (5 casos)

| Teste | Cenário | Esperado | Obtido | Resultado |
|---|---|---|---|---|
| S1 | bucket `task-files` privado | privado | privado | PASS |
| S2 | usuário com `task_share` acessa o objeto | permitido | permitido | PASS |
| S3 | usuário sem vínculo acessa o objeto | negado | negado | PASS |
| S4 | após revogação do compartilhamento | negado | negado | PASS |
| S5 | anônimo lista objetos | negado | negado | PASS |

URLs assinadas continuam temporárias (5 minutos) e só são geradas por quem passa pela policy de `SELECT`; a implementação não foi alterada.

### Regressão funcional

Sessão autenticada real no preview, navegando Dashboard, Empresas, Projetos (Cards/Tabela), Tarefas/Kanban, Agendamentos, Relatórios, Externos, Usuários e Permissões: todas renderizaram com o shell e os dados esperados, sem erro de console após a estabilização do servidor de desenvolvimento (os dois 500 iniciais foram do reload de otimização de dependências do Vite e não se reproduziram). Login, logout e persistência de sessão permanecem conforme a correção do incidente de autenticação. `build`/typecheck aprovados.

---

## 5. Segurança

| Item | Situação |
|---|---|
| RLS | Ativa em todas as tabelas de negócio; nenhuma policy afrouxada |
| RBAC | Íntegro (`has_permission`, papéis, `role_permissions`) |
| Overrides | Funcionais; deny individual prevalece (teste 42) |
| Storage | Bucket privado, isolamento por tarefa comprovado |
| Auth | Sem regressão; nada alterado em Auth ou `previewAuthStorage` |
| Auditoria | `audit_history` e `security_access_log` preservados; leitura de auditoria de projeto agora exige vínculo com o projeto |
| `.env` | **Continua rastreado** — pendência aberta (ver abaixo) |
| Linter | 12 avisos do tipo "SECURITY DEFINER executável por usuário autenticado" — intencionais: são exatamente os helpers de autorização usados pelas policies; possuem `search_path` fixo, retornam apenas booleano, não expõem dados e não são executáveis por `anon` |

### Riscos residuais

1. `.env` versionado (apenas URL do backend, project ID e chave pública/anon — sem segredo real; rotação não recomendada sem nova evidência).
2. Integrante da equipe do projeto (responsável/criador de tarefa) mantém acesso ao dossiê. Foi decisão consciente para não remover acesso legítimo já em uso; se a IGA desejar restringir o dossiê exclusivamente a `project_shares` e responsáveis pelo projeto, basta remover esse ramo de `can_view_project_dossier` (mudança de uma linha).
3. Tabela `projects` continua legível (linha inteira) por quem tem `task_share`. Atende ao contexto mínimo previsto no item 7, mas expõe campos como valor e datas do projeto. Recomenda-se avaliar, em bloco futuro, uma view/RPC de contexto mínimo com projeção de colunas.

---

## 6. Governança

**Dívida técnica remanescente**

- `.env` rastreado no HEAD.
- Projeção de colunas de `projects` para contexto mínimo (risco 3).
- Itens catalogados e **não** executados nesta rodada, por não pertencerem ao fechamento de segurança: categorias de links na UI; `last_activity_at` para comentários/anexos/agendamentos; auditoria de appointments/comentários/anexos/compartilhamentos; linha do tempo de prompts.

**Intervenção manual necessária**

O ambiente de execução não permite comandos Git que alterem o índice do repositório, portanto `git rm --cached .env` **não pôde ser executado aqui**. `.gitignore` já contém `.env`, `.env.*` e `!.env.example`, e `.env.example` permanece versionado sem segredos. Nenhuma variável foi transferida para o código-fonte.

Comando a executar externamente, no clone do repositório oficial:

```bash
git rm --cached .env
git commit -m "chore(security): deixa de versionar .env (Fase 0 / Bloco 1)"
git push
```

Não reescrever histórico. Após esse commit, confirmar com `git ls-files | grep -x .env` (deve retornar vazio).

---

## 7. Conclusão

Todos os critérios do item 14 foram atendidos, **exceto** o primeiro: o `.env` ainda consta no HEAD do repositório.

Portanto:

> **FASE 0 PERMANECE NÃO HOMOLOGÁVEL** — pendência única e exclusivamente o `.env` rastreado, que depende de execução manual do comando acima.

Assim que o `.env` deixar de constar no HEAD, com os demais critérios já comprovados nesta rodada (menor privilégio, `project_share` preservado, RLS/RBAC/overrides íntegros, Auth sem regressão, Storage privado, testes negativos aprovados, suíte de segurança executada com sessão autenticada real, build/typecheck aprovados e nenhuma funcionalidade posterior iniciada), a Fase 0 poderá ser declarada **tecnicamente homologável**.

Desenvolvimento interrompido. Bloco 2 não iniciado.
