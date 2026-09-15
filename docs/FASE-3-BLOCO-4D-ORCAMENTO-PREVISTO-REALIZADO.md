# FASE 3 — BLOCO 4D — Orçamento e Previsto × Realizado

Projeto: Sistema Gestão de Projetos — IGA Tecnologia
Repositório oficial: igatecnologiaapp/igagestaoprojetos
Commit-base autorizado: `490dafd47cf74ece83e32420b6de46241f819e3a`
Escopo: exclusivamente Bloco 4D. Dashboard executivo global e Fase 4 **não** iniciados.

---

## 1. Migration e estrutura

Migration única criando `public.finance_budgets`:

| Coluna | Tipo | Observação |
| --- | --- | --- |
| id | uuid PK | `gen_random_uuid()` |
| project_id | uuid NOT NULL | FK `projects(id)` ON DELETE CASCADE |
| category_id | uuid NULL | FK `finance_categories(id)` ON DELETE SET NULL |
| period_start | date NOT NULL | início do período |
| period_end | date NOT NULL | fim do período |
| amount | numeric(14,2) NOT NULL | valor previsto, default 0 |
| notes | text NULL | observações |
| created_by | uuid NULL | autor do registro |
| created_at / updated_at | timestamptz NOT NULL | `now()` / trigger |

Regra final adotada: **projeto é obrigatório** e categoria é opcional (fluxo principal = orçamento por projeto; categoria refina o previsto dentro do mesmo projeto).

### Constraints

- `chk_finance_budgets_amount` — `amount >= 0`;
- `chk_finance_budgets_period` — `period_end >= period_start`;
- FKs para `projects` e `finance_categories`.

### Índices

- `uq_finance_budgets_scope` (único): `project_id`, `COALESCE(category_id, uuid zero)`, `period_start`, `period_end` — impede duplicidade projeto/categoria/período;
- `idx_finance_budgets_project`, `idx_finance_budgets_category`, `idx_finance_budgets_period`.

### Não criado

Nenhuma tabela paralela de realizado, nenhum histórico financeiro próprio, nenhuma materialização de períodos futuros.

---

## 2. RLS / RBAC

RLS habilitada. Grants: `authenticated` (CRUD) e `service_role` (total); `anon` sem qualquer privilégio.

| Policy | Comando | Regra |
| --- | --- | --- |
| `finance_budgets_select` | SELECT (authenticated) | `has_permission(auth.uid(),'financial.view')` OU `can_view_project(project_id, auth.uid())` |
| `finance_budgets_insert` | INSERT (authenticated) | `has_permission(auth.uid(),'financial.edit')` E `can_view_project(...)` |
| `finance_budgets_update` | UPDATE (authenticated) | `financial.edit` E `can_view_project(project_id, auth.uid())` no USING e no WITH CHECK (ver Bloco 4D.1) |
| `finance_budgets_delete` | DELETE (authenticated) | `financial.edit` E `can_view_project(project_id, auth.uid())` (ver Bloco 4D.1) |

Nenhuma policy usa `USING (true)`. Nenhum RBAC paralelo foi criado.

---

## 3. Auditoria e last activity

- `trg_finance_budgets_audit` → `log_audit('finance_budgets')` em INSERT/UPDATE/DELETE, gravando em `audit_history` (criação, alteração de valor, período, categoria e exclusão).
- `trg_finance_budgets_activity` → `touch_project_activity()` atualiza `projects.last_activity_at` apenas em escrita (nunca em leitura).
- `trg_finance_budgets_updated` → `set_updated_at()`.

---

## 4. Cálculos

Realizado é sempre derivado de `finance_cost_allocations` + `finance_costs` (custos cancelados ignorados), filtrado por projeto, período (`competence` entre início e fim) e, quando o orçamento é por categoria, por `finance_costs.category_id`.

```
Realizado          = Σ alocações do projeto no período (status <> cancelado)
Pago               = Σ alocações cujo custo está pago
Em aberto          = Σ alocações previstas/em aberto
Saldo Orçamentário = Orçamento Previsto − Custos Realizados
Consumo %          = Custos Realizados / Orçamento Previsto × 100
Resultado bruto gerencial = Receita contratada − Custos realizados
```

