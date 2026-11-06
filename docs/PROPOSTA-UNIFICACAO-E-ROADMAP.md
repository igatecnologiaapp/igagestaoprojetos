# Proposta de Unificação e Roadmap — Sistema de Gestão de Projetos IGA Tecnologia

> Versão de referência no repositório, atualizada em **06/11/2026**.
> Documento vivo (com diagramas e comentários): https://claude.ai/artifact/ADzsUgs5aj6ePKto9RZG3B
> Protótipo visual aprovado: https://claude.ai/artifact/7KpmV88418JB4VT4imjfwr
> Em caso de divergência, **decisões e regras deste arquivo valem** e o documento vivo deve ser corrigido.

---

## 1. Resumo e decisões

O repositório **`igatecnologiaapp/igagestaoprojetos`** (este) é a **base única** do sistema. O repositório **`igatecnologiaapp/igagestaodeprojetos`** foi um protótipo inicial nascido do mesmo prompt (06/05/2026), parou em 14/08/2026 e foi **descontinuado**: dele foram aproveitadas apenas ideias de navegação e usabilidade.

| Decisão (06/11/2026) | Escolha |
| --- | --- |
| Base do sistema | `igagestaoprojetos` (v2.2.0 em diante) |
| Forma de execução | Claude desenvolve no GitHub: **uma branch e um Pull Request por bloco**; a IGA revisa, faz o merge e publica pelo Lovable |
| Tabelas `iga_*` | Remover → verificado: **já haviam sido removidas** pela migration de 21/08/2026 |
| Dados do banco do repositório antigo (`afiulywlzkqwwghitdtt`) | **Descartar** (dados de teste); manter apenas o backup do repositório |
| Cofre de senhas | **Dentro do sistema**, cifrado (Supabase Vault) |
| Papel "Cliente" no portal | Pendente — decidir até a Fase 4 |

**Diretriz permanente:** propor melhorias sempre que identificadas, mantendo telas, layouts e funcionalidades **intuitivos, práticos e de fácil compreensão** para os três perfis: **Administrador, Colaborador e Visualizador**. O protótipo visual aprovado é a referência de interface.

## 2. Identificação dos ambientes

| | Base ativa | Descontinuado |
| --- | --- | --- |
| Repositório | `igatecnologiaapp/igagestaoprojetos` | `igatecnologiaapp/igagestaodeprojetos` |
| Projeto Lovable | `ca1e3404-0d1b-406a-b499-38a6b7cd6c79` | `58e48f67-ba49-43e2-a21e-2e6f22e3be86` |
| Site | igagestaoprojetos.lovable.app | igagestaodeprojetos.lovable.app |
| Banco (Supabase / Lovable Cloud) | `luhlzufqxueurgmsecvu` | `afiulywlzkqwwghitdtt` |

Backup do repositório descontinuado: `2026-11-06_iga_igagestaodeprojetos_v0-prototipo_arquivado.bundle` (41 commits, último `b280904` de 14/08/2026, verificado e restaurado com sucesso) + ficha `.json`. **Guardado fora do GitHub** (Google Drive da IGA).

## 3. Achados da auditoria (06/11/2026)

| # | Achado | Situação |
| --- | --- | --- |
| 1 | Fundação paralela com 16 tabelas `iga_*` criada em 20/08/2026 | **Resolvido**: removida em 21/08/2026 |
| 2 | Repositório antigo com todas as tabelas legíveis por qualquer autenticado | Não migrado; repositório descontinuado |
| 3 | `.env` versionado no repositório antigo | Repositório descontinuado; aqui só `.env.example` |
| 4 | Não existe cofre de senhas (`project_accounts` sem senha, por decisão) | Fase 5 |
| 5 | Projeto abria em janela, sem endereço próprio | **Resolvido** na Fase 1 (`/projetos/:id`) |
| 6 | Dossiê com 12 abas e dados repetidos | **Resolvido** na Fase 1 (7 seções) |
| 7 | Arquivos só por tarefa, sem documentos do projeto | **Resolvido** na Fase 1 (`project_files`) |
| 8 | Receita só como `projects.value` | Fase 2 |
| 9 | `project_credits` e `finance_costs` podem contar o mesmo gasto duas vezes | Fase 2 |
| 10 | Políticas antigas e novas convivendo | **Sem problema**: das 113 políticas ativas, só 3 liberam leitura geral, todas de catálogos (`app_permissions`, `role_permissions`, `project_custom_field_definitions`) |
| 11 | Dashboard com 4 indicadores estáticos | Fase 3 (Painel do Gestor) |
| 12 | Rotas em inglês | **Resolvido** na Fase 1 (endereços em português, antigos redirecionam) |
| 13 | Política de leitura de `audit_history` compara `can_view_project_dossier(entity_id)` com o id da linha filha (não do projeto): eventos de links, prompts, documentos etc. só aparecem para quem tem `audit.view` | A tratar em bloco próprio |

