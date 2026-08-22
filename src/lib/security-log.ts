import { supabase } from "@/integrations/supabase/client";

/**
 * Registro de auditoria de operações sensíveis (Fase 0).
 * NUNCA envie senhas, tokens, chaves ou o valor revelado de um segredo em `metadata`.
 * O banco rejeita metadados que contenham chaves sensíveis.
 */
export async function logSensitiveAccess(params: {
  action: string;
  entityType: string;
  entityId?: string | null;
  projectId?: string | null;
  origin?: string;
  metadata?: Record<string, unknown>;
}) {
  const { data } = await supabase.auth.getUser();
  const actorId = data.user?.id;
  if (!actorId) return;
  await supabase.from("security_access_log").insert({
    actor_id: actorId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId ?? null,
    project_id: params.projectId ?? null,
    origin: params.origin ?? (typeof window !== "undefined" ? window.location.pathname : "server"),
    metadata: (params.metadata ?? null) as never,
  });
}
