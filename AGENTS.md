# AGENTS.md — Sistema de Gestão de Projetos IGA Tecnologia

Instruções para agentes de código (Codex, Claude Code e outros) e para quem revisa o trabalho deles.
Leia antes de alterar qualquer coisa. A língua do produto e da documentação é o **português do Brasil**.

## O que é

Sistema interno da IGA Tecnologia para gerir projetos de software: pasta digital por projeto,
tarefas, prazos, documentos, ferramentas e contas usadas, custos (fixos e por consumo), receitas,
resultado em **Superávit/Déficit**, Painel do Gestor e **Portal do Cliente** (somente consulta).

Perfis: **Administrador** (`owner`), **Colaborador** (`collaborator`), **Visualizador** (`viewer`) e
**Cliente** (sem papel interno; tabela `client_users`). Permissões finas em `role_permissions` /
`user_permission_overrides` (ex.: `financial.view`, `financial.edit`, `users.manage`).

## Diretriz permanente do dono do produto

Ao desenvolver, **apresente propostas de melhoria** quando identificar oportunidades, mas mantenha
o sistema com interfaces, layouts e funcionalidades **intuitivas, práticas e de fácil compreensão**
para todos os perfis (Administrador, Colaborador, Visualizador e Cliente).

## Stack

- TanStack Start + TanStack Router (rotas por arquivo em `src/routes`, links tipados, `src/routeTree.gen.ts` gerado)
- React 19, react-query, shadcn/ui (`src/components/ui`), Tailwind v4, lucide-react, sonner
- Supabase: Postgres com RLS, Auth, Storage (bucket privado `project-files`)
- Build: Vite 7 + Nitro (servidor SSR). Destino detectado automaticamente; fora de plataformas conhecidas gera Node em `.output/`
- **Node 22.12 ou mais recente** (exigido pelo TanStack Start; `.nvmrc` = 22)

## Comandos

```bash
bun install --frozen-lockfile   # dependências (bun.lock é a fonte da verdade)
cp .env.example .env        # preencha com o Supabase de HOMOLOGAÇÃO
bun run dev                 # http://localhost:8080
bun run typecheck           # tsc --noEmit
bun run lint                # eslint (há 2 erros "no-explicit-any" antigos em project-detail.tsx e projetos.tsx)
bun run build               # gera .output/
bun run start               # node .output/server/index.mjs (PORT=3000 por padrão)
bun run test:db             # suítes SQL num Postgres DESCARTÁVEL (veja abaixo)
```

### Testes do banco

`supabase/tests/local/run-all.sh` apaga e recria um banco, aplica `supabase/tests/local/supabase_stub.sql`
(simula `auth`/`storage` do Supabase) e todas as migrations, e roda cada suíte de `supabase/tests/`.
**Nunca aponte para um Supabase real** — o script recusa hosts `*.supabase.co`.

```bash
docker run -d --name iga-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 postgres:16
PGHOST=localhost PGPORT=54329 PGUSER=postgres PGPASSWORD=postgres bun run test:db
```

Estado esperado: **8 suítes, 213 aprovados, 0 falhas**. Sete suítes antigas (`bloco_*`, `storage_bloco_1_*`)
dependem de dados preexistentes e ficam fora por padrão (`INCLUDE_LEGACY=1` para rodar).

## Regras de segurança (não negociáveis)

1. **A RLS do banco é a autoridade.** Esconder algo na tela não é controle de acesso. Toda regra nova
   de acesso nasce em migration + teste SQL.
2. **`supabaseAdmin` (service role) só em funções de servidor** (`src/utils/*.functions.ts`, `client.server.ts`),
   sempre depois de verificar no próprio handler quem chama e se tem permissão. Nunca em código de navegador.
3. **Financeiro** (custos, rateio, orçamentos, assinaturas, receitas, resultado) exige `financial.view`;
   alterar exige `financial.edit`.
4. **Cliente** não lê nenhuma tabela interna. Tudo o que ele vê vem das funções `client_portal_*`
   (SECURITY DEFINER, já filtradas): projetos liberados (`projects.client_portal`), tarefas e documentos
   marcados (`client_visible`) e **somente valores já pagos** — nunca custos. Gatilhos impedem que um
   Cliente receba papel interno, seja participante, responsável por tarefa ou dono de projeto.
5. **Erros do Supabase Auth vêm em `{ error }`, não como exceção.** Sempre confira `error` antes de mostrar
   sucesso (login, recuperação e troca de senha, convites). Mensagens de recuperação continuam neutras
   ("se o e-mail estiver cadastrado…") para não revelar quais e-mails existem.
6. **Senhas, tokens e chaves** nunca em código, logs, PDFs, exportações ou mensagens. `.env` não é versionado.
7. **Não apague nem arquive repositórios, dados ou arquivos** sem confirmação explícita do Gestor.

## Migrations

- Ficam em `supabase/migrations/` e são aplicadas **em ordem**, **exatamente como estão**.
- **Migration aplicada é imutável.** Mudança = migration nova (`AAAAMMDDHHMMSS_descricao.sql`), idempotente
  (`IF NOT EXISTS`, `CREATE OR REPLACE`, `DROP POLICY IF EXISTS` antes de `CREATE POLICY`).