## 4. Requisitos da IGA e onde são atendidos

| Requisito | Onde / quando |
| --- | --- |
| Informações gerais, estrutura, tarefas, prazos | Pasta do projeto, seções 1 e 2 (Fase 1); marcos e prazo replanejado na Fase 2 |
| Ferramentas utilizadas e custos das ferramentas | Seção 4 da pasta + Financeiro (existente; rateio por consumo na Fase 2) |
| Custos extras, custo atualizado, receitas e resultado | Fase 2 (seção 7 deste documento) |
| Repositório de logins e senhas | Fase 5 (cofre) |
| Compartilhamentos e acessos limitados para participantes | Existente (compartilhamentos) + Fase 4 (portal do participante) |
| Histórico de desenvolvimento | Seção 6 da pasta (existente, reorganizado na Fase 1) |
| Pasta digital independente por projeto | **Fase 1 — entregue** |
| Painel do Gestor claro e intuitivo | Fase 3 |
| Usuários, login, convite e redefinição de senha | **Fase 1 — entregue** (seção 6) |
| Backup e arquivamento de repositórios GitHub | Fase 6 (seção 9) |

## 5. Arquitetura

Um sistema, um banco. Painel do Gestor no topo, módulos no menu e a **pasta digital de cada projeto** como lugar do trabalho do dia a dia. A autorização é sempre feita **no banco (RLS)**; a tela só esconde o que o usuário já não poderia ver.

**Endereços (Fase 1):** `/painel`, `/projetos`, `/projetos/:id`, `/tarefas`, `/agenda`, `/clientes`, `/relatorios`, `/usuarios`, `/permissoes`, `/externos`, `/financeiro/{custos,assinaturas,orcamentos,fornecedores,categorias}`. Os endereços antigos em inglês redirecionam, preservando os filtros. `/auth` e `/reset-password` não mudam (usados nos e-mails).

**Pasta digital do projeto (`/projetos/:id?secao=`):**

| Seção | Conteúdo |
| --- | --- |
| 1 · Visão geral | Ficha Gerencial, progresso, etapa, prazos, descrição, campos personalizados |
| 2 · Estrutura e tarefas | Tarefas e atalho para o Kanban |
| 3 · Financeiro | Só com `financial.view`; na Fase 2 recebe rateio, receitas e resultado |
| 4 · Ferramentas e acessos | GitHub, Lovable, e-mails, contas (Administrador); cofre na Fase 5 |
| 5 · Documentos e links | Arquivos em pastas (`project_files`, bucket privado `project-files`) e links |
| 6 · Histórico | Desenvolvimento (linha do tempo, registros, dívidas), prompts, auditoria, acervo (Fase 6) |
| 7 · Equipe | Compartilhamentos; `project_members` na Fase 4 |

**Mudanças planejadas no modelo de dados:** `project_members` (Fase 4), `project_credentials` (Fase 5), `project_revenues`, `tool_usage`, `project_milestones`, visões de custo e resultado (Fase 2), `subtasks` (checklist), `project_repository_archives` (Fase 6). Já entregue: `project_files` (Fase 1).

## 6. Usuários, login e senhas (Fase 1 — entregue)

