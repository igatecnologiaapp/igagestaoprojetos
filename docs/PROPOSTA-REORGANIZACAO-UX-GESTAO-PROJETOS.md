# Proposta de Reorganização de UX — Sistema Gestão de Projetos (IGA Tecnologia)

> Etapa exclusivamente de auditoria e proposta. Nenhuma alteração de código, banco, RLS, RBAC, Auth ou do site publicado foi realizada. Aguardando autorização expressa.

## 1. Diagnóstico da navegação atual

O menu lateral (recolhível, acordeão, desktop e mobile) tem 5 grupos e 13 itens. O dossiê do projeto tem 12 abas.

Problemas identificados:

1. **Governança e Controle mistura assuntos diferentes**: Relatórios + 5 telas financeiras com prefixo repetido "Financeiro · ...". O nome não diz o que há dentro.
2. **Cadastros de apoio no menu principal**: Fornecedores e Categorias são configuração, usados raramente, mas ocupam o mesmo nível de Custos.
3. **Informações do projeto espalhadas**: contas aparecem em 4 abas (GitHub, Lovable, E-mails, Contas e Credenciais) além do bloco Plataformas e Contas da Ficha. O mesmo dado é visto em 2 a 5 lugares.
4. **Dossiê com 12 abas planas**: no mobile exige rolagem horizontal; "Governança" e "Histórico" têm nomes vagos.
5. **Tarefas e Agendamentos** existem no menu global e dentro do projeto (aceitável: visão global x visão do projeto), mas não há ligação clara entre os dois.
6. **Usuários, Permissões e Externos** estão em grupos diferentes ("Organização" e "Partes interessadas"), embora sejam todos administração de acesso.
7. **Empresas** fica em "Organização" junto de Usuários, quando é cadastro de cliente (comercial).
8. **Logs de segurança** (security_access_log) não têm tela própria; só aparecem parcialmente em Histórico.

## 2. Inventário de menus (estado atual)

| Grupo | Item | Rota | Finalidade | Permissão | Cliques | Observação |
|---|---|---|---|---|---|---|
| Visão geral | Dashboard | /dashboard | Indicadores gerais | autenticado | 1 | — |
| Organização | Empresas | /companies | Clientes | módulo companies | 2 | Lugar: Comercial |
| Organização | Usuários | /users | Contas de acesso | Administrador | 2 | Lugar: Administração |
| Organização | Permissões | /permissions | Perfis e exceções | Administrador | 2 | Sobrepõe Usuários |
| Gestão de projetos | Projetos | /projects | Lista, filtros, Abrir Ficha | módulo projects | 2 | Núcleo |
| Gestão de projetos | Tarefas | /tasks | Kanban global | módulo tasks | 2 | — |
| Gestão de projetos | Agendamentos | /appointments | Agenda | módulo appointments | 2 | — |
| Governança | Relatórios | /reports | PDF/WhatsApp | módulo reports | 2 | Grupo próprio |
| Governança | Fin. · Fornecedores | /finance/vendors | Cadastro de apoio | financial.view | 2 | Configuração |
| Governança | Fin. · Categorias | /finance/categories | Cadastro de apoio | financial.view | 2 | Configuração |
| Governança | Fin. · Serviços | /finance/services | Assinaturas/créditos | financial.view | 2 | Financeiro |
| Governança | Fin. · Custos | /finance/costs | Custos e rateios | financial.view | 2 | Financeiro |
| Governança | Fin. · Orçamentos | /finance/budgets | Previsto x realizado | financial.view | 2 | Financeiro |
| Partes interessadas | Externos | /externals | Colaboradores externos | autenticado | 2 | Lugar: Administração |

Abas do dossiê do projeto (Projetos → Abrir Ficha / abrir projeto): Ficha Gerencial, Visão geral, Tarefas, ChatGPT / Prompts, GitHub, Lovable, E-mails, Links, Contas e Credenciais (Administrador), Compartilhamento, Governança (registros de desenvolvimento, dívidas técnicas), Histórico (auditoria).

## 3. Matriz — Governança e Controle

