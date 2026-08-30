# BLOCO 3B — Linha do Tempo e Rastreabilidade do Desenvolvimento

**Sistema:** Gestão de Projetos — IGA Tecnologia
**Repositório oficial:** https://github.com/igatecnologiaapp/igagestaoprojetos
**Commit-base homologado:** 71c5e1fb198739380d6ed88b87247799d62c2d7a
**SHA final:** não disponível no ambiente de execução (versionamento gerenciado pela plataforma). Registrar após a sincronização do branch `main`.
**Escopo:** exclusivamente Bloco 3B. Bloco 3C não iniciado.

---

## 1. Diagnóstico

As informações necessárias à rastreabilidade já existiam integralmente no banco:

- `project_prompts` (com `prompt_date`, `commit_ref`, `url`, `purpose`, `sent_to_lovable_at`);
- `project_development_records` (com `record_type`, `event_date`, `commit_ref`, `version_ref`, `environment`, `result`, `responsible_user_id`).

Faltava apenas **composição visual**: os dois conjuntos eram exibidos em seções separadas, sem correlação por commit nem ordenação conjunta. Nenhuma necessidade de migration foi identificada durante a análise.

## 2. Arquivos alterados / criados

| Arquivo | Natureza |
|---|---|
| `src/components/project-development-timeline.tsx` | **novo** — componente único `ProjectDevelopmentTimeline` |
| `src/components/project-detail.tsx` | alterado — timeline inserida no topo da aba Governança |
| `src/components/audit-history.tsx` | alterado — rótulos humanos das entidades/campos de governança (somente apresentação) |
| `docs/BLOCO-3B-RELATORIO-TECNICO.md` | **novo** — este relatório |

## 3. Arquitetura utilizada

Composição em memória no frontend. A timeline **não** é persistida, **não** copia registros entre tabelas e **não** cria relacionamento no banco. Os eventos são normalizados em uma estrutura única (`TimelineEvent`) e ordenados/filtrados em memória.

## 4. Fontes de dados

Somente duas, ambas já existentes:

- `project_prompts` — queryKey `["project-records", "project_prompts", projectId]`;
- `project_development_records` — queryKey `["project-records", "project_development_records", projectId]`.

As queryKeys são **exatamente as mesmas** usadas por `RecordSection` e pela timeline de prompts, de modo que o React Query compartilha o cache: abrir a aba Governança não gera consulta adicional quando os dados já foram carregados, e qualquer CRUD invalida a timeline automaticamente. Sem realtime, sem polling.

## 5. Regra de correlação por commit

- normalização: `trim()` + minúsculas (case-insensitive, ignora espaços);
- correspondência: igualdade exata **ou** prefixo, exigindo no mínimo 7 caracteres em ambos os lados (evita falso positivo com valores curtos);
- eventos correlacionados recebem o selo visual **“Relacionado #N”**;
- selo aparece somente quando há **mais de um** evento no mesmo grupo;
- nenhum dado original é alterado; nenhuma FK, tabela associativa ou índice foi criado.

## 6. Filtros

Todos operam no frontend, sobre dados já carregados:

- **Período:** todo o período / 7 / 30 / 90 dias;
- **Tipo de evento:** Prompt + Decisão, Versão, Teste, Homologação, Implantação;
- **Responsável:** exibido apenas quando há eventos com responsável;
- **Ambiente:** exibido apenas quando há eventos com ambiente;
- **Ordenação:** alternância mais recentes ⇄ mais antigos primeiro (nenhum campo novo criado);
- contador “X de Y”.

## 7. Comportamento sem commit

Eventos sem `commit_ref` permanecem independentes: aparecem normalmente na ordem cronológica, sem selo de relação e sem linha de commit. Nenhuma inferência é feita.

## 8. Correção visual do Histórico

Em `audit-history.tsx` (somente apresentação — sem alterar `audit_history`, policies, gatilhos ou formato dos registros):

- `project_development_records` → “Registro de desenvolvimento”;
- `project_technical_debts` → “Dívida técnica”;
- campos traduzidos: `record_type`, `commit_ref`, `version_ref`, `environment`, `result`, `responsible_user_id`, `code`, `impact`, `origin`, `resolution`, `resolved_at`, `identified_at`.

## 9. Separação conceitual preservada