| Requisito | Implementação |
| --- | --- |
| Mostrar/ocultar senha | Ícone à direita do campo (login, definir/redefinir senha, senha provisória) — PR #1 |
| Só o Administrador cria contas | Sem tela de autocadastro; verificação no servidor. **Manter "Sign ups" desligado no Supabase** |
| Criar por convite | Convite enviado **automaticamente por e-mail** (`inviteUserByEmail`) — PR #2 |
| Criar sem convite | Senha provisória com **troca obrigatória no primeiro acesso** (`app_metadata.must_change_password`) — PR #2 |
| Esqueci a senha | Link por e-mail em `/auth` (existente) |
| Administrador redefine a senha | Janela "Redefinir senha": enviar link por e-mail (ou reenviar convite), definir nova senha (com troca obrigatória) ou gerar link para copiar — PR #2 |

Regras: senha, token ou link nunca vão para log; toda ação administrativa fica em `security_access_log`. Para envio de e-mails em volume, configurar SMTP próprio no Supabase.

## 7. Custo do projeto, receitas e resultado (Fase 2)

**Rateio por consumo:** cada **conta** de ferramenta (Conta A, B, C… do Lovable ou outra) tem o valor pago no período. Esse valor é repartido entre os projetos daquela conta na proporção do **consumo** (créditos ou horas) de cada projeto no período.

> Exemplo: Conta A custa R$ 125/mês; consumo no mês de 60, 30 e 10 créditos → R$ 75,00, R$ 37,50 e R$ 12,50. Créditos extras de R$ 80 comprados na conta no mesmo mês são repartidos na mesma proporção (R$ 48, R$ 24, R$ 8), salvo se a compra foi para um projeto específico.

**Despesas (regras aprovadas em 06/11/2026):**

| Tipo | Como entra no custo |
| --- | --- |
| **Fixa** (mensalidade, assinatura, plano) | Somada **automaticamente** a cada vencimento, conforme a periodicidade, e rateada. Para de somar só quando o Gestor informa **pausa ou cancelamento**, com data de efeito. Meses já lançados não mudam; reajuste vale a partir da data informada |
| **Variável** (créditos extras, serviços, horas de terceiros, avulsas) | **Lançada à medida que ocorre**, com data, valor e projeto (ou rateio) |

- Lançamento automático nasce **"previsto"** e passa a **"pago"** quando confirmado.
- O Painel avisa **7 dias antes** de cada vencimento e lista despesas fixas sem projeto.
- Pausa, cancelamento, reativação e reajuste ficam no histórico.

**Receitas:** implantação (única ou parcelada) e recorrente (mensalidade), cada uma como **contratado, faturado e recebido**.

**Resultado bruto = receitas − custo**, por mês e acumulado, com margem %:

- lucro bruto → **Superávit**;
- custo maior que a receita, ou projeto **sem venda** → **Déficit**;
- resultado zero → "Equilíbrio" (sugestão).

**Regras propostas (a confirmar no início da Fase 2):**

- Conta sem uso no mês: valor vai para **"Custo ocioso da IGA"**, visível no Painel.
- Mês fechado congela o rateio; correções viram lançamento de ajuste registrado.
- Resultado padrão sobre o **recebido**; alternativa por contratado/faturado.
- Consumo informado por lançamento mensal ou importação de planilha; leitura automática só onde a ferramenta oferecer relatório/API (a verificar por ferramenta).
- `project_credits` passa a ser custo variável (fim da dupla contagem).
- Valores visíveis só com permissão financeira.

## 8. Perfis e acessos limitados (Fase 4)

| Papel no projeto | Vê | Edita | Nunca vê |
| --- | --- | --- | --- |
| Gestor / Administrador | Tudo | Tudo | — |
| Coordenador | Todas as seções | Tarefas, prazos, documentos, histórico, ferramentas | Senhas sem revelação autorizada |
| Desenvolvedor / Colaborador | Visão geral, tarefas, documentos e credenciais liberados, histórico | Suas tarefas, comentários, registros | Financeiro, demais credenciais |
| Participante externo | Visão geral resumida, tarefas atribuídas, documentos compartilhados (`shared_with_externals`) | Comentários e anexos nas suas tarefas | Financeiro, ferramentas, cofre, auditoria |
| Cliente (a decidir) | Andamento, prazos, entregas | Nada | O resto |

Permissão sempre no banco (RLS), repetida na tela; `project_members` com papel, início e expiração; toda concessão/revogação auditada.

## 9. Cofre de senhas (Fase 5)

