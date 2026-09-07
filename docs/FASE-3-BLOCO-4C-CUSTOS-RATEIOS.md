# FASE 3 — BLOCO 4C · CUSTOS REAIS E RATEIO ENTRE PROJETOS

Projeto: Sistema Gestão de Projetos — IGA Tecnologia
Commit-base autorizado: `81f284ee4e568398e5df014ac3c1a5387e826079`
Escopo: exclusivamente custos reais e rateio entre projetos.

---

## 1. Escopo executado

Implementado apenas o autorizado:

- Tabela `finance_costs` (custos efetivamente registrados).
- Tabela `finance_cost_allocations` (rateio de cada custo entre projetos).
- Integração dos custos realizados à tela **Gestão do Projeto**.
- Tela **Financeiro · Custos** para gestão dos custos e rateios.

**Não implementado (fora do escopo):** `finance_budgets`, orçamento, projeções,
fluxo de caixa, contas a pagar, dashboard financeiro global e qualquer item da Fase 4.
Verificação objetiva: `to_regclass('public.finance_budgets') IS NULL` → verdadeiro.

---

## 2. Banco de dados

### 2.1 Enums criados
- `finance_cost_type`: `recurring`, `one_off`
- `finance_cost_status`: `forecast`, `open`, `paid`, `cancelled`

### 2.2 `finance_costs`
Campos: vínculo opcional a serviço, fornecedor e categoria; descrição; tipo;
competência; vencimento; data de pagamento; valor; moeda; valor em BRL; situação;
indicador de custo compartilhado; observações; autoria e datas de controle.

Regras: valor não negativo; competência obrigatória; `updated_at` automático.

### 2.3 `finance_cost_allocations`
Campos: custo, projeto, percentual, valor da parcela, autoria e datas.

Regras garantidas no banco:
- percentual entre 0 e 100 e valor não negativo;
- unicidade `(cost_id, project_id)` — o mesmo projeto não aparece duas vezes no mesmo custo;
- gatilho de validação impede que a soma dos percentuais ultrapasse 100% e que a
  soma das parcelas ultrapasse o valor total do custo.

### 2.4 Segurança
- RLS habilitada nas duas tabelas.
- `anon` sem qualquer privilégio; `authenticated` com CRUD; `service_role` total.
- Leitura financeira global exige `financial.view`; leitura por projeto usa as funções
  canônicas de visibilidade de projeto; escrita exige `financial.edit`.
- Nenhuma policy `USING (true)`.

### 2.5 Auditoria e atividade
- `audit_history` registra criação, alteração e exclusão de custos e rateios.
- `last_activity_at` dos projetos é atualizado quando um rateio é criado, alterado ou removido.

---

## 3. Interface

### 3.1 Financeiro · Custos (`/finance/costs`)
- Lista com busca por descrição e filtros por situação, projeto, fornecedor,
  categoria e competência.
- Cadastro e edição de custos, marcação de pago e cancelamento.
- Geração de custo a partir de um serviço contratado da competência.
- Diálogo de rateio: distribuição por percentual/valor entre projetos, com bloqueio de
  projeto duplicado e remoção de parcelas.
- Cartões de custos pagos e custos em aberto/previstos.
- Item de menu "Financeiro · Custos" em Governança e Controle, protegido por `financial.view`.

### 3.2 Gestão do Projeto
- Novos indicadores: **Custos realizados no período** (com pagos e em aberto) e
  **Resultado bruto gerencial** (receita contratada − custos reais conhecidos).
- Bloco "Custos realizados" com totais, lista das parcelas do projeto e situação de cada custo.
- Cadastro rápido "Adicionar custo": cria o custo e a parcela do projeto (100% para custo
  exclusivo; percentual menor direciona a conclusão do rateio à tela de Custos).
- Custos cancelados são desconsiderados dos totais.
- Distinção explícita entre estimado (serviços contratados) e realizado (custos registrados).

---

## 4. Testes

Suíte: `supabase/tests/bloco_4c_custos_rateios.sql`.

Estruturais (executados, todos aprovados): existência das tabelas, enums corretos,
colunas mínimas, RLS ativa, ausência de privilégios de `anon`, privilégios de
`authenticated`/`service_role`, unicidade custo+projeto, índices, ausência de policy
permissiva e gatilhos presentes, além da confirmação de que `finance_budgets` não existe.

Funcionais (executados com dados temporários, todos aprovados):
- criação de custo com valor e competência;
- rateio 100% em projeto único (Lovable R$ 200 → 1 projeto);
- rateio parcial entre múltiplos projetos (VPS R$ 500 → 40% + 35%);
- bloqueio de soma superior a 100%;
- bloqueio de projeto duplicado no mesmo custo;
- bloqueio de valor rateado superior ao custo;
- registro de pagamento e de cancelamento;
- auditoria de custos e de rateios;
- atualização de `last_activity_at` nos projetos rateados.

**Observação metodológica:** `information_schema.role_table_grants` é filtrado pelo papel
conectado e retornou vazio no ambiente de execução. A verificação de privilégios foi
refeita com `pg_class.relacl`, que mostra o estado real:
`authenticated=arwdDxtm`, `service_role=arwdDxtm`, sem entrada para `anon`.

---

## 5. Validação funcional (navegador)

- `/finance/costs` carrega autenticado em 1280×1800 e 390×844, sem erros de console,
  com filtros, cartões e ações visíveis e sem transbordo no mobile.
- Aba **Gestão do Projeto** exibe corretamente os custos realizados: com o custo de
  teste pago de R$ 200 alocado 100%, os cartões mostraram alocado R$ 200,00,
  pagos R$ 200,00 e em aberto R$ 0,00, e o custo cancelado ficou fora dos totais.
- Typecheck e build do projeto sem erros.
- Todos os dados de teste (`TESTE 4C — …`) foram removidos após a validação;
  `finance_costs` ficou com 0 registros.

---

## 6. Limitações conhecidas

- O linter de segurança mantém 18 avisos da classe preexistente de funções
  `SECURITY DEFINER` usadas por RLS; nenhum aviso novo de exposição pública permanece
  após a revogação de execução anônima nas funções criadas neste bloco.
- Conversão cambial não é automática: quando a moeda não é BRL, o valor em reais deve ser
  informado manualmente no campo de valor em BRL.
- O cadastro rápido no dossiê cria a parcela do projeto atual; o rateio entre vários
  projetos é concluído na tela Financeiro · Custos.

---

## 7. Situação

Bloco 4C implementado e validado. Desenvolvimento encerrado aguardando homologação.
Orçamento, dashboard financeiro global e Fase 4 permanecem não iniciados.
