# BLOCO 4B.1 — CENTRAL GERENCIAL DO PROJETO (Resumo Gerencial)

Projeto: Sistema Gestão de Projetos — IGA Tecnologia
Repositório: igatecnologiaapp/igagestaoprojetos
Commit-base autorizado: 5b63eae272f3de2e4722dd781f218a208232c13c

Escopo executado: DT-06, DT-07 e Bloco 4B.1 (Resumo Gerencial dentro do Dossiê do Projeto).
Bloco 4C **não** iniciado. Nenhuma estrutura de `finance_costs`, `finance_cost_allocations`
ou `finance_budgets` foi criada.

---

## 1. DT-06 — Menor privilégio nas tabelas financeiras

Migration incremental executada:

```sql
REVOKE ALL ON public.finance_vendors    FROM anon;
REVOKE ALL ON public.finance_categories FROM anon;
REVOKE ALL ON public.finance_services   FROM anon;
-- reafirmação explícita dos papéis mantidos
GRANT SELECT, INSERT, UPDATE, DELETE ON <as três tabelas> TO authenticated;
GRANT ALL ON <as três tabelas> TO service_role;
```

Validação (`pg_class.relacl`) após a migration:

```
finance_categories | {postgres=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm, sandbox_exec=ar}
finance_services   | {postgres=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm, sandbox_exec=ar}
finance_vendors    | {postgres=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm, sandbox_exec=ar}
```

`anon` não possui mais nenhum privilégio de tabela (leitura ou escrita) nas três tabelas.
Nenhuma policy foi criada, alterada ou removida; `financial.view`, `financial.edit` e
`can_view_project_dossier` permanecem intactos. Auth e Storage não foram tocados.
Não foi usado `USING (true)` em nenhum ponto.

**DT-06: RESOLVIDA.**

## 2. DT-07 — Acessibilidade dos formulários financeiros

Telas corrigidas: `src/routes/finance/vendors.tsx`, `categories.tsx`, `services.tsx`.

- Todos os `<Label>` receberam `htmlFor` e o campo correspondente (`Input`, `Textarea`,
  `SelectTrigger`) recebeu o `id` equivalente, com identificadores únicos por tela
  (ex.: `vendors-nome`, `categories-categoria-pai`, `services-periodicidade`).
- Selects de filtro sem rótulo visível receberam `aria-label`.
- Nenhuma tela foi redesenhada: apenas atributos de acessibilidade foram adicionados.
- Foco e navegação por teclado passam a alcançar o campo ao clicar no rótulo;
  campos obrigatórios e mensagens de erro (toasts de duplicidade do 4B) preservados.

**DT-07: RESOLVIDA.**

## 3. Bloco 4B.1 — Resumo Gerencial

Nova aba **“Gestão do Projeto”** (primeira aba, aberta por padrão) dentro do
Dossiê do Projeto — `src/components/project-management-summary.tsx`, ligada em
`src/components/project-detail.tsx`.

### 3.1 Estruturas reutilizadas (sem tabelas paralelas)

| Bloco da tela | Origem dos dados |
| --- | --- |
| Identificação, status, próxima ação, etapa, observações, receita | `projects` (`name`, `company_id`, `start_date`, `owner_id`, `status`, `phase`, `next_action`, `description`, `value`, `last_activity_at`) |
| Plataformas e contas | `project_accounts`, `project_lovable`, `project_github_repos`, `project_emails` |
| Resumo financeiro | `finance_services` + `finance_vendors` (via `default_project_id`) |
| Prompts pendentes | `project_prompts` |
| Pendências e erros | `project_technical_debts` (não resolvidas) |
| Origem da última atividade | `project_development_records` + `project_prompts` |

Nenhuma tabela nova foi criada.

### 3.2 Migrations realmente necessárias

1. `project_status` — novos valores acrescentados (valores históricos preservados):
   `awaiting_credits`, `awaiting_client`, `awaiting_info`, `in_development`,
   `testing`, `validation`, `homologation`, `deployment`.
