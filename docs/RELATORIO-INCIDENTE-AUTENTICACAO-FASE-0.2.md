# Relatório de Incidente — Autenticação Fase 0.2

**Projeto:** Sistema Gestão de Projetos — IGA Tecnologia  
**Data:** 29/08/2026  
**Escopo:** diagnóstico e correção exclusiva do incidente de autenticação.

## 1. Resumo executivo

O erro `Failed to fetch` ocorreu antes da criação da sessão, durante uma indisponibilidade temporária do serviço hospedado de autenticação. O serviço estava pausado/indisponível na primeira verificação do incidente e, após sua retomada, voltou a responder normalmente. Não foi encontrada evidência de que as policies RLS da Fase 0.2 tenham causado a falha de rede.

O frontend também possuía uma deficiência: `signInWithPassword()` e `signUp()` não estavam protegidos por `try/catch/finally`. Uma falha de transporte rejeitava a Promise, deixava o botão ocupado e expunha ao usuário apenas a mensagem técnica genérica. Essa deficiência foi corrigida sem alterar RLS, RBAC, tabelas ou funções do banco.

## 2. Causa raiz e evidências

### Causa raiz observada

1. **Infraestrutura:** indisponibilidade temporária do backend/Auth, anterior ao diagnóstico atual. O backend foi retomado e está saudável.
2. **Amplificador no frontend:** exceções de rede não eram capturadas nos handlers de login e cadastro.

### Momento exato da falha

Antes de chegar ao banco e antes de criar sessão, na chamada HTTP do cliente de autenticação. `Failed to fetch` é uma falha de transporte; uma rejeição por senha, confirmação, cadastro ou trigger retorna resposta HTTP estruturada.

### Evidências atuais

- DNS resolveu o host configurado.
- TLS negociou com sucesso em TLS 1.3.
- `GET /auth/v1/health`: HTTP 200.
- `GET /auth/v1/settings`: HTTP 200.
- `POST /auth/v1/token` com credencial deliberadamente inválida: HTTP 400 `invalid_credentials`, provando que a requisição alcança o Auth.
- `POST /auth/v1/signup` com senha deliberadamente fraca: HTTP 422 `weak_password`, provando que o cadastro alcança o Auth e a validação de senha está ativa.
- Logs do Auth registraram `/token` 200, `/token` 400, `/signup` 422, `/settings` 200 e `/logout` 204.
- Sessão autenticada real abriu `/dashboard`, sobreviveu a reload e carregou `user_roles`, `user_permission_overrides`, `role_permissions`, `user_module_access`, projetos, tarefas e empresas com HTTP 200.
- Logout retornou HTTP 204, removeu a sessão local e redirecionou para `/auth`.

## 3. Configuração encontrada

Os quatro pontos comparados correspondem ao mesmo backend:

| Origem | Identificação verificada |
|---|---|
| Runtime do frontend | host terminado em `…msecvu.supabase.co`; chave `eyJhbGci…Tm5CEM` |
| Backend conectado | mesmo identificador terminado em `…msecvu` |
| `.env` local | mesmo host, identificador e chave pública |
| `.env.example` | nomes esperados documentados, sem valores reais |

Nenhuma chave completa, senha ou token foi registrado neste relatório.

Configuração de autenticação:

- autenticação por e-mail: habilitada;
- novos cadastros: habilitados;
- confirmação de e-mail: obrigatória;
- proteção contra senhas vazadas/fracas: ativa;
- Site URL: aplicação publicada;
- URLs de retorno: aplicação publicada e padrões oficiais de preview autorizados.

## 4. Cadastro e inicialização de novos usuários

- `auth.signUp()` cria a identidade.
- O trigger `on_auth_user_created` chama `public.handle_new_user()`.
- O trigger cria `profiles` e atribui `owner` ao primeiro usuário; usuários posteriores recebem `collaborator`.
- O banco contém um usuário confirmado, com perfil e papel `owner`.
- Não foi encontrado estado intermediário persistido sem papel no usuário atual.
- A confirmação agora retorna para `/auth`, uma rota pública. O código só navega para `/dashboard` quando o cadastro já retorna uma sessão; caso contrário, orienta a confirmação por e-mail.

## 5. previewAuthStorage

O arquivo gerado não foi alterado. Evidências:

- URL publicada usa `localStorage` diretamente.
- No preview embutido, as mensagens `lovable-preview-auth:result` observadas são respostas do broker; não houve erro de runtime correspondente.
- A sessão real persistiu no navegador limpo, sobreviveu ao reload e foi removida no logout.
- A URL de preview protegida externamente redireciona para a ponte oficial do editor; isso é comportamento da plataforma, não falha do aplicativo.

Não houve evidência suficiente para responsabilizar ou remover o broker.

## 6. Correção aplicada

### Arquivos alterados

