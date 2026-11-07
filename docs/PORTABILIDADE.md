# Portabilidade — saída do Lovable

**Marco de partida:** branch `marco/estado-antes-do-codex`, commit
`640627834567bc106c9d6cdf21fb08d8eeb59319` ("Aplicou migration Fase 4"), igual ao `main` em 07/11/2026.
Fases 1 a 4 concluídas e aplicadas no banco do Lovable Cloud.

Plano em três etapas, sem tocar no banco ativo até a troca oficial:

1. **Preparar o código** (este PR): sem dependências do Lovable, pronto para o Codex e para publicar fora.
2. **Validar em homologação**: reconciliar o Supabase de homologação com o repositório, publicar a interface
   com dados de teste e validar os fluxos.
3. **Ensaiar a migração dos dados** antes da troca oficial.

---

## Etapa 1 — O que este PR muda

| Antes (Lovable) | Agora |
|---|---|
| `@lovable.dev/vite-tanstack-config` montava o Vite e publicava sempre no Cloudflare | `vite.config.ts` próprio com os mesmos plugins; Nitro detecta o destino (Vercel, Netlify, Cloudflare) ou gera servidor Node |
| `wrangler.jsonc`, `@cloudflare/vite-plugin`, `.lovable/` | Removidos |
| Logo servido por `/__l5e/assets-v1/...` (proxy do Lovable; quebraria fora dele) | `src/assets/iga-logo-oficial.png` no repositório |
| Imagem de compartilhamento em `storage.googleapis.com/gpt-engineer-file-uploads/...` | `public/iga-logo.png` |
| `bun.lock` com 67 pacotes baixados do cache privado do Lovable (`lovable-core-prod/sandbox-npm-cache`) | Registro público do npm (hashes de integridade conferidos) |
| `previewAuthStorage.ts` (sessão via janela de pré-visualização do Lovable) | Sessão padrão do supabase-js (localStorage) |
| `drizzle.config.ts` com `LOVABLE_DB_MIGRATION_URL` e `drizzle/migrations` (cópias geradas pelo Lovable) | Movidos para `docs/historico-lovable/drizzle/` como registro |
| `supabase/config.toml` apontando para o banco do Lovable | Nome local neutro; o banco remoto é escolhido com `supabase link` |
| README com o prompt original do Lovable | `docs/historico-lovable/PROMPT-ORIGINAL.md`; README novo |
| Testes SQL só rodavam no ambiente do Claude | `bun run test:db` em qualquer Postgres descartável |

O que **não** muda: nenhuma tela, regra de acesso ou migration. As referências a "Lovable" que continuam no
código são **dados do negócio** (a ferramenta Lovable como custo e conta dos projetos), não dependências.

Verificado: `typecheck` ok; `build` gera `.output/` (Node); servidor sobe e serve login e logo; variáveis
públicas funcionam tanto no build quanto em tempo de execução (um build serve homologação e produção);
8 suítes SQL, 213 aprovados.

---

## Etapa 2 — Validar em homologação (Supabase próprio)

### 2.1 Reconciliar o banco (somente leitura)
1. No SQL Editor do Supabase de **homologação**, rode `supabase/tests/verificar_estado_banco.sql`.
2. Leia a coluna `situacao` de cada migration:
   - `completa`: nada a fazer;
   - `ausente`: aplicar;
   - `parcial` ou `divergente`: **parar e analisar** com a consulta de detalhe (fim do arquivo) antes de aplicar
     qualquer coisa. Divergência pode ser só formatação de outra versão do Postgres.
3. Registre o resultado no PR/issue antes de mexer no banco.

### 2.2 Aplicar o que falta
- Em ordem de nome, exatamente como estão (SQL Editor ou `supabase link --project-ref <ref>` + `supabase db push`).
- Bucket `project-files`: privado, limite de 50 MB (painel → Storage).
- Rode a consulta de verificação de novo: tudo `completa`.

### 2.3 Configurar a autenticação
- **Desligar cadastro público** (Authentication → Providers/Settings → desabilitar sign-ups). O gatilho
  `handle_new_user` dá papel **Colaborador** a qualquer conta nova e **Administrador** à primeira conta do banco.
- **Primeiro Administrador**: crie a primeira conta pelo painel (Authentication → Add user); em banco vazio ela
  vira Administrador. Os demais usuários são criados pela tela **Usuários** do sistema.
