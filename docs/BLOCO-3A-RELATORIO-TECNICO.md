# BLOCO 3A + 3A.1 — Relatório Técnico

**Sistema:** Gestão de Projetos — IGA Tecnologia
**Repositório oficial:** https://github.com/igatecnologiaapp/igagestaoprojetos
**Commit-base (Bloco 3A):** 851a541beb33e1e1440eb9196e911da766663443
**SHA final:** não disponível no ambiente de execução (o versionamento é gerenciado pela plataforma). Deve ser registrado após a sincronização do branch `main`.
**Escopo:** exclusivamente Bloco 3A (Fundação da Governança do Desenvolvimento) e seu fechamento 3A.1. Bloco 3B não iniciado.

---

## 1. Estruturas criadas (mínimo necessário)

| Tabela | Colunas | Finalidade |
|---|---|---|
| `public.project_development_records` | 15 | Decisões, versões, testes, homologações e implantações do projeto |
| `public.project_technical_debts` | 16 | Dívidas técnicas do projeto (código, prioridade, situação, impacto, resolução) |

Enums reutilizados/criados no Bloco 3A: `dev_record_type`, `tech_debt_priority`, `tech_debt_status`.

**Nenhuma terceira tabela de governança foi criada.** Não foram criados `project_platforms`, subtarefas, cofre, timeline consolidada, dashboards, indicadores, integrações (GitHub/Lovable/ChatGPT), financeiro, custos, Health Score, webhooks ou CI/CD.

### Migrations

- Original (Bloco 3A): `supabase/migrations/20260830005108_6673c9a9-860c-49c6-aace-2298d8a7e1d6.sql` — tabelas, enums, GRANTs, RLS, índices e gatilhos.
- Complementar (Bloco 3A.1): `supabase/migrations/20260830010454_3f151783-4545-4237-97e2-614e25cab2a5.sql` — índice único de código por projeto e cadastro idempotente de DT-01/DT-02/DT-03.

Nenhuma migration histórica foi editada. Todas as alterações são incrementais e reproduzíveis.

## 2. Segurança (preservada, sem redesenho)

- RLS habilitada nas duas tabelas.
- Leitura: `can_view_project_dossier(project_id, auth.uid())`.
- Escrita (inserir/editar/excluir): `can_edit_project(project_id, auth.uid())`.
- Nenhuma alteração em RBAC, `has_permission`, `user_permission_overrides`, Auth, Storage, URLs assinadas ou políticas de compartilhamento.

## 3. Gatilhos, auditoria e última atividade

- `set_updated_at` — `trg_dev_records_updated`, `trg_tech_debts_updated`.
- `touch_project_activity` — `trg_dev_records_activity`, `trg_tech_debts_activity` (atualiza `projects.last_activity_at`).
- `log_audit` — `trg_dev_records_audit`, `trg_tech_debts_audit` (eventos `created` / `updated` / `deleted` em `audit_history`).
- Índices: `idx_dev_records_project`, `idx_tech_debts_project`.

## 4. Unicidade do código da dívida (3A.1)

Índice único parcial `uq_tech_debt_code_per_project` sobre `(project_id, upper(btrim(code)))`, aplicado somente quando `code` não é nulo/vazio:

- bloqueia `DT-01` duplicado no mesmo projeto, inclusive variações de caixa e espaços;
- permite o mesmo código em projetos diferentes;
- permite dívidas sem código.

## 5. Responsável (reuso, sem novo módulo)

`responsible_user_id` foi exposto nos formulários de registro de desenvolvimento e de dívida técnica reutilizando a listagem de `profiles` já usada em Projetos, Permissões, Agendamentos e Colaboração. Nenhuma tabela, módulo ou sistema de responsáveis foi criado.

Ajuste mínimo em `RecordSection` (componente genérico já existente), aplicável a todo o dossiê:

- validação de campos obrigatórios antes do envio (evita erro de banco por seleção não preenchida);
- opção "— Não definido" em seleções opcionais, permitindo limpar o responsável já atribuído.

## 6. Interface

Uma única aba **Governança** no dossiê existente (`src/components/project-detail.tsx`), com duas seções reutilizando `RecordSection` (CRUD, filtros, contagem, estado vazio, layout responsivo). Ambas as tabelas foram incluídas no escopo do histórico visual de auditoria já existente.

## 7. Testes executados

### 7.1 Suíte SQL — `supabase/tests/bloco_3a_governanca.sql`

Executada contra o banco hospedado, dentro de transação com `ROLLBACK` (nenhum dado permanente criado). Parte da suíte roda sob `SET LOCAL ROLE authenticated` com `request.jwt.claims` (mesmo mecanismo do PostgREST) e sob o papel `anon`.

**Resultado: 22 de 22 cenários PASSOU.**

