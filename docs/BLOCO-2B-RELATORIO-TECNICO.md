# BLOCO 2B — Aderência Funcional, Histórico Visual e Organização do Dossiê Técnico

Sistema Gestão de Projetos — IGA Tecnologia
Repositório oficial: https://github.com/igatecnologiaapp/igagestaoprojetos

## 1. Commit-base

- Commit-base (homologação do Bloco 2A): `8ebd2e5d44f0737feee34844dc5fcbba7563f5fc`
- Branch: `main`

## 2. Escopo executado

Somente apresentação e aderência funcional. Nenhuma alteração em RLS, RBAC, Auth, Storage,
políticas de compartilhamento ou funções de segurança homologadas. Nenhuma migration histórica
foi editada e nenhum dado foi excluído.

## 3. Arquivos alterados / criados

| Arquivo | Situação | Descrição |
|---|---|---|
| `src/components/project-detail.tsx` | alterado | Categorias de links ampliadas, filtro por categoria, alternância Linha do tempo/Lista em Prompts, campo de referência de commit, escopo ampliado do histórico |
| `src/components/project-records.tsx` | alterado | Filtro/contagem por campo (`filterKey`), `hideList`, estados vazios em card tracejado, hover consistente nos itens |
| `src/components/audit-history.tsx` | reescrito | Histórico legível (sem JSON bruto), rótulos por tipo de entidade, filtros de período/tipo/evento/usuário |
| `src/components/project-prompts-timeline.tsx` | criado | Timeline cronológica de `project_prompts` (apenas apresentação) |
| `docs/BLOCO-2B-RELATORIO-TECNICO.md` | criado | Este relatório |

## 4. Migrations

Uma única migration incremental:

```sql
ALTER TABLE public.project_prompts ADD COLUMN IF NOT EXISTS commit_ref text;
COMMENT ON COLUMN public.project_prompts.commit_ref IS '...';
```

- Extensão mínima para atender ao item 3 (referência ao commit na timeline).
- Nenhuma tabela criada, nenhuma policy criada/alterada, nenhum GRANT novo necessário
  (a coluna herda as permissões da tabela existente).

## 5. Funcionalidades

### 5.1 Categorias de links (item 2)
- O campo `category` **já existia** em `project_links`; foi reutilizado — nenhuma coluna duplicada.
- Lista de categorias ampliada para: Produção, Homologação, Desenvolvimento, GitHub, Lovable,
  Banco de Dados, Documentação, Dashboard, API, Domínio, Infraestrutura, Design, Planilha, Outros.
- Filtro visual por categoria com contador (“N de M”), exibido apenas quando há mais de uma categoria.
- Não foi criado módulo de bookmarks.

### 5.2 Timeline de prompts (item 3)
- Nova apresentação cronológica (ascendente) sobre a mesma tabela `project_prompts`.
- Exibe data, título, tipo, finalidade, referência de commit, envio ao Lovable, link do chat e observações,
  sempre que o dado existir.
- A visualização em lista foi **mantida** e é acessível pela aba interna “Lista”.
- O botão “Novo prompt” continua disponível nas duas visualizações.

### 5.3 Histórico visual (item 4)
- O histórico do projeto passou a incluir os `entity_type` registrados no Bloco 2A:
  comentários, anexos, agendamentos, participantes de agendamento, compartilhamentos de projeto e
  de tarefa, colaboradores externos e demais registros do dossiê técnico.
- O escopo é montado a partir dos ids relacionados ao projeto (tarefas, registros do dossiê,
  comentários, anexos, compartilhamentos e agendamentos) e consultado em `audit_history`.
- Eventos convertidos em frases legíveis, por exemplo:
  “Usuário X compartilhou a tarefa — permissão: visualização”, “Usuário X adicionou um anexo”.
- JSON bruto deixou de ser a interface; apenas nomes de campos alterados são exibidos.
- Autoria e data/hora preservadas.

### 5.4 Filtros do histórico (item 5)
- Filtros client-side por período (7/30/90 dias), tipo de entidade, tipo de evento e usuário.
- Nenhum relatório analítico ou dashboard foi criado.

### 5.5 UX do dossiê (item 6)
- Estados vazios passam a usar card tracejado com texto orientativo.
- Itens de lista com fundo de card e hover consistente.
- Barra de ações unificada (botão de criação + filtro + contador) em cada seção.
- Filtros do histórico com controles compactos e responsivos.
- Nenhum redesenho global; tabs, componentes e identidade visual preservados.

