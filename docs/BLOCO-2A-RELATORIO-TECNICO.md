# BLOCO 2A — Integridade Histórica, Última Atividade e Auditoria

Sistema Gestão de Projetos — IGA Tecnologia
Repositório oficial: https://github.com/igatecnologiaapp/igagestaoprojetos
Referência: BASELINE ARQUITETURAL ÚNICA

## 1. Base e escopo

- Commit-base: `d7dd040ac6959d8c557d949fdafd751ae45ce8e7` (encerramento da Fase 0 — `.env` fora do versionamento).
- Fase 0 homologada formalmente pelo cliente. Nenhuma alteração de RLS, RBAC, Auth, Storage ou políticas de compartilhamento foi realizada neste bloco.
- Escopo executado: exclusivamente Bloco 2A. Nenhum item do Bloco 2B, Fase 2 integral, Fase 3 ou Fase 4 foi iniciado.
- Nenhum módulo, tabela ou entidade nova foi criada. Foram usados `projects.last_activity_at`, `audit_history` e `security_access_log` já existentes.

## 2. Arquivos alterados

| Arquivo | Natureza |
| --- | --- |
| `supabase/tests/bloco_2a_atividade_auditoria.sql` | Novo — suíte reproduzível de atividade e auditoria |
| `docs/BLOCO-2A-RELATORIO-TECNICO.md` | Novo — este relatório |

Nenhum arquivo de frontend foi alterado: todo o comportamento do bloco é garantido no banco (gatilhos), preservando o módulo Projetos canônico.

## 3. Migrations criadas (incrementais)

1. **Bloco 2A — rastreabilidade** — redefine `log_audit()` (ignora ruído de `last_activity_at`), cria `touch_project_activity_via_task()` e os gatilhos de atividade e auditoria dos eventos ainda não cobertos.
2. **Ajuste de privilégio** — `REVOKE EXECUTE` da nova função interna para `anon`, `authenticated` e `PUBLIC` (uso exclusivo por gatilho).
3. **Precisão temporal** — `touch_own_project_activity()`, `touch_project_activity()` e `touch_project_activity_via_task()` passam a usar `clock_timestamp()` em vez de `now()`, permitindo ordenar eventos ocorridos na mesma transação.

Nenhuma migration histórica foi editada. Nenhum dado foi excluído. Nenhuma publicação em produção foi realizada.

## 4. Funções e gatilhos criados/modificados

| Objeto | Ação | Observação |
| --- | --- | --- |
| `public.log_audit()` | Modificada | Diff de UPDATE passa a ignorar `updated_at` e `last_activity_at`; `created_by` resolvido de forma genérica para tabelas sem essa coluna |
| `public.touch_project_activity()` | Modificada | `clock_timestamp()` |
| `public.touch_own_project_activity()` | Modificada | `clock_timestamp()` |
| `public.touch_project_activity_via_task()` | Criada | SECURITY DEFINER, `search_path` fixo, sem EXECUTE para `anon`/`authenticated` |
| `trg_task_comments_activity`, `trg_task_attachments_activity`, `trg_appointments_activity` | Criados | Atividade do projeto |
| `trg_task_comments_audit`, `trg_task_attachments_audit`, `trg_appointments_audit`, `trg_appointment_participants_audit`, `trg_project_shares_audit`, `trg_task_shares_audit`, `trg_external_collaborators_audit` | Criados | Auditoria em `audit_history` |

**Prevenção de recursão:** os gatilhos de atividade só executam `UPDATE public.projects SET last_activity_at`. Em `projects` existe apenas um gatilho BEFORE UPDATE (carimbo) e o gatilho de auditoria AFTER UPDATE, que agora ignora `last_activity_at` e, portanto, não gera novas escritas. Não há caminho de retorno para as tabelas filhas — cadeia finita, sem recursão.

## 5. Matriz de `last_activity_at`

