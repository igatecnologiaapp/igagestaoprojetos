# BLOCO 2C — Homologação Funcional e Fechamento do Dossiê Técnico

Projeto: Sistema Gestão de Projetos — IGA Tecnologia
Repositório oficial: https://github.com/igatecnologiaapp/igagestaoprojetos
Commit-base: `8ebd2e5d44f0737feee34844dc5fcbba7563f5fc` (homologação do Bloco 2A) + entrega do Bloco 2B.

## 1. Escopo executado

Validação funcional, com sessão autenticada real (Playwright sobre o app em execução), das funcionalidades entregues no Bloco 2B: CRUD e filtro de Links, Lista/Linha do tempo de Prompts, Histórico visual com filtros, validação mobile (390×844) e regressão funcional básica.

Nenhuma nova funcionalidade, tabela, integração, migration ou alteração arquitetural foi criada.

## 2. Regra de preservação — cumprida

Não foram alterados: RLS, RBAC, Auth, Storage, policies, funções de segurança, estrutura de compartilhamentos, modelo de auditoria, arquitetura do módulo Projetos, DT-01 e DT-02. Nenhuma migration foi executada neste bloco. Fases 3 e 4 não foram iniciadas.

## 3. Arquivos alterados (correções mínimas de responsividade)

| Arquivo | Correção |
| --- | --- |
| `src/components/project-detail.tsx` | Diálogo do dossiê limitado à largura da viewport (`w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-4xl`), overflow horizontal contido e padding responsivo |
| `src/components/project-records.tsx` | Diálogo de registro com largura responsiva, formulário `grid-cols-1 sm:grid-cols-2`, campos/rodapé em `sm:col-span-2` |
| `src/components/app-shell.tsx` | Cabeçalho mobile em flex com título encolhível e navegação rolável horizontalmente (`ml-auto min-w-0 overflow-x-auto`) |
| `src/routes/projects.tsx` | `min-w-0` no card de projeto (contribuição de min-content do item de grid) e busca `min-w-0 sm:min-w-56` — eliminou o overflow horizontal de 27px no mobile |

Nenhuma lógica de negócio, consulta, permissão ou contrato de dados foi alterado — apenas classes de apresentação.

## 4. Dados controlados de teste

Criados exclusivamente para evidência, identificados com o prefixo `[TESTE 2C]`:

- 2 links: `[TESTE 2C] Portal produção` (categoria Produção) e `[TESTE 2C] Repositório` (categoria GitHub);
- 2 prompts com datas distintas: `[TESTE 2C] Prompt inicial` (commit `aaaa111`) e `[TESTE 2C] Prompt de ajuste` (commit `bbbb222`, editado para `cccc333`).

**Remoção comprovada** (via UI, mesma sessão autenticada, e conferida no banco):

```
Links restantes: 0
ChatGPT / Prompts restantes: 0
select ... -> links: 0 | prompts: 0 | total_links: 0 | total_prompts: 0
```

Nenhum dado real foi removido (as tabelas não continham registros reais além dos de teste).

## 5. Validação — Links (desktop, sessão real)

| Item | Resultado |
| --- | --- |
| Criar link | OK (2 criados, categorias distintas) |
| Editar link | OK (`[TESTE 2C] Portal produção EDITADO` visível) |
| Excluir link | OK (exclusão via UI, lista zerada) |
| Filtro por categoria | OK (`2 de 2` → `1 de 2` ao filtrar GitHub) |
| Contador | OK |
| Estado vazio | OK (estado tracejado após exclusão) |
| Tabela utilizada | `project_links` existente, sem estrutura paralela |
| Erros de página | nenhum |

## 6. Validação — Prompts

| Item | Resultado |
| --- | --- |
| Dois prompts com datas distintas | OK |
| Visualização Lista | OK (2 itens) |
| Visualização Linha do tempo | OK, ordem cronológica correta |
| Alternância Lista/Timeline | OK |
| Referência de commit | OK (exibida e editada para `cccc333`) |
| Data, título e demais campos | OK |
| Criação/edição sem regressão | OK |
| Estrutura | `project_prompts` existente; nenhuma segunda estrutura criada |