## 6. Reaproveitamento (nada recriado)
- `project_links`, `project_prompts`, `audit_history`, `project_*` do dossiê, `RecordSection`,
  `ProjectShares`, `ProjectCustomFieldValues` e as 10 tabs existentes foram mantidos e reutilizados.
- Nenhum segundo módulo de Projetos, nenhuma tabela paralela de prompts ou auditoria.

## 7. Segurança

- Nenhuma policy criada ou alterada nesta rodada.
- O histórico continua limitado pela policy `Audit viewable by auditors`: eventos dos novos
  `entity_type` (comentário, anexo, agendamento, compartilhamentos, colaborador externo) só são
  legíveis por quem possui `audit.view`; os demais seguem `can_view_project_dossier` / `can_view_task` /
  `can_view_company`. A consulta por ids apenas restringe o conjunto — não amplia acesso.
- `task_share` continua sem acesso ao dossiê técnico (regra do Bloco 1 intacta).
- `project_accounts` permanece restrito a owner na interface e por RLS.
- Nenhum segredo é exibido: a auditoria não grava senhas/tokens e a UI não renderiza payload bruto.

## 8. Testes executados

| Teste | Resultado |
|---|---|
| Typecheck (`tsgo --noEmit`) | Aprovado |
| Build do projeto | Aprovado (`build OK`) |
| Abertura do dossiê e navegação entre tabs (Playwright, sessão autenticada real) | Aprovado |
| Aba Prompts — alternância Linha do tempo/Lista e estado vazio | Aprovado (evidência: captura da aba) |
| Aba Histórico — evento renderizado em texto legível, com tipo, autor e data | Aprovado (evidência: “Iga Tecnologia adicionou o projeto …”) |
| Filtros do histórico renderizados (período, tipo, evento, usuário) | Aprovado |
| Aba Links — CRUD existente preservado (mesmo componente `RecordSection`, sem alteração de mutação) | Aprovado por inspeção; ver exceção 8.1 |
| Console sem erros de aplicação | Aprovado (apenas 1 recurso 500 transitório do otimizador do Vite em dev) |

### 8.1 Testes não executados no ambiente
- **Criação/edição/exclusão real de link com categoria e filtragem com múltiplas categorias**: a base
  atual não possui links cadastrados nos projetos existentes e não foi criado dado de teste para não
  alterar dados de produção. Procedimento para execução: abrir Projetos → projeto → aba Links →
  “Novo link”, cadastrar dois links em categorias diferentes e conferir o seletor de categoria e o contador.
- **Ordenação cronológica da timeline com múltiplos prompts**: não há prompts cadastrados na base.
  Procedimento: cadastrar dois prompts com `prompt_date` distintos e conferir a ordem ascendente.
- **Regressão visual mobile**: verificada apenas em viewport desktop (1280px) no ambiente automatizado.
  Procedimento: abrir o dossiê em 390×844 e conferir quebra das tabs e dos filtros.
- **Reexecução das suítes RLS com JWT real**: mantida como pendência prévia (não pertence a este bloco).

## 9. Riscos residuais

- O escopo do histórico é montado por ids existentes; eventos de registros **já excluídos**
  (`deleted`) podem não aparecer no histórico do projeto por não haver id vivo para correlacionar.
  Mitigação futura: coluna/índice de correlação (`project_id`) em `audit_history` — não autorizado neste bloco.
- Filtros do histórico são client-side sobre as 200 entradas mais recentes autorizadas.

## 10. Dívidas técnicas mantidas

- **DT-01** — contexto completo da linha `projects` ainda acessível em cenários de `task_share`.
- **DT-02** — responsáveis/criadores de tarefas considerados membros do projeto para acesso ao dossiê.
- 12 alertas do linter “SECURITY DEFINER executável por usuários autenticados”: pré-existentes e
  intencionais (funções canônicas de autorização `can_view_*`, `can_edit_*`, `has_permission`, etc.).
  Nenhuma função nova foi criada neste bloco.

## 11. Não iniciado (proibições respeitadas)

Nenhum item da Fase 3/4 foi tocado: sem gestão financeira, custos/fornecedores, Health Score,
dashboard executivo, automações GitHub/Lovable/ChatGPT, sincronização de commits, Vault,
subtarefas, módulo de plataformas, inteligência gerencial ou integrações externas.

## 12. SHA final

Não disponível neste ambiente (o commit é gerado na sincronização com o repositório oficial).
Após a sincronização, registrar aqui o SHA do branch `main`.

---

**Status:** Bloco 2B concluído. Desenvolvimento interrompido, aguardando homologação expressa.