Sinalização visual: até 80% normal; de 80% a 100% atenção; acima de 100% excedido. Sem notificações automáticas.

---

## 5. Interface

### Financeiro → Orçamentos (`/finance/budgets`)

- Listar, criar, editar e excluir orçamentos;
- Filtros por projeto, categoria e período (datas livres + atalhos Mês atual, Trimestre, Ano);
- Cards com previsto, realizado, saldo, consumo, pagos e em aberto, com selo de situação;
- Bloco **Previsto × Realizado** por categoria: Categoria | Previsto | Realizado | Diferença | Consumo %, com linha de total.
- Item adicionado ao menu Governança e controle, sujeito à permissão `financial.view`.

### Aba Gestão do Projeto

Novos indicadores: Orçamento previsto, Saldo orçamentário e Consumo do orçamento (com selo), somando-se aos existentes de receita contratada, custos realizados, pagos, em aberto e resultado bruto gerencial. Nova seção “Orçamento — previsto × realizado” com cadastro rápido (valor, categoria, período, observações) e comparativo por orçamento. Texto fixo reforça que orçamento não é custo, custo em aberto não é custo pago e resultado bruto gerencial não é lucro líquido contábil.

---

## 6. Testes

Arquivo: `supabase/tests/bloco_4d_orcamento_previsto_realizado.sql`.

Execução real neste ambiente (resultados observados, não presumidos):

- Estrutura — 11/11 aprovados: tabela, colunas mínimas, RLS, ausência de privilégios `anon`, grants de `authenticated`/`service_role`, 4 índices, 2 constraints, ausência de `USING (true)`, uso de `has_permission`, uso de `can_view_project` na leitura e os 3 triggers.
- Funcional — 18/18 aprovados: criação; bloqueio de valor negativo; bloqueio de período inválido; bloqueio de duplicidade; orçamento por categoria permitido; realizado ignorando cancelados (R$ 900); pago R$ 600; em aberto R$ 300; saldo R$ 100; consumo 90%; detecção de orçamento excedido (>100%); auditoria de criação, de alteração de valor, de período e de categoria; `last_activity_at` atualizado; auditoria de exclusão; limpeza da massa de teste.

Observação metodológica: os privilégios foram lidos por `pg_class.relacl`, porque `information_schema.role_table_grants` é filtrado pelo papel conectado. A suíte completa em arquivo depende de acesso ao schema `auth` para simulação de papéis, indisponível ao usuário restrito deste ambiente (limitação já registrada nos blocos anteriores); as verificações de RLS foram feitas por inspeção das policies efetivas.

---

## 7. Validação desktop e mobile

Playwright, sessão autenticada:

- `/finance/budgets` em 1280×1800 e 390×844: renderização correta, sem overflow horizontal, sem erros de console;
- Cadastro pelo formulário: orçamento de R$ 1.500,00 criado e exibido com previsto, realizado, saldo e consumo;
- Aba Gestão do Projeto em 1280×1800 e 390×844: novos indicadores e seção previsto × realizado presentes, sem overflow e sem erros de console.

Dados de teste removidos ao final (banco sem registros `TESTE 4D` e sem o orçamento de validação).

---

## 8. Limitações

- Comparativo textual/tabular; sem gráficos, conforme escopo;
- Períodos não são materializados automaticamente — cada orçamento é cadastrado explicitamente;
- Presets de período cobrem mês, trimestre e ano corrente; qualquer outro intervalo é informado manualmente;
- Não há alertas automáticos, apenas sinalização visual;
- Não implementados: dashboard financeiro global, fluxo de caixa, contas a pagar/receber, emissão fiscal, integração bancária, OCR, importação automática, Health Score e Fase 4.

---

## 9. SHA final

Commit-base autorizado: `490dafd47cf74ece83e32420b6de46241f819e3a`. O SHA final desta entrega será o commit gerado pela publicação desta rodada no repositório oficial; registrar aqui após o push.

