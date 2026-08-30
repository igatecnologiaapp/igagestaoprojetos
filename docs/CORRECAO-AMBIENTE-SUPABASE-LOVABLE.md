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

## Rodada de restauração via runtime injection — 30/08/2026 11:30 UTC

### 1. Auditoria do security finding crítico

- **Nome:** Appointment participant lists exposed to any authenticated user (`BROKEN_RLS_LOGIC` / `appointment_participants_select_logic_bug`).
- **Severidade reportada:** crítica (error).
- **Objeto afetado:** policy SELECT da tabela `appointment_participants`.
- **Evidência:** consulta a `pg_policies` mostra a policy vigente como
  `((user_id = auth.uid()) OR can_view_appointment(appointment_id, auth.uid()))`,
  sem qualquer comparação autorreferencial `ap.id = ap.appointment_id`.
- **Origem:** **pré-existente e já corrigido** pelo bloco corretivo DT-04 (migration `20260830021211_...`). O finding estava **obsoleto** (resultado de varredura anterior à correção).
- **Risco real:** nenhum no estado atual do banco.
- **Correção recomendada:** nenhuma; nova varredura executada nesta rodada retornou **0 findings críticos**. Permanece apenas o aviso conhecido `SECURITY DEFINER` executável por usuários autenticados (severidade warn, necessário ao modelo RBAC, já documentado). Nenhum finding foi marcado como "ignore".
- Nenhuma alteração de RLS/RBAC/Auth/Storage/banco foi necessária nesta rodada.

### 2. Decisão arquitetural final

`.env` permanece fora do Git. Adotada **injeção em runtime via SSR**: o servidor lê as variáveis públicas do próprio ambiente e as publica ao cliente; o build embute valores apenas quando o ambiente de build os expõe.

### 3. Arquivos alterados

- `src/lib/public-env.functions.ts` (novo): server function `getPublicEnv`, lê `VITE_* → SUPABASE_* → PUBLIC_SUPABASE_*` dentro do handler e devolve somente URL, chave publishable/anon e project id.
- `src/routes/__root.tsx`: `loader` obtém a configuração pública (no cliente reaproveita o valor já injetado) e o componente raiz emite um `<script>` inline que define `window.__PUBLIC_ENV__` e as globais `__PUBLIC_ENV_VITE_*__`.
- `vite.config.ts`: fallback simplificado e unificado — cada `import.meta.env.VITE_*` recebe o literal quando o ambiente de build o fornece, senão a referência `globalThis.__PUBLIC_ENV_VITE_*__`. Não há mecanismos concorrentes acumulados.
- `src/integrations/supabase/client.ts`: **não alterado**.

### 4. Fluxo servidor → cliente

`process.env` (runtime do servidor) → `getPublicEnv()` (server function) → loader do root → `<script>` inline → globais do navegador → substituição de `import.meta.env.VITE_*` feita no build. Em SSR o cliente Supabase continua usando o fallback `process.env.SUPABASE_*`. Compatível com Lovable Cloud, GitHub, Vite local e VPS/Docker (basta prover qualquer um dos conjuntos de nomes).

### 5. Teste de vazamento

Bundle publicado (`assets/index-BB_mJ_k_.js`): 0 ocorrências de `service_role`, `SERVICE_ROLE` ou `sb_secret`. Apenas URL pública e chave anon/publishable, públicos por natureza. Não há dump de `process.env`: somente três chaves explicitamente listadas são expostas. Nenhum valor real consta no código-fonte nem neste relatório.

### 6. Build e publicação

- Build de produção executado com todas as variáveis removidas do ambiente: **sucesso**, com o bundle referenciando a global de runtime.
- Nova publicação: **deployment ID** mudou de `0cea0784…` para `81a87a2a…`; **hash do bundle** mudou de `index-0wrXZiUM.js` para `index-BB_mJ_k_.js`.
- Mensagem `Missing Supabase environment variable(s)`: **0 ocorrências** no HTML publicado.

### 7. Testes funcionais (navegador real, URL publicada)

| Item | Resultado |
| --- | --- |
| Tela de login `/auth` | OK, sem erro de configuração |
| Sessão autenticada | OK |
| Dashboard | OK |
| Projetos | OK |
| Dossiê do projeto | OK |
| Aba Governança | OK |
| Aba Histórico | OK |
| Agendamentos | HTTP 200 |
| Requisições Supabase | todas 2xx (nenhuma ≥ 400) |
| `Failed to fetch` | ausente |
| Erros críticos no console | nenhum |

### 8. Resultado final

Acesso à aplicação publicada **restaurado**. `.env` fora do Git, `.env.example` somente com placeholders, nenhum segredo no repositório ou no bundle. Banco, RLS, RBAC, Auth, Storage, DT-01 a DT-04 e a Fase 2 não foram alterados.

Desenvolvimento interrompido. Fase 3 não iniciada. Aguardando homologação expressa.
