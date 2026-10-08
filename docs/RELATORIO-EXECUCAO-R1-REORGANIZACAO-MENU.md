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

---

## Correção controlada — Administração de Usuários (pré-requisito da homologação R1)

### Causa raiz comprovada
- `src/start.ts` não registrava nenhum `functionMiddleware` que enviasse a sessão do usuário às funções de servidor. Todas as funções administrativas (`requireSupabaseAuth`) recusavam com **401 "No authorization header provided"** (falha de **transporte de autenticação**, não de validação do servidor nem de RLS).
- No navegador, a recusa 401 chega como um objeto `Response` resolvido (não como exceção). A tela tratava esse valor como lista e chamava `.find`, gerando "authUsers.find is not a function" → "Algo deu errado" (falha secundária no frontend).

### Solução aplicada (sem banco, RLS, RBAC, Auth ou migrations)
| Arquivo | Alteração |
|---|---|
| `src/start.ts` | Registra `attachSupabaseAuth` (gerado pela plataforma) em `functionMiddleware`: envia o token de sessão legítimo (`Authorization: Bearer`). O servidor continua validando o token (`getClaims`) e a regra de Administrador (`assertOwner`/papel `owner`). Nenhum `user_id`, e-mail ou papel enviado pelo cliente é confiado. `service_role` permanece só no servidor. |
| `src/routes/users.tsx` | `adminCall` converte recusas 401/403/5xx em erro; `friendlyAdminError` exibe mensagens seguras: "Sessão expirada ou inválida", "Permissão insuficiente", "Falha de comunicação", "Erro temporário do servidor". Lista resistente a respostas inválidas; sem tokens ou detalhes internos. |
| `src/utils/users.functions.ts` | Link de definição de senha passa `redirectTo = <origem do site>/reset-password` (antes caía no painel sem pedir senha). Remoção de usuário passa a registrar `user.delete` na auditoria. |

### Testes administrativos (preview, Administrador real)
| # | Teste | Resultado |
|---|---|---|
| 1 | Listar usuários | OK (200) |
| 2 | Criar usuário por convite | OK — `user.create` auditado; link gerado |
| 3 | Atribuir perfil/permissões | OK — perfil Colaborador; exceção individual `financial.view = negado` aplicada e removida |
| 4 | Ativar/desativar | OK — `user.deactivate` / `user.activate` auditados |
| 5 | Link de definição de senha | OK — link usado para definir a senha do usuário de teste; login posterior OK |
| 6 | Usuário comum em ação administrativa | Recusado: "Sem permissão" (listar e autopromoção via servidor); inserir papel owner via API = 403; alterar próprio papel = 0 linhas; criar exceção própria = 400 |
| 7 | Visitante sem login | Função administrativa → 401; `/users` redireciona para `/auth` |
| 8 | Autocadastro | Signup direto → 422 (bloqueado) |
| 9 | Último Administrador | Tentativa de desativar a si mesmo recusada; Administrador segue ativo |
| 10 | Auditoria | Eventos `admin.users` gravados, sem senha/token |

### Homologação R1 por perfil (usuário de teste Colaborador, sem projetos vinculados)
- **Menu (desktop 1280 e mobile 390×844):** Visão Geral, Projetos, Gestão Financeira, Clientes, Relatórios, Administração (apenas Colaboradores Externos). Usuários e Perfis/Permissões **ocultos**.
- **URL direta:** `/users` e `/permissions` → "Acesso restrito". Demais rotas abrem conforme permissões do perfil Colaborador (que inclui `financial.view` por padrão no RBAC existente).
- **Restrição financeira:** com exceção individual negando `financial.view`, o grupo Gestão Financeira some (desktop e mobile); `/finance/costs` e `/finance/budgets` por URL mostram "Você não possui permissão…"; API devolve 0 linhas.
- **Ficha Gerencial / isolamento:** usuário sem vínculo vê 0 projetos e 0 empresas — nenhum dado real exposto. Abertura da Ficha com projeto vinculado não testada para não conceder acesso a dados reais.
- **Limpeza:** exceção removida; usuário de teste removido pela tela oficial (0 identidades restantes); registros de auditoria preservados.

### Pendências / observações
- Em produção, o link de senha só abrirá `/reset-password` se esse endereço estiver na lista de retorno permitida do login; caso contrário volta à página inicial. Conferir após publicar.
- Aviso de tipagem preexistente em `src/routes/__root.tsx` (linha 83) inalterado.
- Políticas RLS, RBAC, Auth e Storage: **inalteradas**. Nenhuma tabela ou migration criada.
- SHA base: `6c06878bf19d9ee2540987ffce8b7634777c4857`; SHA antes desta correção: `d4fef87c7061f5b2cee9ff442ce6a7db1bd62023`. O SHA final é gerado automaticamente após esta mensagem (conferir no GitHub).
- Não publicado. R2 não iniciada.

---

## Publicação e homologação em produção

### Versão anterior (rollback)
- Publicado antes: pacote `index-C_nh_QV_.js` (anterior a R1; menu antigo, sem a correção de Usuários).
- Rollback: restaurar a versão anterior pelo histórico do projeto e republicar.

### Publicação
- SHA publicado: `ed71885aa19a2768bb524cc311183efc1df72e5e` (contém R1 `6c06878` + correção administrativa). Nenhuma outra funcionalidade incluída; diferença entre os dois commits: `src/start.ts`, `src/routes/users.tsx`, `src/utils/users.functions.ts`, relatório.
- Data: 08/10/2026, 14:49 UTC. Resultado: OK — novo pacote `index-BWxfWQun.js` servido em https://igagestaoprojetos.lovable.app.

### Testes em produção (Administrador, desktop 1280 e mobile 390×844)
| Teste | Resultado |
|---|---|
| Login do Administrador | OK |
| Novo menu (6 grupos) e navegação: Dashboard, Projetos, Usuários, Permissões, Custos, Empresas, Relatórios | OK, sem erros de página |
| Projetos → Abrir Ficha → "Ficha Gerencial do Projeto" | OK |
| Administração de Usuários (lista carrega, "Novo usuário" disponível) | OK — falha "authUsers.find" não ocorre mais |
| Tela de login sem "Criar conta" | OK |
| Autocadastro direto pelo servidor | Recusado (422) |
| Menu mobile (gaveta, item ativo destacado, logotipo oficial) | OK |

### Convite e definição de senha
- Validado no preview (mesmo backend e mesmo código publicado): criação por convite, link, definição de senha e login do convidado — OK.
- Em produção: **não executado** de ponta a ponta nesta rodada. Pendente confirmar que o link abre `/reset-password` no endereço publicado (depende da lista de endereços de retorno permitidos).

### Ficha Gerencial com usuário não administrador
- Não executado com projeto fictício nesta rodada. Isolamento já comprovado: usuário sem vínculo vê 0 projetos/0 empresas.

### Segurança
- Auth, RLS, RBAC, isolamento, auditoria, proteção do último Administrador e bloqueio de autocadastro: inalterados.
- Varredura de segurança aponta 3 avisos **preexistentes** (leitura do catálogo de permissões e definições de campos por qualquer usuário logado). Não foram introduzidos por R1; não contêm dados de clientes. Ficam para análise futura.

### Pendências
1. Teste de convite ponta a ponta no site publicado.
2. Teste da Ficha com usuário restrito e projeto fictício.
3. Avaliar os 3 avisos de segurança preexistentes.
4. Aviso de tipagem em `src/routes/__root.tsx` (sem impacto).

### Situação final: **APROVADO COM RESSALVAS**
Desenvolvimento parado. R2 não iniciada.