---

## 10. Bloco 4D.1 — Ajuste de menor privilégio

Commit-base autorizado: `1c39b76c911be1233a5ef5499b2cd3fdc8262bc1`.

### 10.1 Causa

As policies de escrita de alteração e exclusão exigiam apenas `has_permission(auth.uid(),'financial.edit')`. Um usuário com permissão financeira global poderia alterar ou excluir orçamento de projeto fora do seu escopo autorizado.

### 10.2 Policy anterior

```
finance_budgets_update  USING      has_permission(auth.uid(),'financial.edit')
                        WITH CHECK has_permission(...,'financial.edit') AND can_view_project(project_id, auth.uid())
finance_budgets_delete  USING      has_permission(auth.uid(),'financial.edit')
```

### 10.3 Policy final

```
finance_budgets_update  USING      has_permission(auth.uid(),'financial.edit') AND can_view_project(project_id, auth.uid())
                        WITH CHECK has_permission(auth.uid(),'financial.edit') AND can_view_project(project_id, auth.uid())
finance_budgets_delete  USING      has_permission(auth.uid(),'financial.edit') AND can_view_project(project_id, auth.uid())
```

### 10.4 Migration

Migration incremental que apenas substitui `finance_budgets_update` e `finance_budgets_delete` (DROP POLICY + CREATE POLICY, ambas `TO authenticated`). A migration original do Bloco 4D não foi editada. Tabela, constraints, índices, triggers, Auth, Storage, RBAC e demais tabelas financeiras permaneceram inalterados. O linter continuou com os mesmos 18 avisos preexistentes de funções `SECURITY DEFINER`, sem novo aumento.

### 10.5 Testes

Arquivo: `supabase/tests/bloco_4d_1_menor_privilegio_orcamento.sql`. Execução real neste ambiente — 13/13 aprovados:

- UPDATE exige `financial.edit` e `can_view_project` no USING e no WITH CHECK;
- DELETE exige `financial.edit` e `can_view_project`;
- INSERT mantém `financial.edit` + `can_view_project`;
- SELECT inalterado (autenticado, `financial.view` ou `can_view_project`);
- nenhuma policy de escrita aceita apenas `financial.view`;
- nenhuma policy `USING (true)`;
- todas as policies restritas a `authenticated`; `anon` sem privilégio na tabela;
- RLS habilitada; 2 constraints, 4 índices e 3 triggers preservados.

Limitação metodológica mantida dos blocos anteriores: a simulação de sessões de usuários distintos exige acesso ao schema `auth`, indisponível ao usuário restrito deste ambiente. A restrição por escopo de projeto foi verificada pela expressão efetiva das policies (`can_view_project` presente em USING e WITH CHECK), que é a condição avaliada pelo Postgres em cada linha, e pela execução real de escrita com usuário autorizado. Nenhuma policy foi afrouxada para facilitar testes e nenhum resultado foi presumido.

### 10.6 Regressão funcional

Playwright com sessão autenticada:

- `/finance/budgets` em 1280×1800 e 390×844: renderização correta, sem overflow horizontal, sem erros de console;
- criação de orçamento (R$ 2.500,00), edição para R$ 3.000,00 e exclusão executadas com sucesso após o ajuste;
- filtros de projeto, categoria e período, cards de previsto/realizado/saldo/consumo e bloco Previsto × Realizado operando normalmente;
- aba Gestão do Projeto mantida sem alteração de código nesta rodada;
- `bunx tsgo --noEmit` sem erros; build OK.

Massa de validação removida (`finance_budgets` sem registros `VALIDACAO 4D1` / `TESTE 4D`).

### 10.7 SHA final

Commit-base: `1c39b76c911be1233a5ef5499b2cd3fdc8262bc1`. O SHA final será o commit gerado pela publicação desta rodada no repositório oficial; registrar aqui após o push.

**BLOCO 4D HOMOLOGÁVEL E ENCERRADO.**

---

**Encerramento:** desenvolvimento parado. Aguardando homologação expressa.
