-- Bloco 3A.1 — unicidade de código de dívida técnica por projeto
CREATE UNIQUE INDEX IF NOT EXISTS uq_tech_debt_code_per_project
  ON public.project_technical_debts (project_id, upper(btrim(code)))
  WHERE code IS NOT NULL AND btrim(code) <> '';

-- Bloco 3A.1 — registro idempotente das dívidas técnicas conhecidas (DT-01/DT-02/DT-03)
INSERT INTO public.project_technical_debts
  (project_id, code, title, description, origin, priority, impact, status, identified_at)
SELECT p.id, v.code, v.title, v.description, v.origin, v.priority::public.tech_debt_priority,
       v.impact, v.status::public.tech_debt_status, v.identified_at::date
FROM public.projects p
CROSS JOIN (VALUES
  ('DT-01',
   'Exposição do contexto completo da linha projects em cenários de task_share',
   'Usuário com acesso apenas por compartilhamento de tarefa pode obter o registro completo do projeto (contexto mínimo não segregado em coluna/visão dedicada).',
   'Fase 0.1 / Bloco 1 — isolamento do dossiê do projeto',
   'medium',
   'Vazamento de contexto administrativo do projeto para colaborador de tarefa. Não expõe dados do dossiê técnico (créditos, e-mails, contas, prompts, links).',
   'accepted',
   '2026-08-23'),
  ('DT-02',
   'Responsáveis e criadores de tarefas considerados membros do projeto para acesso ao dossiê',
   'A função can_view_project_dossier considera assignee/created_by de tarefas como membros do projeto, ampliando o alcance de leitura do dossiê além do compartilhamento explícito.',
   'Bloco 1 — can_view_project_dossier',
   'medium',
   'Leitura ampliada do dossiê técnico por membros operacionais do projeto.',
   'accepted',
   '2026-08-23'),
  ('DT-03',
   'Correlação histórica de registros excluídos no audit_history',
   'Eventos de exclusão registrados em audit_history nem sempre permitem correlacionar o registro removido com sua entidade-pai após a exclusão em cascata.',
   'Bloco 2A / 2C — auditoria e histórico',
   'low',
   'Dificulta a reconstituição completa de histórico de itens excluídos; não afeta autorização nem integridade dos dados vigentes.',
   'open',
   '2026-08-26')
) AS v(code, title, description, origin, priority, impact, status, identified_at)
WHERE p.name = 'SISTEMA DE GESTÃO DE PROJETOS'
  AND NOT EXISTS (
    SELECT 1 FROM public.project_technical_debts d
    WHERE d.project_id = p.id AND upper(btrim(d.code)) = v.code
  );