- Cada migration nova vem com uma suíte em `supabase/tests/<fase>.sql` no formato das existentes
  (transação, tabela `_r`, `APROVADO`/`FALHOU`, `ROLLBACK` no fim).
- Bucket de Storage não é criado por migration: crie pelo painel/CLI (`project-files`, privado, 50 MB).
- Depois de uma migration nova, regenere a verificação: `python3 supabase/tests/local/gerar_verificacao.py`
  (com `TEST_DB` apontando para o banco descartável recém-preparado).
- `src/integrations/supabase/types.ts` foi mantido à mão durante a transição. Com o Supabase próprio,
  prefira `supabase gen types typescript --project-id <ref> > src/integrations/supabase/types.ts` e revise o diff.

Consultas **somente leitura** para rodar no SQL Editor de um Supabase real:
- `supabase/tests/verificar_historico_migrations.sql` — repositório × registro de migrations do banco
- `supabase/tests/verificar_estado_banco.sql` — objetos de cada migration: completa/parcial/ausente/divergente
  (não prova execução nem confere GRANTs, CHECKs, índices ou dados de carga)
- `supabase/tests/verificar_contagem_registros.sql` — contagem por tabela, usuários e arquivos (comparar origem × destino)

**Nunca aplique migrations nem rode `db push` com base só nessas consultas.** Cruze histórico e objetos
(tabela de decisão em `docs/PORTABILIDADE.md`, seção 2.1) e peça aprovação do Gestor.

## Mapa do código

| Onde | O quê |
|---|---|
| `src/routes/` | Telas. Caminhos em português (`/painel`, `/projetos`, `/projetos/$projectId?secao=`, `/tarefas`, `/agenda`, `/clientes`, `/relatorios`, `/usuarios`, `/permissoes`, `/externos`, `/financeiro/*`, `/portal`). Arquivos em inglês (`dashboard.tsx`, `projects.tsx`…) são só redirecionamentos de rotas antigas. |
| `src/components/project-detail.tsx` | Pasta digital do projeto (seções visão geral, tarefas, financeiro, ferramentas, documentos, histórico, equipe) |
| `src/components/project-finance.tsx` | Receitas, parcelas e resultado (Superávit/Déficit) do projeto |
| `src/components/project-client-access.tsx` | Liberação do projeto no Portal do Cliente |
| `src/routes/painel.tsx` | Painel do Gestor (alertas de 7 dias, mês, resultado por projeto, custo sem projeto) |
| `src/routes/financeiro/` | Custos, assinaturas (despesas fixas automáticas), consumo e rateio, orçamentos, fornecedores, categorias |
| `src/routes/portal.tsx` | Portal do Cliente |
| `src/lib/auth-context.tsx` | Sessão, papéis, permissões, `isClient` |
| `src/lib/staff-profiles.ts` | Perfis da equipe sem Clientes (use em listas de responsável/participantes) |
| `src/utils/users.functions.ts` | Funções de servidor de usuários (convite, criação, perfil, redefinição de senha) |
| `docs/PROPOSTA-UNIFICACAO-E-ROADMAP.md` | Proposta, decisões e roteiro por fases |
| `docs/PORTABILIDADE.md` | Saída do Lovable: o que mudou e roteiro de validação/migração |
| `docs/historico-lovable/` | Registro histórico do período no Lovable (não usar para build) |

## Conceitos de negócio

- **Despesa fixa**: assinatura com geração automática por período até ser pausada/cancelada (`finance_generate_recurring_costs`).
- **Despesa variável**: lançada quando ocorre.
- **Rateio por consumo**: custo de uma conta de ferramenta (ex.: workspace Lovable) dividido entre projetos pelo uso
  (créditos), importado colando a página de uso; mês fechado congela o rateio.
- **Custo ocioso / sem projeto**: parte de uma despesa não atribuída a projeto (`v_finance_unallocated_costs`).
- **Receitas**: implantação (total em N parcelas) e recorrente (mensal); parcela passa por contratado → faturado → recebido.
- **Resultado**: receita − custo rateado; rótulos `surplus` (Superávit), `deficit` (Déficit), `balanced`, `none`
  (`v_project_financial_result`), sobre o recebido ou sobre o contratado.

## Fluxo de trabalho

- Uma branch e um PR por bloco de trabalho. **Agentes não fazem merge**; quem aprova e faz merge é o Gestor.
- Antes de abrir PR: `typecheck`, `build`, `test:db` e lint dos arquivos tocados. Não reformate arquivos inteiros
  (rode prettier só no que você escreveu) — diffs pequenos facilitam a revisão.
- No PR: o que muda para o usuário, como testar por perfil, migrations novas e a consulta de verificação esperada.

## Pendências conhecidas

- Fase 5: cofre de senhas (com revisão de segurança). Fase 6: Acervo de repositórios (backup e arquivamento com nomenclatura).
- Achado #13 da auditoria: a política de `audit_history` usa `can_view_project_dossier(entity_id)` com o id da linha filha.
- Migração dos dados do Lovable Cloud para o Supabase próprio: `docs/PORTABILIDADE.md`.
