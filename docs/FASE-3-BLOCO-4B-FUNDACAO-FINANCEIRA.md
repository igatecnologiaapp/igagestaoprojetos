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

## 7. Testes

- Suíte criada: `supabase/tests/bloco_4b_fundacao_financeira.sql` (transação com `ROLLBACK`), com 53 verificações: estrutura, enums, RLS, grants, índices, triggers, seeds, CRUD, constraints, auditoria, `last_activity_at`, acesso anônimo e negação por permissão.
- Compilação da aplicação: **OK** (sem erros de build/tipos).
- **Execução da suíte SQL e validação no navegador: PENDENTES.** O banco hospedado está pausado neste momento, o que impede conexão para executar os testes e realizar o login autenticado nas telas financeiras.

## 8. Pendências / débitos técnicos

- **DT-05:** executar `supabase/tests/bloco_4b_fundacao_financeira.sql` e a validação de interface (desktop 1280 e mobile 390×844) assim que o banco hospedado for retomado.
- Avisos de linter remanescentes (14) referem-se a funções `SECURITY DEFINER` preexistentes ao Bloco 4B, já mapeadas em blocos anteriores.

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

Desenvolvimento **parado**. Nenhuma estrutura de custos, rateios, orçamento ou dashboard foi iniciada. Bloco 4C não iniciado. Aguardando homologação expressa e a retomada do banco hospedado para concluir as validações pendentes.