| Evento | Entidade/Tabela | Atualizava antes? | Deve atualizar? | Mecanismo atual | Correção |
| --- | --- | --- | --- | --- | --- |
| Criação de tarefa | `tasks` | Sim | Sim | `touch_project_activity` | Nenhuma |
| Alteração relevante de tarefa | `tasks` | Sim | Sim | `touch_project_activity` | Nenhuma |
| Comentário em tarefa | `task_comments` | **Não** | Sim | — | Gatilho `touch_project_activity_via_task` |
| Anexo em tarefa | `task_attachments` | **Não** | Sim | — | Gatilho `touch_project_activity_via_task` |
| Agendamento vinculado ao projeto | `appointments` | **Não** | Sim | — | Gatilho `touch_project_activity` |
| Prompt | `project_prompts` | Sim | Sim | `touch_project_activity` | Nenhuma |
| Registro GitHub | `project_github_repos` | Sim | Sim | `touch_project_activity` | Nenhuma |
| Registro Lovable | `project_lovable` | Sim | Sim | `touch_project_activity` | Nenhuma |
| E-mail do projeto | `project_emails` | Sim | Sim | `touch_project_activity` | Nenhuma |
| Link | `project_links` | Sim | Sim | `touch_project_activity` | Nenhuma |
| Crédito/consumo Lovable | `project_credits` | Sim | Sim | `touch_project_activity` | Nenhuma |
| Conta de plataforma | `project_accounts` | Sim | Sim | `touch_project_activity` | Nenhuma |
| Valor de campo personalizado | `project_custom_field_values` | Sim | Sim | `touch_project_activity` | Nenhuma |
| Dados principais do projeto | `projects` | Sim | Sim | `touch_own_project_activity` | Precisão temporal |
| Leitura/consulta/navegação | qualquer | Não | **Não** | — | Mantido: nenhum gatilho em SELECT |
| Compartilhamento concedido/revogado | `project_shares` / `task_shares` | Não | Não (é governança, não atividade operacional) | — | Auditado, mas não move atividade |

## 6. Matriz de cobertura de auditoria

| Evento | Antes | Agora | Entidade em `audit_history` |
| --- | --- | --- | --- |
| Empresas | Coberto | Coberto | `company` |
| Projetos | Coberto | Coberto | `project` |
| Tarefas | Coberto | Coberto | `task` (+ `task_status_history`) |
| Dossiê técnico (prompts, GitHub, Lovable, e-mails, links, créditos, contas, campos) | Coberto | Coberto | `project_*` |
| Comentários | **Ausente** | Coberto | `task_comment` |
| Anexos | **Ausente** | Coberto | `task_attachment` |
| Agendamentos | **Ausente** | Coberto | `appointment` |
| Participantes de agendamento | **Ausente** | Coberto | `appointment_participant` |
| Compartilhamento de projeto | **Ausente** | Coberto | `project_share` |
| Compartilhamento de tarefa | **Ausente** | Coberto | `task_share` |
| Colaboradores externos | **Ausente** | Coberto | `external_collaborator` |
| Alterações de RBAC | Coberto | Coberto | `audit_rbac_change` + `security_access_log` |

Para compartilhamentos, o registro contém: entidade afetada (`entity_type`/`entity_id`), projeto ou tarefa (`project_id`/`task_id`), autor (`changed_by`), usuário interno ou externo afetado (`user_id`/`external_id`), permissão concedida/revogada (`permission`), ação (`created`/`updated`/`deleted`) e data/hora (`changed_at`).

**Conteúdo proibido:** nenhuma das tabelas auditadas possui coluna de senha, token, segredo ou chave privada; anexos registram apenas nome, tipo, URL e caminho — nunca o conteúdo do arquivo. `security_access_log` mantém o gatilho `block_secret_metadata`. Teste automatizado confirma ausência de chaves sensíveis em `audit_history`.

## 7. Testes

Suíte: `supabase/tests/bloco_2a_atividade_auditoria.sql` (transação + `ROLLBACK`, não deixa resíduo).

Executada nesta rodada — **17 aprovados / 0 reprovados**:

1. criação de tarefa move `last_activity_at` — APROVADO
2. SELECT/leitura NÃO move `last_activity_at` — APROVADO
3. alteração de tarefa move — APROVADO
4. comentário move — APROVADO
5. anexo move — APROVADO
6. agendamento move — APROVADO
7. registros técnicos (prompt, GitHub, Lovable, e-mail, link, crédito) movem — APROVADO
8. alteração do projeto move — APROVADO
9. auditoria de comentário registrada — APROVADO
10. auditoria de anexo registrada — APROVADO
11. auditoria de agendamento registrada — APROVADO
12. concessão de `project_share` auditada — APROVADO
13. revogação de `project_share` auditada — APROVADO
14. concessão de `task_share` auditada — APROVADO
15. revogação de `task_share` auditada — APROVADO
16. auditoria sem campos secretos — APROVADO
17. auditoria de projeto sem ruído de `last_activity_at` — APROVADO

Regressão de segurança (Bloco 1), reaproveitada:
`supabase/tests/rls_bloco_1_menor_privilegio.sql` e `supabase/tests/storage_bloco_1_regressao.sql`.
Nenhuma policy, função de autorização (`can_view_task`, `can_view_project`, `can_view_project_dossier`, `can_modify_task_files`) ou política de Storage foi alterada neste bloco — o contrato validado no Bloco 1 permanece byte-a-byte idêntico.

### Testes não executados nesta rodada (sem invenção de resultado)