| Menu atual | Funcionalidade | Local recomendado | Justificativa | Ação necessária |
|---|---|---|---|---|
| Relatórios | Relatórios e exportação | Relatórios (grupo próprio) | Uso transversal | Mover item no menu |
| Fin. · Serviços | Assinaturas e créditos | Gestão Financeira → Assinaturas e Créditos | Nome mais claro | Renomear rótulo |
| Fin. · Custos | Custos e rateios | Gestão Financeira → Custos | — | Remover prefixo |
| Fin. · Orçamentos | Previsto x realizado | Gestão Financeira → Orçamentos | — | Remover prefixo |
| Fin. · Fornecedores | Cadastro de apoio | Gestão Financeira → Cadastros (aba) | Uso raro | Agrupar em página com abas reutilizando as telas atuais |
| Fin. · Categorias | Cadastro de apoio | Gestão Financeira → Cadastros (aba) | Uso raro | Idem |
| (dossiê) Governança | Decisões, versões, testes, homologações, dívidas | Projeto → Desenvolvimento | Nome vago | Renomear aba |
| (dossiê) Histórico | Auditoria do projeto | Projeto → Histórico e Homologações | — | Renomear aba |
| Permissões | Perfis/exceções | Administração → Usuários e Permissões | Mesma tarefa | Unir como abas |
| (sem tela) | Logs de segurança | Administração → Auditoria e Segurança | Requisito de rastreabilidade | Etapa futura, leitura apenas |

## 4. Árvores de menu

### Atual
```text
Visão geral ........ Dashboard
Organização ........ Empresas | Usuários | Permissões
Gestão de projetos . Projetos | Tarefas | Agendamentos
Governança e Ctrl .. Relatórios | Fin.Fornecedores | Fin.Categorias | Fin.Serviços | Fin.Custos | Fin.Orçamentos
Partes interessadas  Externos
```

### Proposta (6 grupos, 12 itens visíveis no máximo)
```text
Visão Geral ........ Painel
Projetos ........... Todos os Projetos | Tarefas | Agenda
Gestão Financeira .. Custos | Assinaturas e Créditos | Orçamentos | Cadastros (Fornecedores, Categorias)
Clientes ........... Empresas
Relatórios ......... Relatórios e Exportações
Administração ...... Usuários e Permissões (abas: Usuários, Perfis, Exceções) | Colaboradores Externos
```

Ajustes à proposta inicial do documento, com justificativa:
- **"Ficha Gerencial", "Desenvolvimento", "Histórico"** não viram itens de menu: dependem de um projeto escolhido. Ficam dentro do projeto (acesso direto por Abrir Ficha). Item de menu sem projeto levaria a uma tela vazia.
- **"Gestão Comercial"** reduzida a **"Clientes"**: hoje só existe Empresas. "Projetos comercializados" e "Oportunidades por segmento" exigiriam módulo novo (fora do escopo).
- **"Receitas e Contratos", "Meios de Pagamento", "Resumo Financeiro", "Alertas e Pendências", "Configurações", "Cofre"**: não existem; não criar itens vazios. Entram apenas quando autorizados.
- **"Plataformas e Contas"** permanece por projeto (dentro da Ficha), pois os dados são por projeto (project_accounts).

### Comparativo
| Critério | Antes | Depois |
|---|---|---|
| Grupos | 5 | 6 (nomes autoexplicativos) |
| Itens no menu | 14 | 11 |
| Prefixos repetidos | 5 | 0 |
| Abas no projeto | 12 | 6 seções |
| Lugares onde se vê uma conta do projeto | até 5 | 1 (Plataformas e Contas) |

## 5. Wireframes

### Menu lateral desktop
```text
+----------------------------+
| [logo] IGA TECNOLOGIA      |
|        Gestão de Projetos  |
+----------------------------+
| VISÃO GERAL            v   |
|   > Painel                 |
| PROJETOS               v   |
|   | Todos os Projetos  <-- ativo (barra + cor)
|     Tarefas                |
|     Agenda                 |
| GESTÃO FINANCEIRA      >   |
| CLIENTES               >   |
| RELATÓRIOS             >   |
| ADMINISTRAÇÃO          >   |  (só Administrador)
+----------------------------+
| << Recolher menu           |
| [AB] usuario@...      [->] |
+----------------------------+
```

### Menu mobile (390 px)
```text
+---------------------------+
| [=]  [logo] IGA TECNOLOGIA|
+---------------------------+
 gaveta lateral (mesmos grupos, um aberto por vez)
 + atalho fixo inferior opcional:
+---------------------------+
| Painel | Projetos | Tarefas|
+---------------------------+
```

