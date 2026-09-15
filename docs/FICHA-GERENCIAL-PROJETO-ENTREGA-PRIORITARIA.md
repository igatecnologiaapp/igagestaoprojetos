# Ficha Gerencial do Projeto — Entrega Prioritária e Fechamento

Projeto: Sistema Gestão de Projetos — IGA Tecnologia
Repositório: igatecnologiaapp/igagestaoprojetos
Commit-base da auditoria: ead69cf5e12223e06dd6a08ef4b2991938e3923c

## 1. Estruturas verificadas e classificação (entrega original)

| Estrutura | Situação | Decisão |
|---|---|---|
| `projects` (name, status, phase, next_action, value, last_activity_at) | EXISTE | REUTILIZAR |
| `project_accounts` (platform, url, username, email, notes) | PARCIAL | COMPLETADO (plano, custo, moeda, periodicidade, renovação, situação, finalidade) |
| `project_lovable`, `project_github_repos` | EXISTE | REUTILIZAR |
| `project_emails`, `project_links`, `project_credits` | EXISTE | REUTILIZAR |
| `project_prompts`, `project_development_records`, `project_technical_debts` | EXISTE | REUTILIZAR |
| `finance_services`, `finance_costs`, `finance_cost_allocations`, `finance_budgets` | EXISTE | REUTILIZAR |
| Cofre de credenciais / senhas | AUSENTE | NÃO IMPLEMENTADO ("Não cadastrada / Cofre pendente") |

Nenhuma tabela nova foi criada. Nenhuma tabela por plataforma foi criada.

Migration incremental já aplicada em `project_accounts`: colunas `plan`, `purpose`, `amount`,
`currency`, `recurrence`, `renews_at`, `status`; constraints de valor não negativo e moeda de 3
letras; índices por projeto e por renovação. Nenhuma alteração em policies, RLS, GRANTs, RBAC,
Auth, Storage ou auditoria. Nenhum `USING (true)`. Nenhuma coluna de senha.

## 2. Matriz de auditoria e fechamento

| Requisito | Situação anterior | Ação realizada | Situação final |
|---|---|---|---|
| Ficha Gerencial: GitHub, Supabase, Lovable, ChatGPT, Claude, Gamma, Outras | IMPLEMENTADO | Somente testado | Concluído |
| Cards \| Tabela, conta/e-mail, login, plano, custo, periodicidade, mensal equivalente, renovação, situação | IMPLEMENTADO | Somente testado | Concluído |
| Cadastro e edição rápida de plataforma/conta | IMPLEMENTADO | Somente testado | Concluído |
| URLs clicáveis (abrem em nova aba, `rel="noreferrer"`) | IMPLEMENTADO | Conferido em cards, tabela, Lovable e GitHub | Concluído |
| Projetos: listar, criar, editar, abrir, Abrir Ficha, pesquisar, filtrar por status | IMPLEMENTADO | Somente testado | Concluído |
| Projetos: filtro por fase | AUSENTE | Filtro por fase (lista dinâmica + "Sem fase definida") | Concluído |
| Projetos: filtro por situação orçamentária | AUSENTE | Filtro reutilizando `finance_budgets`, custos e rateios (`src/lib/finance-budgets.ts`), combinável com busca, status e fase, visível apenas com `financial.view` | Concluído |
| Contas e Credenciais (aba do dossiê) | IMPLEMENTADO (nome "Acessos") | Renomeada para "Contas e Credenciais"; nenhuma tela nova | Concluído |
| Senhas / cofre | Decisão vigente | Mantida: sem coluna de senha, exibe "Não cadastrada / Cofre pendente" | Mantido |
| Identidade visual "FlowDesk" na interface | PARCIAL (títulos e tela de acesso) | Substituído por "IGA Tecnologia" em todas as telas; logotipo oficial aplicado no menu, no acesso e na definição de senha, com "Gestão de Projetos" abaixo | Concluído |
| Autocadastro na tela de acesso | EXISTIA ("Criar conta") | Aba removida; tela mantém e-mail, senha, Entrar e "Esqueci minha senha" | Concluído |
| Autocadastro no servidor | HABILITADO | Desabilitado na configuração de Auth; endpoint público de signup responde 422 `signup_disabled` | Concluído |
| Recuperação/definição de senha | AUSENTE | Fluxo por e-mail + página `/reset-password` | Concluído |
| Administração de usuários (perfil, módulos) | IMPLEMENTADO | Evoluída a tela existente (sem segundo módulo) | Concluído |
| Criação de usuário por convite (sem o administrador conhecer a senha) | AUSENTE | Criação com link seguro de definição de senha, gerado no servidor | Concluído |
| Cargo/função, e-mail e situação do usuário na listagem | AUSENTE | Exibidos; cargo gravado em `profiles.job_title` | Concluído |
| Ativar/desativar acesso | AUSENTE | Bloqueio/desbloqueio administrativo, com proteção do último Administrador | Concluído |
| Auditoria administrativa | PARCIAL | Registro de criação, alteração de acesso, ativação, desativação e geração de link (sem senha, token ou link) | Concluído |
| Refinamento visual | — | Ajustes pontuais de filtros e leitura; sem redesenho | Concluído |
| Cofre de Credenciais / novo módulo financeiro / Fase 4 | Não autorizado | Não iniciado | Não iniciado |