`project_credentials` ligada a `project_accounts`; segredo no **Supabase Vault**; revelação só por função de servidor com permissão `credentials.secret.view`, login recente, tempo limitado (ex.: 30 s) e registro em `security_access_log` (nunca o conteúdo). Senhas nunca em PDF, exportações, WhatsApp, comentários ou histórico. Cartões: só apelido, bandeira e 4 últimos dígitos. Exige **revisão de segurança aprovada** antes de ir ao ar.

## 10. Acervo de repositórios (Fase 6)

Backup de todos os repositórios GitHub da IGA, guardados fora do GitHub com nomenclatura padrão, mantendo no GitHub só as versões atuais/refeitas.

1. Inventário dos repositórios.
2. Backup completo (`git bundle` com todo o histórico) + ficha com commit, data, tamanho e SHA-256.
3. Armazenamento privado fora do GitHub.
4. Conferência por restauração.
5. Só então arquivar ou excluir no GitHub (exclusão exige confirmação do Gestor).

Nomenclatura: `AAAA-MM-DD_cliente_projeto_versao_situacao.bundle`. Registro em `project_repository_archives`, exibido na seção Histórico da pasta.

## 11. Roadmap e andamento

| Fase | Conteúdo | Situação em 06/11/2026 |
| --- | --- | --- |
| 0 · Saneamento | Conferência do banco, backup do repositório antigo | **Concluída** (falta arquivar o repositório antigo no GitHub) |
| 1 · Pasta digital | Login e senhas, pasta `/projetos/:id` com 7 seções, documentos, endereços em português, cores IGA | **Código na `main`** (PRs #1–#6); migration aplicada; aguardando publicação e testes |
| 2 · Financeiro | Rateio por consumo, receitas, despesas fixas automáticas, Superávit/Déficit, marcos | Próxima |
| 3 · Painel do Gestor | Indicadores clicáveis, semáforo, Gantt, alertas | — |
| 4 · Acessos | `project_members`, portal do participante | — |
| 5 · Cofre | Senhas cifradas, revelação auditada | Após revisão de segurança |
| 6 · Acervo | Backup e arquivamento de repositórios | — |

## 12. Procedimentos operacionais (aprendidos na Fase 1)

**Migrations no Lovable Cloud**

- Uma migration que chega pelo GitHub **não é aplicada automaticamente**: após o merge, pedir no chat do Lovable (projeto `ca1e3404…`) para aplicá-la **sem alterações** e depois rodar uma consulta de verificação somente leitura.
- O Lovable Cloud **recusa criar bucket de storage por migration** (`INSERT INTO storage.buckets`). Buckets são criados pela ferramenta de storage do Lovable; a migration traz só tabelas, funções e políticas.
- Ao aplicar, o Lovable grava um registro em `drizzle/migrations/` e regenera `src/integrations/supabase/types.ts`.
- Antes de aplicar, confirmar que o banco é o correto (ex.: existência de `finance_budgets`, `project_development_records`, `project_accounts`).

**Verificação local**

- As migrations são validadas num Postgres 16 local, com papéis e schemas no formato do Supabase, rodando todas as migrations + as suítes em `supabase/tests/`.
- Suítes de referência: `rls_bloco_1_menor_privilegio.sql` (42), `rls_phase_0_2.sql` (39), `fase1_documentos_projeto.sql` (22).

**Ajustes do Supabase que não ficam no código**

- Authentication › Sign ups: **desligado**.
- URL Configuration: endereço publicado + `/reset-password` liberado para redirecionamento.
- SMTP próprio para convites e redefinições (o envio padrão tem limite baixo por hora).
- Bucket `project-files`: **privado**, limite de 50 MB.

## 13. Riscos

| Risco | Mitigação |
| --- | --- |
| Quebrar funcionalidade homologada ao reorganizar telas | Mudar telas sem alterar tabelas na mesma etapa; rodar as suítes de teste a cada bloco |
| Vazamento de senhas | Cofre só após revisão de segurança; testes de RLS específicos; nada de senha no frontend |
| Edições pelo Lovable sobrescreverem migrations ou políticas | Mudanças por PR revisado; conferir o diff no GitHub antes de publicar |
| Dupla contagem de custos | Fonte única definida na Fase 2 e relatório de conferência |
| Migration não aplicada após merge | Procedimento da seção 12 + consulta de verificação |
