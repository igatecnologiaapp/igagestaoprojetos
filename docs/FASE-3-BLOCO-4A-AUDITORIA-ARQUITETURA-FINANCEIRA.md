# FASE 3 / BLOCO 4A — Auditoria e Arquitetura da Gestão Financeira Tecnológica

Projeto: Sistema Gestão de Projetos — IGA Tecnologia
Repositório: igatecnologiaapp/igagestaoprojetos
Commit-base: 99e59300852db98587d858d11b6abefc828a76ed
Status: **AUDITORIA — NENHUMA ESTRUTURA CRIADA OU ALTERADA**

> Nenhuma tabela, migration, policy, dado, rota, item de menu ou componente foi criado ou modificado nesta rodada. Este documento é exclusivamente analítico e propositivo.

---

## 1. Estruturas existentes encontradas

### 1.1 Banco de dados (schema `public`)

| Estrutura | Conteúdo relevante ao financeiro |
|---|---|
| `projects` | `value numeric`, `start_date`, `end_date`, `status`, `company_id`, `owner_id`, `last_activity_at` |
| `companies` | cadastro de clientes (CNPJ, contato, endereço) — **cliente, não fornecedor** |
| `project_credits` | `entry_date date`, `amount numeric`, `description`, `notes`, `project_id` — lançamento simples de crédito por projeto |
| `project_accounts` | `platform`, `url`, `username`, `email`, `notes` — contas em plataformas (Lovable, GitHub etc.) |
| `project_lovable` | `account_email`, `project_url`, `workspace` — conta Lovable do projeto |
| `project_github_repos` | repositório do projeto |
| `project_emails`, `project_links` | contatos/links auxiliares |
| `project_custom_field_definitions` / `_values` | campos personalizados, inclui tipo `currency` |
| `task_attachments` | anexos (arquivo em bucket privado `task-files` ou link) — **hoje amarrado a `task_id`** |
| `audit_history` | `entity_type`, `entity_id`, `action`, `changes jsonb`, `changed_by`, `changed_at` — via trigger genérico `log_audit()` |
| `security_access_log` | trilha de acesso sensível |
| `app_permissions` / `role_permissions` / `user_permission_overrides` | RBAC granular; **já contém `financial.view` e `financial.edit`** |
| `user_module_access` + enum `app_module` | gating de módulos: `companies, projects, tasks, appointments, reports` |
| `project_shares`, `task_shares` | compartilhamento com permissão `view/comment/edit` |

### 1.2 Funções canônicas reutilizáveis

`can_view_project`, `can_view_project_dossier`, `can_edit_project`, `can_edit`, `has_permission`, `has_role`, `touch_project_activity`, `log_audit`, `set_updated_at`.

### 1.3 Frontend

- Dossiê do projeto: `src/components/project-detail.tsx` (abas: Visão, GitHub/Lovable, Créditos, Prompts, Governança, Histórico…)
- `src/components/audit-history.tsx` — histórico reaproveitável para qualquer `entity_type`
- `src/components/app-shell.tsx` — menu em grupos (Visão geral, Organização, Gestão de projetos, Governança e controle, Partes interessadas, Configurações)
- `src/routes/reports.tsx` — relatórios e exportação PDF (jsPDF)

---

## 2. Classificação por necessidade

| Necessidade | Situação | Classificação |
|---|---|---|
| Categorias de custos | inexistente (só `platform` texto livre em `project_accounts`) | **NOVO → PROPOR** |
| Fornecedores | inexistente; `companies` = clientes; `project_accounts.platform` é texto livre | **NOVO → PROPOR** |
| Serviços tecnológicos | parcial (`project_accounts`, `project_lovable`, `project_github_repos` descrevem serviços por projeto, sem catálogo nem custo) | **EXISTENTE PARCIALMENTE → EVOLUIR (referenciar, não substituir)** |
| Despesas/custos | parcial (`project_credits` = lançamento de valor por projeto, sem fornecedor/categoria/recorrência) | **EXISTENTE PARCIALMENTE → EVOLUIR** |
| Custos recorrentes | inexistente | **NOVO → PROPOR** |
| Custos eventuais | atendido conceitualmente por `project_credits` (mas sem tipificação) | **EXISTENTE PARCIALMENTE → EVOLUIR** |
| Custos previstos (orçamento) | parcial (`projects.value` = valor do contrato/receita, não orçamento de custo) | **NOVO → PROPOR** |
| Custos realizados | parcial (`project_credits.amount`) | **EXISTENTE PARCIALMENTE → EVOLUIR** |
| Alocação por projeto | apenas 1:1 (`project_credits.project_id`) | **NOVO → PROPOR (N:N)** |
| Datas de contratação/vencimento/renovação | inexistente | **NOVO → PROPOR** |
| Periodicidade | inexistente | **NOVO → PROPOR (enum)** |
| Status | padrão existente (enums por entidade) | **EXISTENTE → MANTER padrão / novo enum específico** |
| Valores | `numeric` já é o padrão do projeto | **EXISTENTE → MANTER** |
| Histórico de valores | reutilizável via `audit_history` (`changes jsonb`) | **EXISTENTE → MANTER** |
| Observações | padrão `notes text` presente em todas as tabelas | **EXISTENTE → MANTER** |
| Anexos/comprovantes | `task_attachments` + bucket privado existem, mas com FK obrigatória para `tasks` | **EXISTENTE PARCIALMENTE → EVOLUIR (bloco posterior)** |
| Importação de faturas, OCR, APIs de fornecedor, alertas, projeções, dashboards executivos, Health Score | — | **FUTURO → NÃO IMPLEMENTAR** |

