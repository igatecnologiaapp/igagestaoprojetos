
-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('task-files', 'task-files', false)
ON CONFLICT (id) DO NOTHING;

-- Attachment type enum
DO $$ BEGIN
  CREATE TYPE public.attachment_type AS ENUM ('file', 'link');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Attachments table
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL,
  type public.attachment_type NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  storage_path TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Attachments viewable" ON public.task_attachments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Attachments insert" ON public.task_attachments FOR INSERT TO authenticated WITH CHECK (public.can_edit(auth.uid()));
CREATE POLICY "Attachments delete" ON public.task_attachments FOR DELETE TO authenticated USING (public.can_edit(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_task_attachments_task ON public.task_attachments(task_id);

-- Storage policies for task-files bucket
CREATE POLICY "Task files viewable by authenticated"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'task-files');

CREATE POLICY "Task files upload by editors"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'task-files' AND public.can_edit(auth.uid()));

CREATE POLICY "Task files delete by editors"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'task-files' AND public.can_edit(auth.uid()));
