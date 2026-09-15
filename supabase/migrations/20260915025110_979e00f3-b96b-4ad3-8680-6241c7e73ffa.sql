ALTER TABLE public.project_accounts
  ADD COLUMN IF NOT EXISTS plan text,
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS amount numeric(14,2),
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS recurrence public.finance_recurrence,
  ADD COLUMN IF NOT EXISTS renews_at date,
  ADD COLUMN IF NOT EXISTS status public.finance_entity_status NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_project_accounts_amount_non_negative') THEN
    ALTER TABLE public.project_accounts
      ADD CONSTRAINT chk_project_accounts_amount_non_negative CHECK (amount IS NULL OR amount >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_project_accounts_currency') THEN
    ALTER TABLE public.project_accounts
      ADD CONSTRAINT chk_project_accounts_currency CHECK (char_length(currency) = 3);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_accounts_project ON public.project_accounts(project_id);
CREATE INDEX IF NOT EXISTS idx_project_accounts_renews_at ON public.project_accounts(renews_at);