| Teste | Motivo | Como executar | Evidência faltante |
| --- | --- | --- | --- |
| Reexecução integral da suíte de menor privilégio (`task_share` sem dossiê, sem outras tarefas, `project_share`, owner, sem vínculo, `anon`) com JWTs reais | O canal SQL do ambiente não possui privilégio sobre o schema `auth`; a criação dos 5 usuários exige Auth Admin API, procedimento manual descrito no cabeçalho do arquivo | Criar os usuários via Auth Admin API, substituir os UUIDs e rodar `rls_bloco_1_menor_privilegio.sql`; excluir os usuários ao final | Nova execução datada pós-Bloco 2A (a última execução, no Bloco 1, foi integralmente aprovada) |
| Regressão de Storage com sessões reais | Mesmo motivo | `storage_bloco_1_regressao.sql` com os UUIDs reais | Nova execução datada pós-Bloco 2A |
| Auditoria sob RLS de usuário final (leitura de `audit_history` pelos novos `entity_type`) | As policies de `audit_history` não foram alteradas; a leitura de itens de projeto continua sujeita a `can_view_project_dossier` | Suíte de menor privilégio ampliada | Confirmação empírica com JWT real |

Build e typecheck: aprovados (nenhuma alteração de código de aplicação nesta rodada).

Linter de segurança Supabase: 12 avisos, todos do tipo já documentado e homologado (`Signed-In Users Can Execute SECURITY DEFINER Function`), referentes às funções de autorização exigidas pela RLS. A nova função `touch_project_activity_via_task()` **não** integra essa lista, pois teve o EXECUTE revogado. Não houve aumento em relação à linha de base.

## 8. Preservação de segurança (Bloco 1)

Verificado e mantido sem alteração:

- `task_share` continua limitado à tarefa compartilhada e sem acesso ao dossiê técnico;
- `project_accounts` permanece restrito a administradores;
- níveis de `project_shares` inalterados;
- precedência de permissões/overrides inalterada (deny > owner > grant > herança);
- proteção do último administrador íntegra;
- Storage privado, URLs assinadas de 5 minutos e revogação inalterados;
- `anon` não recebeu nenhum novo acesso (nenhum GRANT foi concedido neste bloco).

## 9. Regressões encontradas

Uma inconsistência preexistente foi identificada e corrigida dentro do escopo: o `UPDATE` automático de `last_activity_at` gerava entradas `updated` vazias de significado em `audit_history` para `project`, poluindo o histórico. Corrigido em `log_audit()`.

## 10. Riscos residuais

- `audit_history` cresce com os novos gatilhos (comentários, anexos, agendamentos, compartilhamentos). Recomenda-se avaliar política de retenção/índice por `entity_type` em bloco futuro.
- O componente de histórico do frontend exibe hoje apenas `company`, `project` e `task`; os novos tipos são gravados, porém ainda não apresentados — apresentação é escopo do Bloco 2B e **não** foi iniciada.
- Avisos SECURITY DEFINER mantidos por necessidade da RLS, com `search_path` fixo e sem execução anônima.

## 11. Dívidas técnicas mantidas (não corrigidas neste bloco)

- **DT-01 — contexto do projeto para `task_share`:** o acesso mínimo ao projeto pai ainda pode retornar a linha completa de `projects` (campos: nome, descrição, valor, datas, status, fase, próxima ação, responsável, empresa). Proposta futura: projeção mínima via view (`projects_min_context`) ou RPC dedicada retornando apenas `id`, `name` e `company_id`, com a policy de `projects` restrita ao dossiê.
- **DT-02 — integrante de tarefa com acesso ao dossiê:** `can_view_project_dossier` considera responsáveis/criadores de tarefas como membros do projeto. Mantido sem alteração silenciosa; permanece como decisão de política a avaliar.

## 12. Comprovação de não início do Bloco 2B e posteriores

Não foram criados/iniciados: categorias adicionais de links, timeline de prompts, módulo de plataformas, subtarefas, Vault/gestão de senhas, automações GitHub/Lovable/ChatGPT, integrações externas, módulo financeiro, Health Score ou dashboards executivos. Nenhum arquivo de frontend foi modificado; nenhuma tabela nova foi criada.

## 13. Critério de encerramento

- `last_activity_at` consistente e comprovado — atendido (8 cenários);
- auditoria mínima completa — atendida (7 novas coberturas);
- sem regressão de segurança — atendido;
- testes aprovados ou exceções formalmente documentadas — atendido (seção 7);
- migrations incrementais — atendido;
- sem expansão funcional não autorizada — atendido.

## 14. SHA final

Não disponível no ambiente Lovable: o versionamento é gerenciado pela plataforma e o commit resultante desta rodada é gerado após o encerramento da mensagem. O SHA final deve ser lido no branch `main` do repositório oficial após a sincronização desta entrega, tendo como base o commit `d7dd040ac6959d8c557d949fdafd751ae45ce8e7`.

**DESENVOLVIMENTO INTERROMPIDO — aguardando homologação expressa do Bloco 2A.**