## 3. Arquivos alterados

- `src/routes/auth.tsx` — remoção do autocadastro, recuperação de senha, identidade IGA.
- `src/routes/reset-password.tsx` — nova página pública de definição de senha.
- `src/routes/projects.tsx` — filtros de fase e de situação orçamentária combinados com busca e status.
- `src/routes/users.tsx` — administração de usuários evoluída (e-mail, cargo, situação, convite, ativar/desativar).
- `src/utils/users.functions.ts` — funções de servidor: listagem de identidades, ativação/desativação, link de definição de senha, criação por convite, auditoria.
- `src/components/app-shell.tsx` — logotipo oficial.
- `src/components/project-detail.tsx` — aba "Contas e Credenciais".
- Demais rotas — substituição textual de "FlowDesk" por "IGA Tecnologia".
- `src/assets/iga-logo-oficial.png.asset.json` — logotipo oficial fornecido.

## 4. Migrations

Nenhuma migration nova foi necessária nesta etapa. A única alteração de banco da entrega é a
migration incremental anterior em `project_accounts` (item 1). A desativação do autocadastro é
configuração de Auth, não schema.

## 5. Segurança e credenciais

- RLS, RBAC, `can_view_project_dossier`, `financial.view`, `financial.edit`, auditoria, Auth,
  Storage e isolamento por projeto preservados. Nenhum `USING (true)`.
- `service_role` usado somente em funções de servidor; nunca exposto ao navegador.
- Proteção do último Administrador preservada (`protect_last_owner`, `protect_admin_override`) e
  reforçada na desativação: não é possível desativar o próprio acesso nem o último Administrador.
- Senhas: nunca armazenadas. A ficha exibe "Credencial: Não cadastrada / Cofre pendente".
  O link de definição de senha não é registrado em auditoria.

## 6. Testes

- Acesso: tela sem qualquer caminho de autocadastro; presentes e-mail, senha, Entrar e
  "Esqueci minha senha".
- Teste negativo: chamada direta ao endpoint público de criação de conta retornou
  422 `signup_disabled`.
- Projetos autenticado: filtros "Todos os status", "Todas as fases" e "Todos os orçamentos",
  alternância Cards | Tabela e botão "Abrir Ficha" presentes.
- Ficha Gerencial aberta em desktop 1280×1800 e mobile 390×844: cards de Projeto/Cliente, Fase,
  Status, Última atualização, Custo mensal, Receita, Resultado, Custos realizados e Orçamento;
  bloco Plataformas e contas com Cards | Tabela; sem overflow horizontal e sem erros de console.
- Typecheck e build sem erros.
- Nenhum dado de teste permanente foi criado nesta etapa.

## 7. Regra oficial do sistema

"O Sistema Gestão de Projetos — IGA Tecnologia não permite autocadastro público. A inclusão de
novos usuários é uma função administrativa. Perfis, permissões e escopos de acesso são definidos
e administrados exclusivamente por usuários com autorização administrativa."

## 8. Limitações conhecidas

- Cofre de Credenciais não implementado (depende de autorização específica).
- O envio automático de e-mail de convite depende de infraestrutura de e-mail própria; enquanto
  isso, o sistema gera um link seguro de uso único para o Administrador encaminhar.
- Linter: 18 avisos preexistentes de funções `SECURITY DEFINER`, sem aumento.

## 9. Situação

FICHA GERENCIAL HOMOLOGADA COMO ENTREGA FUNCIONAL CONCLUÍDA.
SHA final: commit desta entrega no repositório oficial.

**DESENVOLVIMENTO ENCERRADO — aguardando nova autorização expressa.**
