# Ficha Gerencial do Projeto — Entrega Prioritária

Projeto: Sistema Gestão de Projetos — IGA Tecnologia
Repositório: igatecnologiaapp/igagestaoprojetos
Commit-base: 9d66b3154288783b49026cfa99ce5fceae6e4a9b

## 1. Estruturas verificadas e classificação

| Estrutura | Situação | Decisão |
|---|---|---|
| `projects` (name, status, phase, next_action, value, last_activity_at) | EXISTE | REUTILIZAR |
| `project_accounts` (platform, url, username, email, notes) | PARCIAL | COMPLETAR (plano, custo, moeda, periodicidade, renovação, situação, finalidade) |
| `project_lovable` (conta, workspace, URL projeto, URL publicada) | EXISTE | REUTILIZAR (leitura consolidada) |
| `project_github_repos` (owner, repo, branch, url, status) | EXISTE | REUTILIZAR |
| `project_emails`, `project_links`, `project_credits` | EXISTE | REUTILIZAR |
| `project_prompts`, `project_development_records`, `project_technical_debts` | EXISTE | REUTILIZAR |
| `finance_services`, `finance_costs`, `finance_cost_allocations`, `finance_budgets` | EXISTE | REUTILIZAR |
| Cofre de credenciais / senhas | AUSENTE | NÃO IMPLEMENTADO (sem coluna de senha; exibe "Não cadastrada / Cofre pendente") |

Nenhuma tabela nova foi criada. Nenhuma tabela por plataforma foi criada.

## 2. Migration realmente necessária (incremental)

`project_accounts`:
- Novas colunas: `plan`, `purpose`, `amount numeric(14,2)`, `currency text NOT NULL DEFAULT 'BRL'`, `recurrence finance_recurrence`, `renews_at date`, `status finance_entity_status NOT NULL DEFAULT 'active'`.
- Constraints: `chk_project_accounts_amount_non_negative`, `chk_project_accounts_currency` (3 letras).
- Índices: `idx_project_accounts_project`, `idx_project_accounts_renews_at`.
- **Nenhuma** alteração em policies, RLS, GRANTs, RBAC, Auth, Storage, auditoria ou demais tabelas. Nenhum `USING (true)`.
- Nenhuma coluna de senha foi criada.

Linter pós-migration: 18 avisos preexistentes de funções `SECURITY DEFINER`, sem novo aumento.

## 3. Componentes alterados

- **Novo** `src/components/project-platform-accounts.tsx`: visão consolidada Plataformas e Contas (plataforma, conta/e-mail, login, plano, custo, periodicidade, mensal equivalente, renovação, situação, URL clicável, observações, credencial), alternância **Cards | Tabela**, atalhos rápidos (Lovable, ChatGPT, Claude, GitHub, Supabase, Gamma, Outra), cadastro/edição/remoção em diálogo curto, cartão consolidado do Lovable (conta, login, workspace, URLs, plano, custo, periodicidade, créditos, renovação, situação) e cartão GitHub/infraestrutura (organização, repositório, branch, URL, contas Supabase/GitHub).
- `src/components/project-management-summary.tsx`: novos cards superiores (Projeto/cliente, Fase/etapa) junto aos já existentes (Status, Última atualização, Próxima ação, Custo mensal, Receita contratada, Resultado bruto gerencial, Custos realizados, Orçamento, Saldo, Consumo); bloco antigo somente-leitura de plataformas substituído pelo novo componente; consulta redundante removida.

Prompts pendentes, pendências/erros, último desenvolvimento, orçamento e previsto × realizado permanecem como já implementados — nada foi recriado.

## 4. Segurança e credenciais

- `project_accounts` mantém as policies vigentes (leitura e escrita restritas a `owner`); Lovable/GitHub seguem por `can_view_project_dossier` / `can_edit_project`.
- Sem permissão de credenciais, a ficha exibe aviso e oculta contas.
- Situação das credenciais: **cofre pendente**. Nenhuma senha em banco, localStorage, logs, relatórios ou repositório. A ficha exibe "Credencial: Não cadastrada / Cofre pendente".

## 5. Testes

- Projeto temporário com Lovable, ChatGPT, Claude, GitHub e Supabase (planos, custos, e-mails, URLs, renovações), registros Lovable e repositório GitHub.
- Validado: visualização, cálculo do custo mensal equivalente (R$ 360,00 com anual convertido para 1/12), links clicáveis, permissões (leitura via owner), edição rápida de plano com persistência confirmada.
- Desktop 1280×1800 e mobile 390×844: sem overflow horizontal e sem erros de console.
- Typecheck e build sem erros.
- Massa de teste integralmente removida ao final.

## 6. Situação

Ficha Gerencial concluída (P1 e P2 entregues; P3 limitado a refinamentos visuais já aplicados). SHA final: será o commit desta entrega no repositório oficial.

**DESENVOLVIMENTO ENCERRADO — aguardando homologação expressa.**
