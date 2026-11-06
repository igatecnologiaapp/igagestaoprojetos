-- =====================================================================
-- FASE 1 — Documentos da pasta digital do projeto
-- Bucket privado `project-files` + tabela de metadados `project_files`.
--
-- Autorização (mesmas regras do dossiê do projeto):
--   ver/baixar  -> can_view_project_dossier(project_id, auth.uid())
--   enviar/editar/excluir -> can_edit_project(project_id, auth.uid())
-- Caminho no storage: <project_id>/<uuid>-<nome-do-arquivo>
-- O campo shared_with_externals já prepara a Fase 4 (portal do participante);
-- nesta fase ele é apenas informativo e não amplia nenhum acesso.
-- Idempotente: pode ser reaplicada sem erro.
-- =====================================================================

-- 1. Bucket privado (50 MB por arquivo)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('project-files', 'project-files', false, 52428800)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

-- 2. Extrai o project_id do caminho do objeto (primeiro segmento)
CREATE OR REPLACE FUNCTION public.project_file_project_id(_object_name text)
RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE v uuid;
BEGIN
  BEGIN
    v := (split_part(_object_name, '/', 1))::uuid;
  EXCEPTION WHEN others THEN
    RETURN NULL;
  END;
  RETURN v;
END; $$;
REVOKE ALL ON FUNCTION public.project_file_project_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.project_file_project_id(text) TO authenticated, service_role;

-- 3. Metadados dos arquivos
CREATE TABLE IF NOT EXISTS public.project_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  folder text NOT NULL DEFAULT 'Geral',
  file_name text NOT NULL,
  storage_path text NOT NULL UNIQUE,
  size_bytes bigint,
  mime_type text,
  description text,
  shared_with_externals boolean NOT NULL DEFAULT false,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_files_folder_valid CHECK (char_length(btrim(folder)) BETWEEN 1 AND 60),
  CONSTRAINT project_files_name_valid CHECK (char_length(btrim(file_name)) BETWEEN 1 AND 255),
  CONSTRAINT project_files_size_valid CHECK (size_bytes IS NULL OR size_bytes >= 0),
  CONSTRAINT project_files_path_in_project CHECK (public.project_file_project_id(storage_path) = project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_files_project ON public.project_files (project_id, folder);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_files TO authenticated;
GRANT ALL ON public.project_files TO service_role;
REVOKE ALL ON public.project_files FROM anon;
ALTER TABLE public.project_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Project files viewable by project dossier members" ON public.project_files;
CREATE POLICY "Project files viewable by project dossier members" ON public.project_files
  FOR SELECT TO authenticated USING (public.can_view_project_dossier(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project files insert by project editors" ON public.project_files;
CREATE POLICY "Project files insert by project editors" ON public.project_files
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_project(project_id, auth.uid()) AND created_by = auth.uid());

DROP POLICY IF EXISTS "Project files update by project editors" ON public.project_files;
CREATE POLICY "Project files update by project editors" ON public.project_files
  FOR UPDATE TO authenticated
  USING (public.can_edit_project(project_id, auth.uid()))
  WITH CHECK (public.can_edit_project(project_id, auth.uid()));

DROP POLICY IF EXISTS "Project files delete by project editors" ON public.project_files;
CREATE POLICY "Project files delete by project editors" ON public.project_files
  FOR DELETE TO authenticated USING (public.can_edit_project(project_id, auth.uid()));

-- 4. Gatilhos: updated_at, última movimentação do projeto e auditoria
DROP TRIGGER IF EXISTS trg_project_files_updated ON public.project_files;
CREATE TRIGGER trg_project_files_updated BEFORE UPDATE ON public.project_files
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_project_files_activity ON public.project_files;
CREATE TRIGGER trg_project_files_activity AFTER INSERT OR UPDATE OR DELETE ON public.project_files
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_activity();

DROP TRIGGER IF EXISTS trg_project_files_audit ON public.project_files;
CREATE TRIGGER trg_project_files_audit AFTER INSERT OR UPDATE OR DELETE ON public.project_files
  FOR EACH ROW EXECUTE FUNCTION public.log_audit('project_files');

-- 5. Políticas do bucket project-files (mesma regra da tabela)
DROP POLICY IF EXISTS "project-files select authorized" ON storage.objects;
CREATE POLICY "project-files select authorized" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'project-files'
       AND public.can_view_project_dossier(public.project_file_project_id(name), auth.uid()));

DROP POLICY IF EXISTS "project-files insert authorized" ON storage.objects;
CREATE POLICY "project-files insert authorized" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'project-files'
            AND public.can_edit_project(public.project_file_project_id(name), auth.uid()));

DROP POLICY IF EXISTS "project-files update authorized" ON storage.objects;
CREATE POLICY "project-files update authorized" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'project-files'
       AND public.can_edit_project(public.project_file_project_id(name), auth.uid()))
WITH CHECK (bucket_id = 'project-files'
            AND public.can_edit_project(public.project_file_project_id(name), auth.uid()));

DROP POLICY IF EXISTS "project-files delete authorized" ON storage.objects;
CREATE POLICY "project-files delete authorized" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'project-files'
       AND public.can_edit_project(public.project_file_project_id(name), auth.uid()));

COMMENT ON TABLE public.project_files IS
  'Fase 1: documentos da pasta digital do projeto. Arquivos no bucket privado project-files em <project_id>/<arquivo>. Leitura = can_view_project_dossier; escrita = can_edit_project.';
