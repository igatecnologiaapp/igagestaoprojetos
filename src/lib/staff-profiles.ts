import { supabase } from "@/integrations/supabase/client";

/**
 * Perfis da equipe interna (sem os usuários do Portal do Cliente).
 * Use em listas de responsável, participantes, agenda e permissões.
 * O banco também recusa Cliente como participante/responsável; isto evita a opção na tela.
 */
export async function fetchStaffProfiles(): Promise<
  { id: string; full_name: string | null; job_title: string | null }[]
> {
  const [{ data: profiles }, { data: clients }] = await Promise.all([
    supabase.from("profiles").select("id,full_name,job_title").order("full_name"),
    supabase.from("client_users").select("user_id"),
  ]);
  const clientIds = new Set((clients ?? []).map((c) => c.user_id));
  return (profiles ?? []).filter((p) => !clientIds.has(p.id));
}