### Projeto reorganizado (Ficha como central)
```text
Projeto X — Cliente Y        [Status] [Fase]   [Editar]
+------+------+------+------+------+------+
|Últ.at|Próx. |Custo |Recei-|Resul-|Orçam.|   <- cards atuais
+------+------+------+------+------+------+
Seções (abas no desktop, lista recolhível no mobile):
 1 Ficha Gerencial  — resumo, próxima ação, último desenvolvimento
 2 Plataformas e Contas — Lovable, GitHub, e-mails, ChatGPT, Claude,
                          Supabase, links (une 5 abas atuais)
 3 Financeiro do projeto — custos, créditos, orçamento (somente leitura,
                          link para Gestão Financeira)
 4 Trabalho — Tarefas | Prompts
 5 Desenvolvimento — decisões, versões, testes, homologações, dívidas
 6 Histórico e Acesso — auditoria | compartilhamento
```

### Painel com quadros expansíveis
```text
+--------------------+  +--------------------+
| Projetos ativos  v |  | Tarefas atrasadas v|
|  (lista curta)     |  |  (lista curta)     |
+--------------------+  +--------------------+
| Orçamentos > ver   |  | Renovações 30d  > |   (recolhidos)
+--------------------+  +--------------------+
```
Quadros financeiros só aparecem com financial.view.

## 6. Fluxo para consultar um projeto
```text
Projetos -> busca/filtro -> [Abrir Ficha]          (2 cliques)
   -> Plataformas e Contas  (contas, links)        (+1)
   -> Financeiro do projeto (custos, orçamento)    (+1)
   -> cabeçalho mostra Cliente (link Empresas)     (0)
   -> Histórico e Acesso                           (+1)
```
Hoje: consultar contas exige percorrer GitHub, Lovable, E-mails, Links e Contas (5 abas).

## 7. Componentes reutilizáveis
- app-shell (grupos já são dados: só reordenar/renomear).
- project-detail (abas viram seções agrupando os componentes atuais).
- project-platform-accounts (já consolida plataformas; absorve GitHub/Lovable/E-mails/Links como subseções).
- project-management-summary, project-development-timeline, project-records, audit-history, task-collaboration.
- Telas financeiras atuais, sem alteração de lógica; Fornecedores/Categorias reunidas em página com abas.
- users + permissions reunidas por abas, sem alterar RBAC.

## 8. Riscos e dependências
- Rotas atuais devem continuar funcionando (links salvos): manter todas; novas páginas agregadoras apenas redirecionam/reutilizam.
- Permissões: filtros do menu já usam isOwner / hasPermission / canAccess — manter as mesmas regras.
- Unir abas não pode esconder dados de quem hoje vê só parte (ex.: Contas e Credenciais restrito a Administrador) — cada subseção mantém sua verificação.
- Nenhuma tabela, policy ou função de banco precisa mudar.

## 9. Etapas de implementação (após autorização)
| Etapa | Conteúdo | Esforço |
|---|---|---|
| R1 | Menu: novos grupos, nomes sem prefixo, Externos e Permissões em Administração | Baixo |
| R2 | Página Cadastros financeiros (abas Fornecedores/Categorias) e Usuários e Permissões em abas | Baixo |
| R3 | Projeto em 6 seções; Plataformas e Contas unificando GitHub/Lovable/E-mails/Links | Médio |
| R4 | Painel com quadros expansíveis usando dados já existentes | Médio |
| R5 | Auditoria e Segurança (leitura de logs, Administrador) | Médio — requer autorização |

## 10. Critérios de aceite
- Todas as rotas atuais abrem normalmente.
- Usuário sem financial.view não vê Gestão Financeira; não Administrador não vê Administração.
- Nenhuma informação disponível hoje deixa de estar acessível.
- Consultar contas, custos, cliente e histórico de um projeto em no máximo 3 cliques após a lista.
- Desktop 1280 e mobile 390×844 sem rolagem horizontal nas seções do projeto.
- Nenhuma alteração em tabelas, RLS, RBAC ou Auth.

## 11. Limites respeitados
Nenhum código, tabela, permissão, login ou publicação foi alterado nesta etapa. Cofre de Credenciais e novos módulos financeiros/comerciais permanecem fora do escopo.

**Desenvolvimento parado. Aguardando autorização expressa para iniciar a etapa R1.**
