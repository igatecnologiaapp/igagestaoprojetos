# DT-04 — RELATÓRIO DE CORREÇÃO — RECURSÃO RLS EM AGENDAMENTOS

Commit-base: `5a325e03760de25688d634f6b930cbd8abb219ef`
Repositório oficial: https://github.com/igatecnologiaapp/igagestaoprojetos
Migration corretiva: `supabase/migrations/20260830021211_6b64d31b-6fef-4c60-89c9-b2de9f240983.sql`

## 1. Diagnóstico

Sintoma: `GET /rest/v1/appointments?select=id&project_id=eq.ddcf75c6-…` retornava HTTP 500 com
`42P17: infinite recursion detected in policy for relation "appointments"`.

Políticas anteriores:

- `appointments` — SELECT `Appointments viewable by authorized`: verificava owner/criador, `can_view_project`, `can_view_company` e um `EXISTS` sobre `appointment_participants`.
- `appointment_participants` — SELECT `Participants viewable by appointment members`: permitia `user_id = auth.uid()` **ou** um `EXISTS` sobre `appointments`.

Dependência recursiva: a política de `appointments` avaliava `appointment_participants`, cuja política avaliava novamente `appointments` — ciclo direto, sem função `SECURITY DEFINER` para romper a avaliação.

Comparação suspeita confirmada: `ap.appointment_id = ap.id` comparava a coluna com o próprio `id` da linha de participantes, em vez de `appointments.id`. Defeito lógico real, corrigido dentro da nova função auxiliar.

Políticas de INSERT/UPDATE/DELETE não foram tocadas.

## 2. Correção aplicada (migration incremental)

- `public.is_appointment_participant(_appointment_id uuid, _user_id uuid)` — `STABLE SECURITY DEFINER`, `SET search_path = public`; compara corretamente `appointment_id = _appointment_id AND user_id = _user_id`.
- `public.can_view_appointment(_appointment_id uuid, _user_id uuid)` — `STABLE SECURITY DEFINER`, `SET search_path = public`; preserva exatamente as regras anteriores (owner, criador, participante, autorização de projeto, autorização de empresa).
- Substituição apenas das políticas de **leitura** de `appointments` e `appointment_participants`, que passam a chamar as funções acima. O ciclo entre as duas tabelas deixa de existir.
- `REVOKE EXECUTE ... FROM PUBLIC, anon` e `GRANT EXECUTE ... TO authenticated`.
- Sem `USING (true)`, sem bypass genérico, sem ampliação de acesso.

## 3. Matriz de autorização (suíte `supabase/tests/dt_04_appointments_rls.sql`)

Executada em transação com `ROLLBACK`. Resultado real: **17/17 aprovados, 0 falhas**, sem ocorrência de `42P17`.

| Perfil | Recurso | Esperado | Resultado |
| --- | --- | --- | --- |
| Owner | appointments (por id e por project_id) | permitir | APROVADO |
| Owner | appointment_participants | permitir | APROVADO |
| Membro do projeto | appointments por project_id | permitir | APROVADO |
| Membro do projeto | agendamento de outro projeto | negar | APROVADO |
| Participante | appointments / appointment_participants | permitir | APROVADO |
| Participante | projeto do agendamento | negar | APROVADO |
| Participante | outro agendamento | negar | APROVADO |
| Usuário sem vínculo | appointments / participantes | negar | APROVADO |
| Anônimo | appointments / participantes | negar | APROVADO |
| Owner | UPDATE em appointments | permitir | APROVADO |
| Sem vínculo | UPDATE em appointments | negar | APROVADO |

O participante **não** obtém acesso ao projeto inteiro nem a outros agendamentos.

## 4. Regressão de segurança (resultados reais, pós-correção)

| Suíte | Resultado |
| --- | --- |
| `supabase/tests/rls_bloco_1_menor_privilegio.sql` | 42/42 |
| `supabase/tests/rls_phase_0_2.sql` | 39/39 |
| `supabase/tests/bloco_3a_governanca.sql` | 22/22 |
| `supabase/tests/bloco_2a_atividade_auditoria.sql` | 17/17 |
| `supabase/tests/dt_04_appointments_rls.sql` | 17/17 |

Todas em transação com `ROLLBACK`; nenhum dado persistido. Nenhum teste foi alterado para forçar resultado. Nenhuma política de outros módulos foi enfraquecida.

## 5. Teste funcional (navegador autenticado)

- Dossiê do projeto `SISTEMA DE GESTÃO DE PROJETOS` aberto com sessão autenticada.
- Requisição anteriormente com falha `appointments?select=id&project_id=eq.ddcf75c6-1a05-483f-ab73-0487d7db6cc3` retornou **HTTP 200**.
- Nenhum erro de console; demais abas do dossiê renderizaram sem regressão.
- Correção é exclusivamente de banco; não altera renderização, portanto o teste mobile não se aplica.

## 6. DT-04 no sistema

DT-04 não existia em `project_technical_debts`. Foi cadastrada de forma idempotente no projeto `SISTEMA DE GESTÃO DE PROJETOS`, com causa raiz, impacto, migration corretiva, data de resolução e situação `resolved`. DT-01, DT-02 e DT-03 permanecem intactas.

## 7. Limitações

- O linter do banco reporta avisos da classe “Signed-In Users Can Execute SECURITY DEFINER Function” para as funções auxiliares. É o mesmo padrão já adotado por `can_view_project`, `can_edit_task`, `has_role` e demais funções canônicas: a execução por `authenticated` é necessária porque as próprias políticas RLS as invocam; `PUBLIC` e `anon` estão revogados. Aviso aceito e documentado, sem ação corretiva adicional.
- SHA final: não disponível neste ambiente; depende da sincronização do branch `main` no repositório oficial.

## 8. Bloqueios respeitados

Nenhuma alteração em RBAC global, Auth, Storage, compartilhamento, governança da Fase 2, DT-01/02/03, estrutura financeira, dashboards ou integrações externas.

**A Fase 3 não foi iniciada.** Desenvolvimento interrompido, aguardando homologação expressa.