---

## 3. Lacunas reais

1. Não existe entidade **fornecedor** (vendor) — `companies` representa clientes; misturar as duas quebraria RLS, relatórios e o módulo Organização.
2. Não existe **catálogo de serviços/assinaturas** com ciclo de vida (contratação, renovação, cancelamento).
3. Não existe **taxonomia de categorias** de custo.
4. Não existe **recorrência** nem geração de competências.
5. Não existe **rateio N:N** entre projetos.
6. Não existe **orçamento previsto de custo** por projeto/categoria/período (`projects.value` é receita contratada).
7. `project_credits` não tem tipo, moeda, fornecedor, categoria, competência nem status.

---

## 4. Redundâncias a evitar (obrigatório)

- **Não** criar "empresas fornecedoras" dentro de `companies`.
- **Não** criar nova tabela de anexos financeiros: evoluir a estrutura de anexos existente com FK polimórfica controlada ou tabela irmã reutilizando o bucket privado e as regras de URL assinada de 5 min.
- **Não** criar tabela de histórico de valores: `audit_history` + trigger `log_audit()` já cobre.
- **Não** criar novo mecanismo de compartilhamento: `project_shares` + `can_view_project` já definem o alcance.
- **Não** criar tabela paralela de "serviços do projeto" que duplique `project_accounts` / `project_lovable` / `project_github_repos`; o serviço financeiro deve poder **referenciar** opcionalmente uma conta existente.
- **Não** inflar `projects` com colunas financeiras — usar views/agregações.
- **Não** materializar lançamentos futuros de recorrência em massa.

---

## 5. Modelo de dados recomendado (proposta — não implementado)

Cadeia conceitual: **Fornecedor → Serviço/Recurso → Custo (competência) → Alocação → Projeto**

```text
finance_vendors ──1:N── finance_services ──1:N── finance_costs ──1:N── finance_cost_allocations ──N:1── projects
       │                       │                      │
finance_categories ────────────┴──────────────────────┘
finance_budgets ── (projeto | categoria | período)
```

### 5.1 `finance_vendors`
- **Finalidade:** fornecedor de tecnologia/serviço (Lovable, Supabase, GitHub, VPS, registrador de domínio, prestador PJ).
- **Campos:** `id uuid pk`, `name text not null`, `legal_name text`, `document text` (CNPJ/CPF), `website text`, `contact_name text`, `contact_email text`, `contact_phone text`, `default_currency text default 'BRL'`, `status finance_entity_status not null default 'active'`, `notes text`, `created_by uuid`, `created_at`, `updated_at`.
- **FKs:** `created_by → auth.users(id)`.
- **Índices:** `unique (lower(name))`; `idx_finance_vendors_status`.
- **Constraints:** `name` não vazio; `default_currency` char(3).
- **RLS prevista:** SELECT para `has_permission(auth.uid(),'financial.view')`; INSERT/UPDATE/DELETE para `financial.edit`.
- **Por que não reutilizar:** `companies` é a entidade cliente, ligada a `projects.company_id`, RLS de visibilidade por projeto e ao módulo Organização; usá-la para fornecedores contaminaria listas, relatórios e permissões.

