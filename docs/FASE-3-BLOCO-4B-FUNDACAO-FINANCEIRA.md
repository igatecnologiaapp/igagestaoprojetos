# FASE 3 / BLOCO 4B — Fundação da Gestão Financeira Tecnológica

- **Projeto:** Sistema Gestão de Projetos — IGA Tecnologia
- **Repositório:** igatecnologiaapp/igagestaoprojetos
- **Commit-base autorizado:** `07c2fffe2e17f05367d78e315e9c4f10d16a95e1`
- **SHA local ao encerrar o bloco:** `464d9702b31c3ae40d621d4787b4aaa5b0adce1b`
- **Escopo:** somente fundação (fornecedores, categorias, serviços). Nenhum custo, rateio, orçamento, alerta ou dashboard foi criado.

---

## 1. Migrations aplicadas

| Migration | Conteúdo |
|---|---|
| `20260902025710_41395cfb-b3d6-465b-a127-05213bb970f4.sql` | Enums, tabelas `finance_vendors`, `finance_categories`, `finance_services`, grants, RLS, índices, constraints, triggers de auditoria/updated_at/last_activity e seeds idempotentes de categorias |
| `20260903091510_e1f4bf57-8a99-41c0-91b8-901bb9f165fc.sql` | Revogação de `EXECUTE` de `touch_project_activity_via_finance_service()` para `PUBLIC`, `anon` e `authenticated` |

Nenhuma migration alterou `projects.value`, `project_credits`, Auth, Storage ou RBAC existente.

## 2. Enums criados

- `finance_recurrence`: `monthly`, `quarterly`, `semiannual`, `annual`, `one_off`
- `finance_service_status`: `active`, `paused`, `cancelled`, `expired`
- `finance_entity_status`: `active`, `inactive`

## 3. Tabelas

### 3.1 `finance_vendors`
Campos: `id`, `name`, `legal_name`, `document`, `website`, `contact_name`, `contact_email`, `contact_phone`, `default_currency`, `status` (`finance_entity_status`), `notes`, `created_by`, `created_at`, `updated_at`.

- Índice único `uq_finance_vendors_name` sobre `lower(btrim(name))` (impede fornecedor duplicado por nome normalizado).
- Constraints: nome não vazio, moeda com 3 caracteres, documento opcional.
- Não reutiliza `companies`; não armazena credenciais, senhas, tokens ou chaves.

### 3.2 `finance_categories`
Campos: `id`, `name`, `slug`, `parent_id` (auto-FK `ON DELETE SET NULL`), `kind`, `active`, `position`, `created_at`, `updated_at`.

- Único: `uq_finance_categories_slug`.
- `kind` restrito a `infra | dev | ai | service | other`; check impedindo auto-parent.
- Seeds idempotentes (9): Infraestrutura, Plataforma de Desenvolvimento, Banco de Dados, Hospedagem/Cloud, Domínios, Inteligência Artificial, APIs e Integrações, Serviços de Terceiros, Outros.

### 3.3 `finance_services`
Campos: `id`, `vendor_id` (obrigatório, `ON DELETE RESTRICT`), `category_id`, `name`, `description`, `plan`, `recurrence`, `amount`, `currency`, `billing_day`, `contracted_at`, `renews_at`, `expires_at`, `auto_renew`, `status`, `project_account_id`, `default_project_id`, `is_shared`, `notes`, `created_by`, `created_at`, `updated_at`.

- Constraints: `amount >= 0`, `billing_day` entre 1 e 31, moeda com 3 caracteres, coerência entre datas de contratação/expiração.
- Nenhum lançamento financeiro é gerado automaticamente.

## 4. Segurança (RLS / RBAC)

- Reutiliza exclusivamente as permissões existentes `financial.view` e `financial.edit` — nenhum RBAC paralelo foi criado.
- Leitura global exige `financial.view`; anônimos não leem nada.
- `finance_services` permite leitura complementar a quem já pode ver o dossiê do projeto vinculado (`can_view_project_dossier`), sem liberar consolidação financeira.
- Escrita (inserir/atualizar) exige `financial.edit`; exclusão física restrita a `owner`.
- Nenhuma policy usa `USING (true)`.
- `touch_project_activity_via_finance_service()` é `SECURITY DEFINER` com `search_path` fixo e execução revogada de `PUBLIC`/`anon`/`authenticated`.

## 5. Auditoria e última atividade

- As três tabelas utilizam os gatilhos de auditoria existentes (`log_audit()` → `audit_history`), cobrindo criação, alteração de valor, fornecedor, categoria, recorrência e status.
- Serviços vinculados a projeto atualizam `projects.last_activity_at`; leituras não geram ruído.

## 6. Interface e navegação

- Novas telas: `src/routes/finance/vendors.tsx`, `src/routes/finance/categories.tsx`, `src/routes/finance/services.tsx` — listar, buscar, criar, editar e ativar/desativar, sem exclusão física de registros referenciados.
- `src/components/app-shell.tsx`: itens Fornecedores, Categorias e Serviços adicionados dentro do grupo já existente “Governança e Controle”, com exibição condicionada a `financial.view`. A organização do menu não foi reorganizada.

## 7. Testes executados (fechamento DT-05)

Banco hospedado disponível. Resultados:

