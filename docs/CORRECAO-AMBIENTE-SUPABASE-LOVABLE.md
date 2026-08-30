# Correção de Ambiente — Variáveis Públicas do Backend (Lovable Cloud)

**Projeto:** Sistema Gestão de Projetos — IGA Tecnologia
**Escopo:** exclusivamente operacional/configuracional. Fase 3 não iniciada.

## 1. Sintoma

Aplicação publicada exibindo, no console e na tela de erro:

`Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY. Connect Supabase in Lovable Cloud.`

Confirmado com navegador real na URL publicada (HTTP 200, mas erro de inicialização do cliente do backend).

## 2. Causa raiz

O build do frontend injeta apenas variáveis com prefixo `VITE_`, lidas do arquivo `.env` do diretório de build (`loadEnv(mode, cwd, "VITE_")`).

Após a remoção correta do `.env` do índice do Git (medida de segurança já homologada), o ambiente de build/publicação passou a não dispor de nenhuma fonte para:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_SUPABASE_PROJECT_ID`

Nem dos nomes equivalentes sem prefixo (`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PROJECT_ID`).

O ambiente local/preview continuava funcionando porque o `.env` local (ignorado pelo Git) ainda existe. Por isso o preview respondia normalmente e apenas a publicação falhava.

## 3. Correção aplicada

1. **Variáveis públicas cadastradas no cofre de ambiente do Lovable**, com nomes não reservados (o prefixo `VITE_` é reservado à plataforma e não pode ser criado manualmente):
   - `PUBLIC_SUPABASE_URL`
   - `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   - `PUBLIC_SUPABASE_PROJECT_ID`

   Somente valores públicos (URL do projeto e chave anônima/publishable). Nenhum service role, token ou senha foi cadastrado. Nenhum valor real consta neste relatório.

2. **Compatibilidade de nomes no build** (`vite.config.ts`), sem qualquer valor real no código:
   a resolução das variáveis do frontend passou a seguir a ordem
   `VITE_<NOME>` → `SUPABASE_<NOME>` → `PUBLIC_SUPABASE_<NOME>`,
   preservando compatibilidade simultânea com Vite local, GitHub e execução futura em VPS/Docker (basta prover qualquer um dos conjuntos de nomes por variáveis de ambiente).

3. **`src/integrations/supabase/client.ts` não foi alterado.**

4. **Nenhuma alteração** de arquitetura, banco, RLS, RBAC, Auth, Storage ou funcionalidade.

## 4. Verificação de segurança

- `.env` **não** está no índice do Git (apenas `.env.example` é versionado).
- `.gitignore` mantém `.env` e `.env.*` com exceção `!.env.example`.
- `.env.example` contém apenas placeholders.
- Nenhuma chave secreta/service role no código-fonte.
- Frontend utiliza exclusivamente a chave pública/anon.
- Backend hospedado verificado como ativo e saudável; mesmo projeto, sem migração de dados nem troca de identificador.

## 5. Build e publicação

- Build de produção executado localmente com sucesso, inclusive com o nome `VITE_SUPABASE_URL` propositalmente removido do ambiente, comprovando a resolução por nomes alternativos.
- Typecheck/build do ambiente: OK.
- Publicações executadas nesta rodada. O bundle publicado permaneceu com o mesmo identificador de artefato durante a rodada, indicando que a alteração de `vite.config.ts` ainda não havia sido capturada pelo commit do ambiente de publicação no momento das tentativas.

## 6. Situação final

- Causa raiz identificada e corrigida na configuração e na resolução de nomes de variáveis.
- **Pendência operacional:** é necessária **uma nova publicação** após o commit desta alteração para que o artefato publicado seja regerado com as variáveis públicas injetadas. Enquanto isso, a URL publicada ainda serve o artefato anterior, com a mensagem de erro.
- Testes funcionais completos na URL publicada (login, dashboard, projetos, dossiê, agendamentos HTTP 200) serão executados imediatamente após a regeneração do artefato.

## 7. Encerramento

Desenvolvimento interrompido. Fase 3 não iniciada. Aguardando homologação expressa.

## Rodada de republicação — 30/08/2026 10:56 UTC

- Nova publicação executada. `x-deployment-id` mudou de `2a5741e8…` para `0cea0784…`, comprovando novo deploy.
- **O hash do bundle NÃO mudou**: continua `assets/index-0wrXZiUM.js`. Inspeção do artefato publicado: 0 ocorrências do identificador público do backend e 1 ocorrência da mensagem de erro de configuração.
- Teste em navegador real (`/auth`, HTTP 200): a tela exibe "Missing Supabase environment variable(s): SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY". Login, Dashboard, Projetos, dossiê e agendamentos ficaram **bloqueados** e não puderam ser testados.
- Causa raiz confirmada: o pipeline de build/publicação não recebe as variáveis públicas. O `.env` local existe e contém os valores corretos, porém está fora do Git (correto por política) e o build oficial parte da árvore versionada. Os nomes `PUBLIC_SUPABASE_*` cadastrados são **segredos de runtime**, indisponíveis durante o build, portanto o alias em `vite.config.ts` não encontra valor algum no momento da compilação.
- Segurança reconfirmada: `.env` fora do Git, `.gitignore` protegendo `.env`/`.env.*` com exceção de `.env.example`, `.env.example` somente com placeholders, nenhum valor real em código, nenhuma service role no frontend.

### Alternativas para autorização do responsável

1. Reintroduzir o `.env` gerenciado pela plataforma na árvore versionada — contém exclusivamente URL, project ID e chave pública/anon (nenhum segredo). É o comportamento padrão do Lovable Cloud e restabelece o build imediatamente.
2. Injeção em runtime: o servidor SSR (que possui `SUPABASE_URL`/`SUPABASE_PUBLISHABLE_KEY` como variáveis de runtime) publica a configuração pública para o cliente, mapeando `process.env.SUPABASE_*` no bundle para um objeto global preenchido em tempo de execução. Não grava valores no código e mantém portabilidade com Vite/GitHub/VPS, mas exige alteração de `vite.config.ts` e do root route.

Nenhuma das duas foi executada nesta rodada por exigir decisão do responsável. Fase 3 não iniciada.