### 5.2 `finance_categories`
- **Finalidade:** taxonomia de custo (Infraestrutura, Plataforma de desenvolvimento, Banco de dados, Domínios, IA, Serviços terceiros…).
- **Campos:** `id uuid pk`, `name text not null`, `slug text not null`, `parent_id uuid null` (hierarquia rasa), `kind text` (`infra|dev|ai|service|other`), `active boolean default true`, `position int default 0`, `created_at`, `updated_at`.
- **FKs:** `parent_id → finance_categories(id) on delete set null`.
- **Índices:** `unique(slug)`, `idx_finance_categories_parent`.
- **RLS:** leitura para `financial.view`; escrita para `financial.edit` (ou owner).
- **Por que não reutilizar:** não há tabela de taxonomia; `project_custom_field_definitions` é metadado de formulário de projeto, semântica distinta.

### 5.3 `finance_services`
- **Finalidade:** contrato/assinatura/recurso contratado de um fornecedor (o "o quê" que gera custo).
- **Campos:** `id uuid pk`, `vendor_id uuid not null`, `category_id uuid`, `name text not null`, `description text`, `plan text`, `recurrence finance_recurrence not null default 'monthly'`, `amount numeric(14,2)`, `currency text default 'BRL'`, `billing_day smallint`, `contracted_at date`, `renews_at date`, `expires_at date`, `auto_renew boolean default true`, `status finance_service_status default 'active'`, `project_account_id uuid null` (vínculo opcional ao cadastro já existente), `default_project_id uuid null`, `is_shared boolean default false`, `notes text`, `created_by`, `created_at`, `updated_at`.
- **FKs:** `vendor_id → finance_vendors`, `category_id → finance_categories`, `project_account_id → project_accounts(id) on delete set null`, `default_project_id → projects(id) on delete set null`.
- **Índices:** `idx_finance_services_vendor`, `idx_finance_services_renews_at`, `idx_finance_services_status`.
- **Constraints:** `amount >= 0`; `billing_day between 1 and 31`; `expires_at >= contracted_at`.
- **RLS:** `financial.view` / `financial.edit`; serviços com `default_project_id` também visíveis a quem tem `can_view_project_dossier`.
- **Por que não reutilizar:** `project_accounts` descreve credencial/plataforma por projeto, sem fornecedor, valor, recorrência ou ciclo de vida — e é 1:1 com projeto, incompatível com serviço compartilhado.

### 5.4 `finance_costs` (lançamento realizado / competência)
- **Finalidade:** valor efetivamente devido/pago em uma competência.
- **Campos:** `id uuid pk`, `service_id uuid null`, `vendor_id uuid null`, `category_id uuid null`, `description text not null`, `cost_type finance_cost_type not null` (`recurring|one_off`), `competence_month date` (dia 1 da competência), `due_date date`, `paid_at date`, `amount numeric(14,2) not null`, `currency text default 'BRL'`, `fx_rate numeric(12,6)`, `amount_base numeric(14,2)` (BRL), `status finance_cost_status default 'planned'` (`planned|open|paid|cancelled`), `is_shared boolean default false`, `notes text`, `created_by`, `created_at`, `updated_at`.
- **Índices:** `idx_finance_costs_competence`, `idx_finance_costs_service`, `idx_finance_costs_status`, `unique (service_id, competence_month) where service_id is not null and cost_type='recurring'` (evita duplicidade de competência).
- **Constraints:** `amount >= 0`; `paid_at` obrigatório quando `status='paid'` (CHECK).
- **RLS:** `financial.view` para consolidado; custos alocados a projeto visíveis via EXISTS em `finance_cost_allocations` + `can_view_project`.
- **Por que não reutilizar `project_credits`:** ele é 1:1 com projeto, sem fornecedor/categoria/status/competência/moeda, e já é usado no dossiê com semântica de créditos de plataforma. Evoluí-lo forçaria migração de semântica e quebraria o histórico homologado. Recomendação: **manter `project_credits` como está** e, no bloco de implementação, exibi-lo como fonte legada dentro da aba financeira (opcionalmente com script de correlação, não de exclusão).

### 5.5 `finance_cost_allocations` (rateio N:N)
- **Finalidade:** distribuir um custo entre projetos.
- **Campos:** `id uuid pk`, `cost_id uuid not null`, `project_id uuid not null`, `percentage numeric(6,3)`, `amount numeric(14,2)`, `created_by`, `created_at`.
- **FKs:** `cost_id → finance_costs on delete cascade`, `project_id → projects on delete cascade`.
- **Índices:** `unique(cost_id, project_id)`, `idx_alloc_project`.
- **Constraints:** `percentage between 0 and 100`; validação de soma ≤ 100 por trigger.
- **RLS:** visível a quem tem `financial.view` ou `can_view_project(project_id)`.
- **Por que nova tabela:** não existe qualquer estrutura N:N entre valor e projeto; colocar percentuais em colunas de `finance_costs` seria inextensível.

