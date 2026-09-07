-- DT-06: menor privilégio nas tabelas financeiras
REVOKE ALL ON public.finance_vendors FROM anon;
REVOKE ALL ON public.finance_categories FROM anon;
REVOKE ALL ON public.finance_services FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_vendors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_categories TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.finance_services TO authenticated;
GRANT ALL ON public.finance_vendors TO service_role;
GRANT ALL ON public.finance_categories TO service_role;
GRANT ALL ON public.finance_services TO service_role;

-- Bloco 4B.1: status gerenciais adicionais (mantém os históricos)
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'awaiting_credits';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'awaiting_client';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'awaiting_info';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'in_development';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'testing';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'validation';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'homologation';
ALTER TYPE public.project_status ADD VALUE IF NOT EXISTS 'deployment';

-- Bloco 4B.1: prompts pendentes (reutiliza project_prompts)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'prompt_status') THEN
    CREATE TYPE public.prompt_status AS ENUM ('draft','to_send','sent','awaiting_reply','done','cancelled');
  END IF;
END $$;

ALTER TABLE public.project_prompts
  ADD COLUMN IF NOT EXISTS status public.prompt_status NOT NULL DEFAULT 'done',
  ADD COLUMN IF NOT EXISTS platform text,
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS planned_send_date date;

CREATE INDEX IF NOT EXISTS idx_project_prompts_status ON public.project_prompts (project_id, status);