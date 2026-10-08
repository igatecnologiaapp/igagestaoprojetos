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
- Playwright, perfil Administrador: as 14 rotas do menu abriram corretamente em desktop 1280×1800 e mobile 390×844, sem erros de página.
- Grupos recolhíveis e destaque do item ativo conferidos por captura de tela (desktop e gaveta mobile); logotipo oficial preservado.
- Typecheck: sem erros no arquivo alterado; permanece 1 aviso preexistente em `src/routes/__root.tsx` (tipo do errorComponent), não relacionado a R1.
- Perfis sem permissão: as regras de filtro (isOwner / financial.view / módulos) não foram alteradas; teste com outro perfil real não executado por não haver usuário de teste não administrador.

## Complemento de homologação

### Commit
- SHA informado: `6c06878bf19d9ee2540987ffce8b7634777c4857` ("Reorganizou o novo menu").
- Conferido: é exatamente o HEAD do código testado no preview; não há diferença entre esse commit e o código em execução.

### Aviso preexistente da verificação automática
- Origem: `src/routes/__root.tsx`, linha 83 — `errorComponent: ErrorComponent`. A função declara as props como `{ error: Error; reset: () => void }`, enquanto o roteador espera o tipo `ErrorComponentProps`.
- Existe desde antes de R1 (arquivo não alterado nesta etapa).
- Impacto: apenas de tipagem. A tela de erro funciona normalmente; não afeta build, publicação, permissões nem dados.

### Teste RBAC com usuário não administrador — INTERROMPIDO
Ao criar o usuário de teste pela tela Usuários (fluxo administrativo oficial), foi encontrada uma falha preexistente, não causada por R1:

- Sintoma: a tela `/users` exibe "Algo deu errado — authUsers.find is not a function" e não carrega.
- Causa comprovada: as funções administrativas do servidor (listar, criar, ativar/desativar usuários, link de senha) respondem **401 — "No authorization header provided"**. O arquivo `src/start.ts` não registra o mecanismo que envia o login do usuário ao servidor (`attachSupabaseAuth`); o arquivo está igual ao modelo original desde a criação do projeto.
- Impacto: a administração de usuários (criação, ativação/desativação, links de senha) não funciona no preview e, pelo mesmo código, no site publicado. A segurança não é afetada: o servidor recusa as chamadas (falha fechada); nenhum acesso indevido.
- Consequência: não foi possível criar o usuário de teste não administrador; o teste de menus/rotas por perfil não foi executado. Nenhuma regra de permissão foi alterada.
- Correção proposta (aguardando autorização): registrar `attachSupabaseAuth` em `functionMiddleware` no `src/start.ts` e tratar a resposta de erro na tela Usuários. Sem alteração de banco, RLS, RBAC ou Auth.

### Cadastros Financeiros
Mantidos os dois itens; consolidação em R2.

## Publicação
Não publicado; aguardando análise da falha e homologação final.