### 5.6 `finance_budgets` (previsto)
- **Finalidade:** orçamento previsto por projeto e/ou categoria em um período.
- **Campos:** `id uuid pk`, `project_id uuid null`, `category_id uuid null`, `period_start date not null`, `period_end date not null`, `amount numeric(14,2) not null`, `notes text`, `created_by`, `created_at`, `updated_at`.
- **Índices:** `unique(project_id, category_id, period_start, period_end)`, `idx_budgets_project`.
- **Constraints:** `period_end >= period_start`; pelo menos um entre `project_id`/`category_id` preenchido.
- **RLS:** `financial.view` / `financial.edit`; por projeto via `can_view_project`.

### 5.7 Enums propostos
`finance_recurrence` (`monthly|quarterly|semiannual|annual|one_off`), `finance_cost_type` (`recurring|one_off`), `finance_cost_status` (`planned|open|paid|cancelled`), `finance_service_status` (`active|paused|cancelled|expired`), `finance_entity_status` (`active|inactive`).

### 5.8 Views (sem colunas novas em `projects`)
- `v_project_financial_summary`: por projeto — custo mensal corrente, acumulado, previsto, realizado, diferença.
- `v_project_upcoming_renewals`: serviços com `renews_at` nos próximos 60 dias, por projeto.

---

## 6. Estratégia de recorrência

Regra: **a recorrência é uma definição, não milhares de linhas.**

1. `finance_services` guarda a regra (`recurrence`, `amount`, `billing_day`, `renews_at`, `auto_renew`, `status`).
2. `finance_costs` guarda apenas competências **materializadas sob demanda**: geradas quando o período chega (ou quando o usuário confirma/edita o valor), com unicidade `(service_id, competence_month)`.
3. Projeções futuras são **calculadas** (view/função `finance_project_forecast(project_id, from, to)`), nunca gravadas.
4. Materialização em lote (se necessária) fica para bloco posterior, via função server-side idempotente, jamais em page load.

---

## 7. Previsto × Realizado

- **Previsto:** `finance_budgets` (explícito) + projeção derivada de `finance_services` para períodos sem orçamento.
- **Realizado:** `finance_costs` com `status in ('open','paid')`, convertido para `amount_base`, ponderado pela alocação.
- **Diferença:** `previsto - realizado`, agregado por projeto, categoria, fornecedor e período (mês/trimestre/ano) em views SQL, consumidas por `useSuspenseQuery`.

---

## 8. Alocação entre projetos

- Custo não compartilhado: 1 linha em `finance_cost_allocations` com 100%.
- Custo compartilhado (VPS R$500 → A 40%, B 35%, C 25%): 3 linhas; `amount` derivado do percentual e congelado no lançamento para preservar histórico.
- Rateio padrão pode ser herdado do serviço (template de alocação em bloco posterior).
- Soma > 100% bloqueada por trigger; sobra (< 100%) tratada como custo overhead não alocado, visível apenas no consolidado.

---

## 9. Integração com o dossiê do projeto

- Nova aba **"Financeiro"** em `src/components/project-detail.tsx`, ao lado de Créditos/Governança — sem alterar `projects`.
- Conteúdo: cards (custo mensal, acumulado, previsto, realizado, diferença), principais fornecedores, próximas renovações, tabela de custos alocados e histórico (reuso de `audit-history.tsx`).
- A aba existente **Créditos** permanece intacta.
- Dados vindos das views do item 5.8 — uma query por aba, sem sobrecarregar a listagem de projetos.

---

## 10. Estratégia de RLS/RBAC (a aplicar apenas em bloco futuro)

Permissões `financial.view` e `financial.edit` **já existem** em `app_permissions` (categoria `financial`) e `financial.view` já está atribuída a `collaborator`. Proposta:

| Ação | Regra |
|---|---|
| Visualizar custos do próprio projeto | `can_view_project(project_id)` via allocation |
| Visualizar custos de outros projetos | `has_permission(uid,'financial.view')` |
| Visualizar consolidado (fornecedores, categorias, totais) | `has_permission(uid,'financial.view')` |
| Cadastrar / editar | `has_permission(uid,'financial.edit')` |
| Excluir / cancelar | `owner` ou `financial.delete` (nova chave a propor) |
| Fornecedores e categorias (catálogo global) | leitura `financial.view`; escrita `financial.edit` |

Complementos previstos (bloco futuro, não agora): chave `financial.delete`, valor `financial` no enum `app_module` para o gating de menu, e funções `SECURITY DEFINER` `can_view_cost(_cost_id,_user)` / `can_edit_finance(_user)` — sempre `SET search_path = public` e sem recursão (lição do DT-04: policies de `finance_costs` ↔ `finance_cost_allocations` devem passar por função definer, nunca por subquery mútua).