2. `project_prompts` — campos mínimos para “prompts pendentes”:
   `status` (novo enum `prompt_status`: `draft`, `to_send`, `sent`, `awaiting_reply`,
   `done`, `cancelled`, default `done` para não alterar o significado dos registros
   históricos), `platform`, `content`, `planned_send_date`, mais índice
   `idx_project_prompts_status (project_id, status)`.

Nenhuma coluna foi removida ou renomeada; RLS, policies e triggers de auditoria
existentes continuam valendo para as colunas novas.

### 3.3 Cálculo do custo mensal estimado

Somente serviços com `default_project_id = projeto` e `status = 'active'`:

- mensal → valor; trimestral → valor ÷ 3; semestral → valor ÷ 6; anual → valor ÷ 12;
- eventual (`one_off`) → não compõe o recorrente, é exibido em “Custos eventuais registrados”;
- serviço sem valor é ignorado, e serviços compartilhados sem valor diretamente
  atribuível são contabilizados como ignorados e informados na tela.

### 3.4 Receita bruta

Reutiliza `projects.value`, apresentado como **Receita bruta contratada**.
A semântica do campo não foi alterada. O **Resultado bruto estimado** é
`receita − custo mensal conhecido`, rotulado explicitamente como estimativa
(não é lucro líquido contábil).

### 3.5 Credenciais / senhas

Não existe hoje no ambiente um cofre (Vault/Secrets) acessível pela aplicação com
criptografia, revelação explícita e auditoria por revelação. Portanto **nenhuma coluna
de senha foi criada**. A tela exibe apenas plataforma, URL, e-mail, login, finalidade e
observações, com aviso ao usuário. O armazenamento seguro de senha permanece
**pendente** (item P3 não executado, conforme autorização).

### 3.6 Segurança aplicada

- Financeiro só é exibido com `financial.view`; edição financeira permanece nas telas 4B.
- Contas de acesso só com `credentials.metadata.view` (ou owner).
- Edição do projeto exige `projects.edit` (ou owner); prompts exigem `prompts.edit`
  ou permissão de edição do projeto. Toda leitura continua filtrada pela RLS
  (`can_view_project_dossier`, `can_edit_project`). Nenhum acesso foi ampliado.

## 4. Testes executados

Sessão autenticada real (conta administradora), preview local.

Desktop 1280 e mobile 390×844:

- abertura da aba “Gestão do Projeto” — OK nos dois tamanhos, sem overflow horizontal
  e sem erros de console;
- cards de Status, Última atualização (com origem provável), Custo mensal estimado,
  Receita bruta, Resultado bruto estimado e Próxima ação — OK;
- edição rápida: status alterado para “Aguardando créditos”, próxima ação
  `TESTE-4B1 Enviar prompt ao Lovable` e receita `1000` — gravados e refletidos na tela;
- prompt pendente `TESTE-4B1 Prompt pendente` criado com plataforma Lovable e
  situação “A enviar” — listado corretamente em Prompts pendentes;
- filtros de prompts por situação e plataforma — presentes e funcionais;
- plataformas/contas, pendências (DT-01/02/03 exibidas) e observações — OK;
- permissões: blocos financeiros e de contas condicionados às permissões correspondentes.

Dados de teste removidos ao final: projeto “GESTÃO TERCEIRIZADA” restaurado
(`status = planning`, `next_action = NULL`, `value = NULL`) e prompt de teste apagado.

Build e typecheck: **OK**.

## 5. Limitações registradas

- Armazenamento seguro de senha (P3) não implementado — sem cofre disponível.
- O custo mensal considera apenas serviços com projeto padrão definido; rateio N:N
  continua fora de escopo (Bloco 4C).
- Custos realizados/faturas ainda não existem (`finance_costs` não autorizado),
  então “custos eventuais” refletem somente serviços de recorrência eventual.
- O linter do banco mantém os 14 avisos preexistentes de funções `SECURITY DEFINER`
  (helpers de RLS), sem relação com esta rodada.

## 6. Encerramento

Desenvolvimento **parado**. Bloco 4C não iniciado.
Aguardando homologação expressa.

SHA final: a ser registrado pelo repositório após o commit desta entrega
(base: 5b63eae272f3de2e4722dd781f218a208232c13c).