- **URLs**: Site URL = endereço publicado; Redirect URLs incluem `<endereço>/reset-password`.
- **E-mail (SMTP próprio)** e modelos de convite/redefinição em português.

### 2.4 Publicar a interface
- Requisitos: Node 20+, `bun install`, `bun run build`; iniciar com `bun run start` (ou o adaptador da plataforma).
- Variáveis (veja `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`,
  `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID` e, **como segredo de servidor**,
  `SUPABASE_SERVICE_ROLE_KEY` (necessária para convidar/criar usuários e redefinir senhas).
- Vercel (produção recomendada): importe o repositório, framework "Other", build `bun run build`; o Nitro detecta
  a Vercel sozinho. Cadastre as variáveis em Production e Preview.

### 2.5 Roteiro de validação (com dados de teste)
| Fluxo | Como validar |
|---|---|
| Login e mostrar/ocultar senha | Entrar com o Administrador |
| Convite por e-mail e criação direta | Criar um Colaborador por convite e um Visualizador com senha provisória (troca obrigatória no 1º acesso) |
| Redefinição de senha | Pelo e-mail e pelo Administrador |
| Permissões | Colaborador sem Financeiro não vê custos (tela e banco); Visualizador não edita |
| Pasta do projeto | 7 seções; enviar, baixar, compartilhar e excluir documento |
| Financeiro | Assinatura gera despesa fixa; rateio por consumo; receita em parcelas; Superávit/Déficit |
| Painel do Gestor | Alertas de 7 dias, mês, resultado por projeto, custo sem projeto |
| Portal do Cliente | Cliente vê só o projeto liberado, tarefas/documentos marcados e valores pagos; baixa só o compartilhado; não acessa `/painel` |
| Anexos | Download de arquivo grande; arquivo de outro projeto negado |

A prévia antiga no Lovable **não** comprova a Fase 4 fora dele; esta validação comprova.

---

## Etapa 3 — Ensaiar a migração dos dados

O Lovable Cloud não expõe acesso direto ao banco nem às chaves de serviço, e não pode ser desconectado do
projeto. A saída é exportar e importar. **Faça primeiro um ensaio completo num Supabase descartável.**

### 3.1 Princípios
- **Preservar os vínculos**: quase tudo referencia `auth.users(id)` (`created_by`, `owner_id`, `assignee_id`,
  `user_id`…). Os usuários precisam chegar ao destino **com os mesmos ids**, antes dos dados públicos.
- **Senhas**: o plano de referência é **redefinição de senha** por todos no primeiro acesso. Preservar credenciais
  só vale depois de demonstrado num ensaio autorizado (ex.: a ferramenta de código aberto da Dreamlit, que precisa
  ser avaliada antes de receber qualquer acesso aos dados).
- **Origem intocada**: o Lovable Cloud continua no ar e sem alterações até a validação do destino.

### 3.2 Ordem sugerida do ensaio
1. Estrutura no destino: todas as migrations (Etapa 2), bucket criado, verificação `completa`.
2. Contagem de origem: `supabase/tests/verificar_contagem_registros.sql` no Lovable Cloud (SQL Editor do Lovable). Guardar o resultado.
3. Usuários: importar `auth.users` com os mesmos ids. Atenção: o gatilho `on_auth_user_created` cria
   `profiles` e `user_roles` para cada usuário inserido; desative-o durante a importação ou limpe essas linhas antes
   de importar as da origem (senão haverá conflito ou papéis errados).
4. Dados públicos: tabelas na ordem das chaves estrangeiras (empresas → projetos → tarefas → …); gatilhos de
   auditoria e de atividade desligados durante a carga para não gerar histórico falso.
5. Arquivos: copiar os objetos do bucket `project-files` **mantendo o caminho** (`<id do projeto>/...`), que é o que
   `project_files.storage_path` guarda.
6. Contagem de destino: mesma consulta; comparar linha a linha (quantidade e controle).
7. Validação funcional (2.5) com usuários reais em modo de teste.

### 3.3 Troca oficial
Janela combinada → congelar uso no Lovable → exportar/importar (roteiro ensaiado) → contagens batem → apontar a
publicação para o Supabase próprio → avisar usuários (redefinição de senha) → manter o Lovable só leitura por um
período antes de desativar.