---

## 11. Estratégia de auditoria

Reutilização integral: anexar o trigger genérico `log_audit()` às tabelas financeiras, com `entity_type` = `finance_vendors|finance_services|finance_costs|finance_cost_allocations|finance_budgets`. Isso cobre criação, alteração de valor, troca de fornecedor, mudança de recorrência, cancelamento e alteração de alocação (tudo em `changes jsonb`). Também estender a lista de `entity_type` autorizada na policy de leitura de `audit_history` e acoplar `touch_project_activity` via alocação, para que lançamento financeiro atualize `projects.last_activity_at`. **Nenhum sistema paralelo de histórico.**

---

## 12. Menu (apenas indicação)

Quando implementado, a Gestão Financeira entra no grupo **"Governança e controle"** de `src/components/app-shell.tsx`, com itens:
- `Financeiro` (`/finance`) — visão consolidada
- `Fornecedores` (`/finance/vendors`)
- `Categorias` (`/finance/categories`) — dentro de Configurações

Gating por módulo `financial` + permissão `financial.view`. **Nada foi adicionado ao menu nesta rodada.**

---

## 13. Impacto estimado no frontend

| Item | Esforço |
|---|---|
| Rotas `/finance`, `/finance/vendors` (+ diálogos CRUD) | Alto |
| Aba Financeiro no dossiê | Médio |
| Componente de rateio (percentual/valor com validação de 100%) | Médio |
| Cards de previsto × realizado e gráficos | Médio |
| Extensão de `reports.tsx` (PDF financeiro) | Baixo/Médio |
| Item de menu + gating | Baixo |

---

## 14. Migrations que seriam necessárias posteriormente

1. Enums financeiros.
2. `finance_categories` + `finance_vendors` (GRANTs, RLS, políticas, `set_updated_at`).
3. `finance_services` (FKs, índices, RLS).
4. `finance_costs` + `finance_cost_allocations` (RLS via funções definer, trigger de soma ≤ 100%).
5. `finance_budgets`.
6. Triggers `log_audit` + `touch_project_activity` e extensão da policy de `audit_history`.
7. Views de resumo e renovações.
8. RBAC: `financial.delete`, `role_permissions` e valor `financial` em `app_module`.
9. Seeds mínimos de categorias.
10. Testes SQL `supabase/tests/rls_finance.sql`.

---

## 15. Riscos técnicos

| Risco | Mitigação |
|---|---|
| Recursão de RLS entre `finance_costs` e `finance_cost_allocations` (repetir DT-04) | funções `SECURITY DEFINER` unilaterais + testes SQL antes de liberar |
| Duplicidade conceitual fornecedor × cliente | separação estrita `companies` ≠ `finance_vendors` |
| Explosão de linhas por recorrência | materialização sob demanda + projeção calculada |
| Divergência de arredondamento no rateio | `numeric(14,2)`, congelar `amount` por alocação, ajuste de centavos na maior cota |
| Multimoeda | `currency` + `fx_rate` + `amount_base` desde o início, mesmo que só BRL seja usado |
| Vazamento financeiro a colaboradores/externos | `financial.view` fora dos papéis `viewer` e de compartilhamentos externos |
| Peso no dossiê | dados via views agregadas, carregadas apenas na aba |

---

## 16. Proposta de divisão dos próximos blocos

- **4B — Fundação financeira (schema):** enums, `finance_categories`, `finance_vendors`, `finance_services`, RLS, auditoria, testes SQL.
- **4C — Lançamentos e rateio:** `finance_costs`, `finance_cost_allocations`, triggers, testes.
- **4D — Previsto × realizado:** `finance_budgets`, views, funções de projeção.
- **4E — Frontend catálogo:** rotas de fornecedores/serviços/categorias + menu + gating.
- **4F — Dossiê financeiro:** aba Financeiro no projeto, cards e histórico.
- **4G — Relatórios e exportação:** extensão de `/reports` com PDF financeiro.
- **4H — Homologação:** validação mobile 390×844, testes RLS consolidados, relatório final da Fase 3.
- **Futuro (não autorizado):** importação de faturas, OCR, APIs de fornecedores, alertas de vencimento/renovação, automações, dashboards executivos, Health Score.

---

## 17. Encerramento

Auditoria concluída. Nenhuma estrutura financeira foi implementada. **Desenvolvimento parado, aguardando homologação expressa para iniciar o Bloco 4B.**