1. criação de registro de desenvolvimento — PASSOU
2. registro de desenvolvimento move `projects.last_activity_at` — PASSOU
3. registro de desenvolvimento gera `audit_history` (created) — PASSOU
4. edição de registro de desenvolvimento (audit `updated` + atividade) — PASSOU
5. `set_updated_at` mantém `updated_at` coerente — PASSOU
6. exclusão de registro de desenvolvimento (audit `deleted`) — PASSOU
7. criação de dívida técnica — PASSOU
8. dívida técnica move `projects.last_activity_at` — PASSOU
9. dívida técnica gera `audit_history` (created) — PASSOU
10. alteração de prioridade — PASSOU
11. alteração de situação — PASSOU
12. código DT duplicado no mesmo projeto é bloqueado — PASSOU
13. mesmo código DT permitido em projetos diferentes — PASSOU
14. dívidas sem código continuam permitidas — PASSOU
15. isolamento entre projetos — PASSOU
16. `can_view_project_dossier` verdadeiro para membro do dossiê — PASSOU
17. `can_edit_project` verdadeiro para autorizado — PASSOU
18. leitura de dívidas por usuário com acesso ao dossiê — PASSOU
19. escrita permitida a usuário autorizado por `can_edit_project` — PASSOU
20. anônimo não lê registros de desenvolvimento — PASSOU
21. anônimo não lê dívidas técnicas — PASSOU
22. anônimo não escreve dívida técnica — PASSOU

### 7.2 Teste funcional no frontend (sessão autenticada real)

Executado com navegador automatizado e sessão real do usuário administrador, no projeto `SISTEMA DE GESTÃO DE PROJETOS`:

- criação de registro de desenvolvimento do tipo Decisão `[TESTE 3A]` — OK (toast "Registro adicionado" e item listado);
- criação de dívida técnica `DT-TESTE-3A [TESTE 3A]` — OK;
- alteração de prioridade para **Crítica** e situação para **Planejada** — OK (persistido no banco: `planned/critical`);
- tentativa de recriar `DT-TESTE-3A` no mesmo projeto — bloqueada pela unicidade;
- estado vazio da seção de registros de desenvolvimento — exibido ("Nenhum registro de desenvolvimento.");
- filtro por situação nas dívidas e contagem "3 de 3" — OK;
- eventos correspondentes registrados em `audit_history` (`created` e `updated`) e `projects.last_activity_at` atualizado;
- layout mobile 390×844 — OK (abas, formulário e cartões legíveis, sem sobreposição).

**Limpeza:** todos os dados `[TESTE 3A]` foram removidos ao final (verificado: 0 registros remanescentes). DT-01, DT-02 e DT-03 permanecem cadastradas.

### 7.3 Testes não executáveis

- Sessões JWT reais de múltiplos perfis distintos (collaborator/viewer/externo) não puderam ser emitidas neste ambiente; a autorização foi exercitada com papéis `authenticated`/`anon` e claims equivalentes às do PostgREST. **Pendência preservada para pré-produção.**

## 8. Build e typecheck

- `tsgo --noEmit`: sem erros.
- `bun run build`: concluído com sucesso (`✓ built in 11.38s`).
- Linter do banco: 12 alertas do tipo `SECURITY DEFINER` em funções auxiliares, todos pré-existentes e já documentados desde a Fase 0.1. Nenhum alerta novo.

## 9. DT-01, DT-02 e DT-03 registradas

| Código | Prioridade | Situação | Origem |
|---|---|---|---|
| DT-01 | Média | Aceita | Fase 0.1 / Bloco 1 — isolamento do dossiê |
| DT-02 | Média | Aceita | Bloco 1 — `can_view_project_dossier` |
| DT-03 | Baixa | Aberta | Bloco 2A / 2C — auditoria e histórico |

Registradas apenas como conhecimento; **nenhuma correção foi aplicada** e nenhuma policy foi alterada em razão delas. A inserção é idempotente (não duplica em reexecução).

## 10. Riscos residuais

- DT-01, DT-02 e DT-03 permanecem em aberto/aceitas, por decisão de escopo.
- Reexecução integral da suíte de segurança com JWTs reais de múltiplos perfis continua pendente para pré-produção.
- Alertas `SECURITY DEFINER` residuais: intencionais, necessários às funções de autorização.

## 11. Justificativa econômica da arquitetura

Foram criadas apenas duas tabelas e uma aba, reaproveitando integralmente: `RecordSection` (CRUD genérico, filtros, contagem, estado vazio, responsividade), `can_view_project_dossier`, `can_edit_project`, `set_updated_at`, `touch_project_activity`, `log_audit`, `audit_history`, `profiles` e o histórico visual existente. Não houve nova camada de dados, novo módulo, novo componente de listagem, novo mecanismo de autorização nem duplicação de dossiê — a governança passa a existir com custo marginal de manutenção.

## 12. Encerramento

Bloco 3A + 3A.1 concluídos. Desenvolvimento interrompido. **Bloco 3B não iniciado.** Aguardando homologação expressa.
