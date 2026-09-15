import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AppRole = "owner" | "collaborator" | "viewer";
type AppModule = "companies" | "projects" | "tasks" | "appointments" | "reports";

const schema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(72).optional(),
  full_name: z.string().min(1).max(120),
  job_title: z.string().max(120).optional(),
  role: z.enum(["owner", "collaborator", "viewer"]),
  modules: z.array(z.enum(["companies", "projects", "tasks", "appointments", "reports"])).default([]),
});

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (!roles?.some((r) => r.role === "owner")) {
      throw new Error("Apenas administradores podem cadastrar usuários.");
    }

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error || !created.user) throw new Error(error?.message ?? "Falha ao criar");
    const newId = created.user.id;

    // Override default role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newId);
    await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: data.role as AppRole });

    if (data.modules.length > 0) {
      await supabaseAdmin
        .from("user_module_access")
        .insert(data.modules.map((m: AppModule) => ({ user_id: newId, module: m })));
    }
    return { id: newId };
  });

const updateSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["owner", "collaborator", "viewer"]),
  modules: z.array(z.enum(["companies", "projects", "tasks", "appointments", "reports"])),
});

export const adminUpdateUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);
    if (!roles?.some((r) => r.role === "owner")) throw new Error("Sem permissão");

    await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id);
    await supabaseAdmin.from("user_roles").insert({ user_id: data.user_id, role: data.role as AppRole });

    await supabaseAdmin.from("user_module_access").delete().eq("user_id", data.user_id);
    if (data.modules.length > 0) {
      await supabaseAdmin
        .from("user_module_access")
        .insert(data.modules.map((m: AppModule) => ({ user_id: data.user_id, module: m })));
    }
    return { ok: true };
  });

async function assertOwner(userId: string) {
  const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  if (!roles?.some((r) => r.role === "owner")) throw new Error("Sem permissão");
}

/** Auditoria administrativa — nunca registra senha, token ou link. */
async function audit(actorId: string, action: string, targetId: string | null, metadata?: Record<string, unknown>) {
  await supabaseAdmin.from("security_access_log").insert({
    actor_id: actorId,
    action,
    entity_type: "user",
    entity_id: targetId,
    origin: "admin.users",
    metadata: (metadata ?? null) as never,
  });
}

/** Lista identidades do Auth (e-mail, situação de acesso, último acesso) — apenas Administradores. */
export const adminListAuthUsers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertOwner(context.userId);
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error(error.message);
    return data.users.map((u) => ({
      id: u.id,
      email: u.email ?? null,
      active: !(u as { banned_until?: string | null }).banned_until,
      last_sign_in_at: u.last_sign_in_at ?? null,
      created_at: u.created_at,
    }));
  });

const activeSchema = z.object({ user_id: z.string().uuid(), active: z.boolean() });

/** Ativa/desativa o acesso do usuário preservando histórico e auditoria. */
export const adminSetUserActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => activeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.userId);
    if (context.userId === data.user_id && !data.active) {
      throw new Error("Você não pode desativar o próprio acesso administrativo.");
    }
    if (!data.active) {
      const { data: owners } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "owner");
      const isTargetOwner = owners?.some((o) => o.user_id === data.user_id);
      if (isTargetOwner && (owners?.length ?? 0) <= 1) {
        throw new Error("O sistema precisa manter ao menos um Administrador ativo.");
      }
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      ban_duration: data.active ? "none" : "876000h",
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, data.active ? "user.activate" : "user.deactivate", data.user_id);
    return { ok: true };
  });

const inviteSchema = z.object({ user_id: z.string().uuid() });

/** Gera link seguro de definição de senha. O link não é registrado em auditoria. */
export const adminSendPasswordSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => inviteSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.userId);
    const { data: target, error: getErr } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    if (getErr || !target.user?.email) throw new Error("Usuário sem e-mail cadastrado.");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: target.user.email,
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, "user.password_setup_link", data.user_id);
    return { link: link.properties?.action_link ?? null, email: target.user.email };
  });

const deleteSchema = z.object({ user_id: z.string().uuid() });

export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => deleteSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (userId === data.user_id) throw new Error("Não é possível remover você mesmo.");
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);
    if (!roles?.some((r) => r.role === "owner")) throw new Error("Sem permissão");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