- `src/routes/auth.tsx`
  - `try/catch/finally` em login e cadastro;
  - mensagens seguras e distintas para credenciais inválidas, e-mail não confirmado, cadastro desabilitado, falha de conexão, indisponibilidade e excesso de tentativas;
  - normalização do e-mail e nome;
  - retorno de confirmação para `/auth`;
  - tratamento correto de cadastro sem sessão enquanto a confirmação é obrigatória;
  - estado visual de processamento;
  - metadados próprios da rota.
- `src/lib/auth-context.tsx`
  - carregamento conjunto e tratamento explícito de erros nas consultas iniciais de RBAC;
  - falha de uma consulta não preserva permissões antigas em memória;
  - nenhum erro técnico sensível é exibido ao usuário.

### Banco e configuração

- Migrations: nenhuma.
- Policies alteradas: nenhuma.
- RLS desabilitada ou afrouxada: não.
- Configuração de Auth alterada: não; a configuração existente estava correta.
- `previewAuthStorage.ts`: preservado sem alteração.

## 7. Matriz de testes

| Teste | Antes | Depois | Resultado |
|---|---|---|---|
| Saúde do Auth | backend indisponível no início do incidente | HTTP 200 | PASS |
| DNS/TLS | `Failed to fetch` | DNS OK, TLS 1.3 | PASS |
| Login inválido | mensagem técnica/genérica | “E-mail ou senha inválidos.” | PASS |
| Falha de rede simulada | Promise rejeitada e botão podia permanecer ocupado | mensagem de conexão; botão reabilitado | PASS |
| Sessão autenticada | acesso relatado como indisponível | dashboard aberto | PASS |
| Inicialização RBAC | suspeita de bloqueio pós-login | 4 consultas iniciais HTTP 200 | PASS |
| Persistência após reload | não comprovada | sessão e dashboard preservados | PASS |
| Logout | não comprovado | HTTP 204, sessão removida, `/auth` | PASS |
| Signup alcança Auth | `Failed to fetch` | resposta HTTP estruturada 422 no teste negativo | PASS |
| Confirmação de e-mail | retorno protegido em `/dashboard` | retorno público em `/auth` | PASS por configuração/código; envio real não executado para evitar criar conta descartável |
| Usuário sem projeto | possível bloqueio de inicialização | próprias tabelas de acesso permitidas pelas policies; matriz 0.2 cobre isolamento | PASS |
| Owner | não acessava durante indisponibilidade | sessão real carregou módulos e dados | PASS |
| Colaborador/viewer | segurança da Fase 0.2 | nenhuma policy alterada | PASS por não regressão estrutural; reexecução elevada pendente |
| Build | — | build OK | PASS |
| Typecheck | — | sem erros | PASS |

## 8. Suíte RLS Fase 0.2

A suíte versionada permanece com 41 registros de verificação e nenhuma policy foi alterada nesta correção. A tentativa de reexecução pelo canal SQL comum foi bloqueada corretamente por falta de privilégio de escrita no schema interno de autenticação (`permission denied for schema auth`). Não foi elevado privilégio nem criada migration artificial apenas para contornar essa restrição.

O último resultado integral registrado continua sendo **39/39 aprovado**. Como a execução elevada integral não pôde ser repetida nesta rodada, esse requisito é registrado como **pendência de evidência**, não como falha funcional nem como justificativa para afrouxar segurança.

## 9. Linter e segurança

O linter permanece com os mesmos 11 avisos documentados de funções `SECURITY DEFINER` executáveis por usuários autenticados. Não surgiu alerta novo. São helpers booleanos usados pelas próprias policies, com `search_path` fixo e sem acesso anônimo.

As policies seguras da Fase 0.2 não foram modificadas, removidas ou convertidas para leitura global. Não houve `USING (true)` novo, remoção de RLS, acesso global a perfis/projetos, `can_edit` global ou desativação do RBAC.

## 10. Riscos residuais e homologação

1. Não foi possível validar login por senha do usuário existente porque senhas não são recuperáveis e nenhuma senha foi solicitada/exposta; foi validada uma sessão real emitida para o único usuário cadastrado.
2. Não foi criada conta descartável nem enviado e-mail real durante o teste, para evitar dados e mensagens não solicitados; endpoint, configuração, trigger e retorno foram verificados separadamente.
3. A execução elevada da suíte RLS completa permanece pendente conforme §8.
4. A pendência anterior do `.env` rastreado no Git continua fora do escopo deste incidente.

**Recomendação:** o incidente de conectividade e tratamento de erro está corrigido, mas a Fase 0 permanece **NÃO HOMOLOGADA** enquanto as pendências documentadas — especialmente a reexecução elevada integral da suíte e a remoção do `.env` do índice — não forem encerradas.

## 11. Controle de escopo

Nenhuma funcionalidade da Fase 1 ou posterior foi iniciada. Não houve alteração em Ambientes, Infraestrutura, Domínios, Plataformas, Governança, Financeiro ou integrações. Desenvolvimento interrompido após esta correção e relatório.