Timeline = evolução funcional/técnica (prompts + registros de desenvolvimento). Histórico = auditoria de operações. Nenhum evento de `audit_history` foi injetado na timeline. **Dívidas técnicas não entram na timeline** e permanecem na seção própria; DT-01, DT-02 e DT-03 seguem sem correção e sem alteração de status.

## 10. Testes realizados e evidências

Dados controlados `[TESTE 3B]` criados no projeto `SISTEMA DE GESTÃO DE PROJETOS`: 2 prompts (1 com commit `abc1234def5678`, 1 sem commit), 1 decisão (`abc1234def5678`), 1 versão (`abc1234`, prefixo), 1 teste (sem commit), 1 homologação (sem commit), 1 implantação (`9f9f9f9f9f9f`).

Validação com navegador automatizado e sessão autenticada real:

| Cenário | Resultado |
|---|---|
| Ordem cronológica (7 eventos, decrescente) | OK |
| Alternância de ordenação (crescente) | OK |
| Correlação por commit — prompt + decisão + versão marcados “Relacionado #1” (inclui prefixo `abc1234`) | OK |
| Implantação com commit distinto sem selo | OK |
| Registros sem commit permanecem independentes | OK |
| Filtros de período, tipo, responsável e ambiente | OK |
| Responsável e ambiente exibidos | OK |
| Abertura da conversa do prompt (“Abrir conversa”) | OK |
| Estado vazio (mensagem própria) | OK |
| Mobile 390×844 | OK — cartões compactos, sem sobreposição |
| Regressão: lista de prompts, timeline original de prompts, CRUD de registros e dívidas, filtros, Histórico, Links, GitHub, Lovable, demais abas | OK |

## 11. Limpeza dos dados de teste

Todos os registros `[TESTE 3B]` foram removidos ao final. Verificação pós-limpeza: 0 prompts e 0 registros de desenvolvimento `[TESTE 3B]`; dívidas técnicas mantidas em 3 (DT-01, DT-02, DT-03). Nenhum dado real removido.

## 12. Build e typecheck

- `tsgo --noEmit`: sem erros;
- `bun run build`: concluído com sucesso;
- nenhum alerta novo no linter do banco (nada foi alterado no banco).

## 13. Custo e economia

- **Tabelas criadas: 0**
- **Migrations criadas: 0**
- **Enums criados: 0**
- **Novos componentes: 1** (`ProjectDevelopmentTimeline`)
- **Consultas adicionadas: 0** (reuso das queryKeys existentes; cache compartilhado)
- **Componentes/estruturas reutilizados:** `RecordSection`, `ExternalUrl`, `AuditHistory`, aba Governança, timeline de prompts, `profiles`, React Query, componentes de UI (Badge, Select, Button).
- **Deliberadamente não criados:** tabela Prompt × Commit, tabela de timeline, releases, homologações, testes, deployments, FKs, tabela associativa, campo de ordenação, nova página, novo módulo, nova aba principal.
- **Justificativa:** a rastreabilidade Prompt → Commit → Desenvolvimento → Versão → Teste → Homologação → Implantação foi obtida integralmente por composição de dados já existentes, sem qualquer expansão do modelo de dados e, portanto, sem custo marginal de manutenção, migração ou segurança.

## 14. Segurança

Nenhuma alteração em RLS, RBAC, Auth, Storage, `can_view_project_dossier`, `can_edit_project`, `can_view_task`, compartilhamentos, `SECURITY DEFINER` ou grants. A timeline lê exatamente as mesmas tabelas já protegidas pelo dossiê; a autorização continua sendo decidida pela RLS existente.

## 15. Limitações e riscos residuais

- Correlação por prefixo exige 7+ caracteres em ambos os lados; SHAs mais curtos não são correlacionados (decisão conservadora para evitar falso positivo).
- Commits digitados com formatos divergentes (URL completa vs. SHA) não são correlacionados — não há normalização de URL nesta etapa.
- Ordenação usa `prompt_date` / `event_date` (datas sem hora); eventos no mesmo dia não têm ordem intra-dia garantida.
- DT-01, DT-02 e DT-03 permanecem em aberto/aceitas.
- Alertas `SECURITY DEFINER` residuais: pré-existentes e intencionais.
- Reexecução da suíte de segurança com JWTs reais de múltiplos perfis segue pendente para pré-produção.

## 16. Encerramento

Bloco 3B concluído. Desenvolvimento interrompido. **Bloco 3C não iniciado.** Aguardando homologação expressa.
