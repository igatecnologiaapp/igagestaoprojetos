# FASE 2 — GOVERNANÇA DO DESENVOLVIMENTO — RELATÓRIO FINAL (BLOCO 3C)

Commit-base homologado: `3c7aee2e33efa58ba7422e08c382f9d1339e9b9b`
Repositório oficial: https://github.com/igatecnologiaapp/igagestaoprojetos

## 1. Escopo executado

Bloco 3C — homologação final, regressão, documentação e fechamento técnico da Fase 2.

Expansão estrutural realizada nesta rodada:

| Item | Quantidade |
| --- | --- |
| Tabelas criadas | 0 |
| Migrations criadas | 0 |
| Enums criados | 0 |
| Módulos criados | 0 |
| Integrações criadas | 0 |

Alteração de código do produto: **1 correção mínima de apresentação** (item 6).

## 2. Regressão automatizada (SQL, em transação com rollback)

| Suíte | Resultado |
| --- | --- |
| `supabase/tests/bloco_3a_governanca.sql` | 22/22 |
| `supabase/tests/bloco_2a_atividade_auditoria.sql` | 17/17 |
| `supabase/tests/rls_bloco_1_menor_privilegio.sql` | 42/42 |
| `supabase/tests/rls_phase_0_2.sql` | 39/39 |
| `supabase/tests/storage_bloco_1_regressao.sql` | 5/5 cenários |

Total: 120 verificações booleanas explícitas + 5 cenários de storage. Nenhum dado persistido.

Storage confirmado: bucket `task-files` privado; usuário autorizado acessa; usuário sem vínculo e anônimo não acessam; revogação remove o acesso.

## 3. Validação funcional (navegador autenticado, dados `[TESTE 3C]`)

Cadeia validada: Prompt → Commit → Registro de Desenvolvimento → Versão → Teste → Homologação → Implantação.

- Linha do tempo exibiu os 3 prompts e 7 registros de desenvolvimento controlados, com tipo, data, versão (`1.0.0`), ambiente (`producao`, `homologacao`, `teste`), resultado, responsável e link "Abrir conversa".
- Correlação por commit: igualdade exata, diferenças de caixa e espaços, e prefixos ≥ 7 caracteres agrupados com o selo "Relacionado #n".
- Commit curto (`abc12`, < 7 caracteres): exibido, **não** correlacionado — comportamento esperado.
- Registro sem commit: exibido normalmente, sem selo de relação.
- Alteração de commit: ao editar o registro de homologação de `abc1234` para `ffffeeee11112222`, o selo "Relacionado #2" desapareceu; ao restaurar, o selo voltou. Recalculo em memória confirmado, sem cache obsoleto.
- Ordenação: alternância "Mais recentes / Mais antigos primeiro" funcional.
- Filtros: período, tipo (ex.: apenas Implantação), responsável e ambiente aplicados corretamente.
- Dívidas técnicas: edição de situação (Resolvida), prioridade (Crítica), data de resolução e texto de resolução persistidos e refletidos na lista; DT-01, DT-02 e DT-03 preservados.
- Unicidade: tentativa de criar dívida com código `DT-3C` já existente foi bloqueada pelo índice `uq_tech_debt_code_per_project`.
- Auditoria: `audit_history` registrou `created`/`updated` para `project_prompts`, `project_development_records` e `project_technical_debts`.
- `last_activity_at` do projeto atualizado a cada operação (defasagem de ~1 minuto após a última edição).
- Abas do dossiê (11) íntegras, sem duplicidade: Visão geral, Tarefas, ChatGPT / Prompts, GitHub, Lovable, E-mails, Links, Acessos, Compartilhamento, Governança, Histórico.
- Mobile 390×844: sem overflow horizontal; todas as abas verificadas renderizam corretamente.

## 4. Segurança

- Nenhuma alteração em RLS, RBAC, grants, gatilhos, Auth ou Storage nesta rodada.
- `.env` fora do índice do Git (`git ls-files` retorna apenas `.env.example`); `.gitignore` contém `.env`, `.env.*` e `!.env.example`; `.env.example` contém apenas placeholders.
- Nenhum segredo exibido, registrado ou versionado.

## 5. Limpeza

Todos os registros `[TESTE 3C]` (3 prompts, 7 registros de desenvolvimento, 1 dívida `DT-3C`) foram removidos. Verificação pós-limpeza: 0 registros de teste remanescentes; 3 dívidas oficiais (DT-01, DT-02, DT-03) intactas.

## 6. Correção mínima aplicada

`src/components/project-detail.tsx`: o campo "Identificada em" da dívida técnica passou a ser obrigatório no formulário. Antes, o envio sem data produzia erro bruto do banco (`null value in column "identified_at" ... violates not-null constraint`). Correção exclusivamente de apresentação/validação de formulário; sem alteração de schema, RLS ou comportamento de dados.

## 7. Defeito estrutural identificado — requer autorização

**DT-04 (proposta) — Recursão infinita na política de leitura de `appointments`.**

- Sintoma: HTTP 500 em `GET /rest/v1/appointments?select=id&project_id=eq...` ao abrir o dossiê do projeto; erro do banco `42P17: infinite recursion detected in policy for relation "appointments"`.
- Causa provável: a política `Appointments viewable by authorized` referencia `appointment_participants`, cuja política referencia `appointments`, formando ciclo. A subconsulta também apresenta a comparação incorreta `ap.appointment_id = ap.id`.
- Impacto: a contagem de agendamentos do projeto falha silenciosamente na interface; não há exposição indevida de dados (a leitura é negada, não ampliada).
- Correção exige migration (política/função `security definer`), o que está **fora do escopo autorizado do Bloco 3C**. Desenvolvimento interrompido, aguardando autorização expressa.

## 8. Build e typecheck

`bun run build` — OK. Nenhum erro de tipo ou de build.

## 9. Conclusão

Fase 2 tecnicamente concluída e aguardando homologação final do responsável.

Ressalva: o defeito DT-04 (item 7) é anterior à Fase 2, pertence ao módulo Agendamentos e permanece aberto até autorização específica de correção. Fase 3 não iniciada.