### 7.1 Estrutura, RLS e políticas (consultas de catálogo)
Aprovados: 1.1–1.9, 1.11–1.15 e 3.10–3.14.
- As três tabelas existem; `finance_costs`, `finance_cost_allocations` e `finance_budgets` **não** existem (escopo respeitado).
- Enums com 5/4/2 valores; RLS habilitada nas três tabelas; nenhuma policy com `USING (true)`.
- Índices únicos, triggers de auditoria/atividade, 9 categorias seed e as permissões `financial.view`/`financial.edit` confirmados.
- Leitura exige `financial.view`; serviços aceitam também `can_view_project_dossier`; escrita exige `financial.edit`; exclusão exige `owner`; nenhuma policy para `anon`.
- **1.10 inconclusivo:** `information_schema.role_table_grants` não retorna linhas para o usuário de leitura. Verificação direta em `pg_class.relacl` mostra `authenticated` e `service_role` com privilégios — e também `anon`, herdado do padrão do projeto. Como não há policy para `anon`, a leitura anônima permanece bloqueada pela RLS. **Recomendação registrada como DT-06** (revogar o grant de tabela para `anon` nas três tabelas), sem execução por não estar autorizada neste bloco.

### 7.2 CRUD, constraints, auditoria e última atividade
Checks 2.1 a 2.26 aprovados: criação/edição de fornecedor, bloqueio de duplicidade por nome normalizado, nome em branco recusado, documento opcional, slug único, categoria pai, `kind` inválido recusado, desativação, criação de serviço com vínculos opcionais a projeto e conta, fornecedor obrigatório, valor negativo, dia de cobrança e datas incoerentes recusados, recorrência restrita ao enum, mudança de status, exclusão física de fornecedor referenciado bloqueada, auditoria de criação/alteração (inclusive de valor) e atualização de `projects.last_activity_at`.

**Limitação metodológica:** a suíte `supabase/tests/bloco_4b_fundacao_financeira.sql` não pôde ser executada integralmente em transação com `ROLLBACK` pelo terminal: o usuário disponível (`sandbox_exec`) recebe `permission denied for schema auth` ao montar as fixtures e não pode `SET ROLE anon` nem executar `has_role`/`has_permission`. Os mesmos checks foram executados por outro caminho e os registros temporários foram removidos ao final (fornecedores, categoria, serviço e respectivas linhas de auditoria). Permanecem apenas as 9 categorias seed.

### 7.3 Validação funcional autenticada (navegador)
Sessão real de administrador, sem alterar RLS.
- Desktop 1280: `/dashboard`, `/projects`, `/tasks`, `/appointments`, `/reports`, `/companies` e as três telas financeiras carregam sem erro de console e sem rolagem horizontal (regressão OK).
- Fornecedores: criar, buscar, editar, desativar e reativar — todos aprovados; duplicidade por nome bloqueada com aviso.
- Categorias: seeds listadas com categoria pai e slug; criar e editar aprovados.
- Serviços: criação vinculada a fornecedor com valor e periodicidade aprovada; valor exibido formatado.
- Mobile 390×844: as três telas sem estouro horizontal.
- Todos os registros criados nos testes de tela foram removidos.

### 7.4 Correção pontual aplicada
Mensagens de erro de duplicidade em Fornecedores e Categorias passaram a exibir texto legível em vez do erro técnico do banco. Nenhuma regra de negócio, policy ou schema foi alterada.

## 8. Pendências / débitos técnicos

- **DT-05:** concluída no que é executável neste ambiente (estrutura, RLS, CRUD, constraints, auditoria, última atividade, telas desktop e mobile, regressões). Ressalva registrada: a suíte SQL oficial não roda ponta a ponta pelo usuário restrito do terminal.
- **DT-06 (nova):** revogar `GRANT` de tabela para `anon` em `finance_vendors`, `finance_categories` e `finance_services`. Risco atual mitigado pela RLS (nenhuma policy para `anon`). Aguarda autorização.
- **DT-07 (menor):** rótulos dos formulários financeiros não estão associados aos campos (`htmlFor`/`id`), o que reduz acessibilidade. Aguarda autorização.
- Avisos de linter remanescentes (14) referem-se a funções `SECURITY DEFINER` preexistentes ao Bloco 4B.

## 9. Arquivos alterados

- `supabase/migrations/20260902025710_*.sql`
- `supabase/migrations/20260903091510_*.sql`
- `supabase/tests/bloco_4b_fundacao_financeira.sql`
- `src/routes/finance/vendors.tsx`
- `src/routes/finance/categories.tsx`
- `src/routes/finance/services.tsx`
- `src/components/app-shell.tsx`
- `docs/FASE-3-BLOCO-4B-FUNDACAO-FINANCEIRA.md`

## 10. Encerramento

Desenvolvimento **parado**. Nenhuma estrutura de custos, rateios, orçamento, alertas ou dashboard foi iniciada. Bloco 4C não iniciado. Aguardando homologação expressa do fechamento do Bloco 4B / DT-05 e decisão sobre DT-06 e DT-07.

---

## Atualização — fechamento de DT-06 e DT-07 (rodada 4B.1)

- **DT-06 — RESOLVIDA.** Migration incremental revogou todos os privilégios de tabela
  de `anon` em `finance_vendors`, `finance_categories` e `finance_services`,
  preservando `authenticated`, `service_role`, policies, `financial.view`,
  `financial.edit` e `can_view_project_dossier`. Verificado em `pg_class.relacl`:
  `anon` não aparece mais em nenhuma das três tabelas. Auth e Storage não alterados.
- **DT-07 — RESOLVIDA.** Todos os rótulos das telas Fornecedores, Categorias e
  Serviços passaram a usar `htmlFor` com o `id` correspondente do campo
  (`Input`, `Textarea`, `SelectTrigger`); filtros sem rótulo visível receberam
  `aria-label`. Nenhuma tela foi redesenhada.

Detalhamento completo, incluindo a entrega do Resumo Gerencial, em
`docs/BLOCO-4B-1-RESUMO-GERENCIAL-PROJETO.md`.