## 7. Validação — Histórico

| Item | Resultado |
| --- | --- |
| Linguagem legível (pt-BR) | OK — ex.: “Iga Tecnologia alterou um prompt (commit_ref)” |
| Filtro por período | OK (`Últimos 7 dias` → 7 eventos) |
| Filtro por tipo | OK (`Link` → `Histórico (3)`) |
| Filtro por evento | OK (`Link` + `Excluído` → `Histórico (0)`) |
| Filtro por usuário | OK (presente e funcional) |
| Autoria e data/hora | OK |
| Sem resultados | OK — “Nenhum evento para os filtros selecionados.” |
| Ausência de JSON bruto como interface principal | OK |
| Regras de acesso | inalteradas; leitura continua sujeita às policies existentes |

## 8. Validação mobile (390×844)

Após as correções mínimas de responsividade:

```
Visão geral      sw=390 cw=390
Links            sw=390 cw=390
ChatGPT/Prompts  sw=390 cw=390
Histórico        sw=390 cw=390
modal            sw=390 cw=390
erros: []
```

Navegação entre abas, filtros, botões e modais legíveis e operáveis; sem overflow horizontal indevido. Evidências em `/tmp/browser/b2c/shots/` (M1–M5).

## 9. Regressão funcional

Rotas carregadas sem erro: `/dashboard`, `/companies`, `/projects`, `/tasks`, `/appointments`, `/reports`, `/users`, `/permissions`, `/externals`.
Abas do projeto carregadas sem erro: Visão geral, Tarefas, ChatGPT/Prompts, GitHub, Lovable, E-mails, Links, Acessos, Compartilhamento, Histórico. `erros: []`.

## 10. Build e typecheck

- `tsgo --noEmit`: sem erros.
- Build: `build OK`.

## 11. Testes não executados / limitações

- Reexecução de `supabase/tests/rls_bloco_1_menor_privilegio.sql` e `supabase/tests/storage_bloco_1_regressao.sql` **com JWT real de usuário** não foi possível neste ambiente (sem emissão de JWT por Auth Admin para múltiplos perfis). Resultado anterior válido: Bloco 1 6/6 e regressão de Storage aprovada. **Pendência mantida explicitamente aberta para homologação pré-produção.**
- Permanecem 12 avisos intencionais de `SECURITY DEFINER` do linter, já documentados em blocos anteriores.

## 12. Dívidas técnicas

- **DT-01** — contexto completo da linha `projects` ainda acessível em determinados cenários de `task_share`. Inalterada.
- **DT-02** — responsáveis/criadores de tarefas considerados membros do projeto para acesso ao dossiê. Inalterada.
- **DT-03 (nova) — correlação histórica de entidades excluídas.** Eventos `deleted` podem deixar de aparecer no histórico do projeto quando a associação depende exclusivamente da existência atual do registro relacionado (o escopo de auditoria é montado a partir dos IDs vivos). *Nada foi alterado neste bloco.* Proposta futura (a autorizar): persistir a correlação no momento do evento — coluna `project_id` (ou chave de correlação em `changes`) preenchida por trigger em `audit_history` para entidades filhas, com backfill controlado, mantendo a imutabilidade da tabela.

## 13. Riscos residuais

- Validação com múltiplos perfis reais (owner/collaborator/viewer, grants/denies) permanece dependente de JWT real.
- Histórico de exclusões sujeito ao DT-03 até autorização de correção.
- Ajustes de responsividade foram pontuais; telas fora do módulo Projetos não foram redesenhadas.

## 14. SHA final

O SHA final não é obtido neste ambiente (sem operações de Git). Deve ser lido no branch `main` do repositório oficial após a sincronização desta entrega.

## 15. Encerramento

Bloco 2C concluído. Desenvolvimento interrompido. Aguardando homologação expressa antes de qualquer nova etapa.
