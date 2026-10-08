# Relatório de Execução — Etapa R1: Reorganização do Menu Principal

## Menu anterior
Visão geral (Dashboard) · Organização (Empresas, Usuários, Permissões) · Gestão de projetos (Projetos, Tarefas, Agendamentos) · Governança e controle (Relatórios, Financeiro · Fornecedores/Categorias/Serviços/Custos/Orçamentos) · Partes interessadas (Externos).

## Menu reorganizado
| Grupo | Item | Rota (inalterada) | Regra de exibição (inalterada) |
|---|---|---|---|
| Visão Geral | Dashboard | /dashboard | autenticado |
| Projetos | Todos os Projetos | /projects | módulo projects |
| Projetos | Tarefas | /tasks | módulo tasks |
| Projetos | Agenda | /appointments | módulo appointments |
| Gestão Financeira | Custos | /finance/costs | financial.view |
| Gestão Financeira | Assinaturas e Créditos | /finance/services | financial.view |
| Gestão Financeira | Orçamentos | /finance/budgets | financial.view |
| Gestão Financeira | Cadastros · Fornecedores | /finance/vendors | financial.view |
| Gestão Financeira | Cadastros · Categorias | /finance/categories | financial.view |
| Clientes | Empresas Clientes | /companies | módulo companies |
| Relatórios | Relatórios e Exportações | /reports | módulo reports |
| Administração | Usuários | /users | Administrador |
| Administração | Perfis e Permissões | /permissions | Administrador |
| Administração | Colaboradores Externos | /externals | autenticado |

"Governança e Controle" foi descontinuado como agrupamento; nenhum item foi removido.

## Decisões
- **Cadastros Financeiros**: não existe página única de cadastros; criá-la seria nova rota (etapa R2). Em R1 os dois cadastros existentes aparecem com o prefixo "Cadastros ·".
- **Auditoria e Segurança / Configurações**: não há tela implementada; nenhum item vazio foi criado (regra da autorização).
- Ficha Gerencial permanece em Projetos → Abrir Ficha; as 12 abas do projeto não foram alteradas.

## Arquivos alterados
- `src/components/app-shell.tsx` (apenas a lista de grupos/itens e dois ícones).
- Nenhuma alteração em banco, migrations, Auth, RLS, RBAC, permissões, regras financeiras, Ficha ou Dashboard.

## Rotas preservadas
Todas as 17 rotas existentes permanecem idênticas; nenhuma rota criada ou removida.

## Testes
Ver evidências registradas no fechamento da conversa (build, typecheck, Playwright desktop 1280 e mobile 390×844).

## Publicação
Não publicado nesta etapa; aguardando homologação.
