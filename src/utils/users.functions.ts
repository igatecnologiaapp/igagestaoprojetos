import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequest } from "@tanstack/react-start/server";

// Link de definição de senha deve abrir a tela de nova senha do próprio site.
function passwordSetupRedirect(): string | undefined {
  try {
    const origin = new URL(getRequest().url).origin;
    return `${origin}/reset-password`;
  } catch {
    return undefined;
  }
}

/** Mensagem clara quando o Supabase não consegue enviar o e-mail de convite. */
function inviteErrorMessage(raw?: string): string {
  const m = (raw ?? "").toLowerCase();
  if (m.includes("already") || m.includes("registered") || m.includes("exists")) {
    return "Já existe um usuário com este e-mail.";
  }
  if (m.includes("rate limit")) {
    return "Limite de envio de e-mails atingido. Aguarde alguns minutos ou crie o usuário com senha provisória.";
  }
  if (m.includes("email") || m.includes("smtp") || m.includes("sending")) {
    return "Não foi possível enviar o e-mail de convite. Tente novamente ou crie o usuário com senha provisória.";
  }
  return raw || "Falha ao enviar o convite.";
}

type AppRole = "owner" | "collaborator" | "viewer";
type AccessRole = AppRole | "client";

/**
 * Aplica o perfil do usuário numa ÚNICA transação no banco (admin_apply_user_access, Fase 4b).
 * Cliente (Portal do Cliente) não tem papel interno: fica só vinculado à empresa em client_users.
 * Se qualquer etapa falhar (participação interna, privilégio, empresa inválida), nada é alterado
 * e o usuário mantém o perfil que tinha.
 */
async function applyAccess(targetId: string, role: AccessRole, companyId: string | undefined, actorId: string) {
  const { error } = await supabaseAdmin.rpc("admin_apply_user_access", {
    _user_id: targetId,
    _role: role,
    _company_id: role === "client" ? (companyId ?? null) : null,
    _actor: actorId,
  });
  if (error) {
    // Mensagens em português definidas na função do banco seguem como estão.
    const known = ["participa de projetos", "Selecione a empresa", "Perfil inválido", "perfil interno"];
    throw new Error(known.some((k) => error.message.includes(k)) ? error.message : `Não foi possível aplicar o perfil: ${error.message}`);
  }
}
type AppModule = "companies" | "projects" | "tasks" | "appointments" | "reports";

const schema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(72).optional(),
  full_name: z.string().min(1).max(120),
  job_title: z.string().max(120).optional(),
  role: z.enum(["owner", "collaborator", "viewer", "client"]),
  company_id: z.string().uuid().optional(),
  modules: z.array(z.enum(["companies", "projects", "tasks", "appointments", "reports"])).default([]),
}).refine((d) => d.role !== "client" || !!d.company_id, { message: "Selecione a empresa do Cliente." });

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

    // Sem senha informada: o Supabase cria a conta e envia o convite por e-mail;
    // o próprio usuário define a senha pelo link recebido.
    // Com senha provisória: a conta já nasce ativa e a troca é obrigatória no 1º acesso.
    const invite = !data.password;
    let newId: string;
    if (invite) {
      const { data: invited, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(data.email, {
        data: { full_name: data.full_name, ...(data.role === "client" ? { account_type: "client" } : {}) },
        redirectTo: passwordSetupRedirect(),
      });
      if (error || !invited.user) throw new Error(inviteErrorMessage(error?.message));
      newId = invited.user.id;
    } else {
      const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.full_name, ...(data.role === "client" ? { account_type: "client" } : {}) },
        app_metadata: { must_change_password: true },
      });
      if (error || !created.user) throw new Error(error?.message ?? "Falha ao criar");
      newId = created.user.id;
    }

    if (data.job_title) {
      await supabaseAdmin.from("profiles").update({ job_title: data.job_title }).eq("id", newId);
    }

    await applyAccess(newId, data.role, data.company_id, userId);

    if (data.role !== "client" && data.modules.length > 0) {
      await supabaseAdmin
        .from("user_module_access")
        .insert(data.modules.map((m: AppModule) => ({ user_id: newId, module: m })));
    }
    await supabaseAdmin.from("security_access_log").insert({
      actor_id: userId,
      action: "user.create",
      entity_type: "user",
      entity_id: newId,
      origin: "admin.users",
      metadata: { role: data.role, company_id: data.company_id ?? null, modules: data.modules, invite } as never,
    });

    return { id: newId, invited: invite };
  });

const updateSchema = z.object({
  user_id: z.string().uuid(),
  role: z.enum(["owner", "collaborator", "viewer", "client"]),
  company_id: z.string().uuid().optional(),
  modules: z.array(z.enum(["companies", "projects", "tasks", "appointments", "reports"])),
}).refine((d) => d.role !== "client" || !!d.company_id, { message: "Selecione a empresa do Cliente." });

export const adminUpdateUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);
    if (!roles?.some((r) => r.role === "owner")) throw new Error("Sem permissão");
    if (data.role !== "owner") {
      if (data.user_id === userId) throw new Error("Você não pode retirar o próprio perfil de Administrador.");
      const { data: owners } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "owner");
      if (owners?.some((o) => o.user_id === data.user_id) && (owners?.length ?? 0) <= 1) {
        throw new Error("O sistema precisa manter ao menos um Administrador.");
      }
    }

    await applyAccess(data.user_id, data.role, data.company_id, userId);

    await supabaseAdmin.from("user_module_access").delete().eq("user_id", data.user_id);
    if (data.role !== "client" && data.modules.length > 0) {
      await supabaseAdmin
        .from("user_module_access")
        .insert(data.modules.map((m: AppModule) => ({ user_id: data.user_id, module: m })));
    }
    await supabaseAdmin.from("security_access_log").insert({
      actor_id: userId,
      action: "user.access_update",
      entity_type: "user",
      entity_id: data.user_id,
      origin: "admin.users",
      metadata: { role: data.role, company_id: data.company_id ?? null, modules: data.modules } as never,
    });
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
      pending: !u.email_confirmed_at && !u.last_sign_in_at,
      must_change_password: (u.app_metadata as { must_change_password?: boolean } | undefined)?.must_change_password === true,
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
    const pending = !target.user.email_confirmed_at && !target.user.last_sign_in_at;
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: pending ? "invite" : "recovery",
      email: target.user.email,
      options: { redirectTo: passwordSetupRedirect() },
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
    await audit(userId, "user.delete", data.user_id);
    return { ok: true };
  });

const resetSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("email"), user_id: z.string().uuid() }),
  z.object({ mode: z.literal("set"), user_id: z.string().uuid(), password: z.string().min(8).max(72) }),
]);

/**
 * Redefinição de senha pelo Administrador:
 * - "email": envia por e-mail o link de redefinição (ou reenvia o convite, se ainda pendente);
 * - "set": define uma nova senha na hora; o usuário é obrigado a trocá-la no próximo acesso.
 * Nunca registra a senha, o token ou o link na auditoria.
 */
export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => resetSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertOwner(context.userId);
    const { data: target, error: getErr } = await supabaseAdmin.auth.admin.getUserById(data.user_id);
    if (getErr || !target.user) throw new Error("Usuário não encontrado.");
    const email = target.user.email;

    if (data.mode === "set") {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
        password: data.password,
        app_metadata: { ...(target.user.app_metadata ?? {}), must_change_password: true },
      });
      if (error) throw new Error(error.message);
      await audit(context.userId, "user.password_set_by_admin", data.user_id);
      return { ok: true, email };
    }

    if (!email) throw new Error("Usuário sem e-mail cadastrado.");
    const pending = !target.user.email_confirmed_at && !target.user.last_sign_in_at;
    if (pending) {
      const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo: passwordSetupRedirect(),
      });
      if (error) throw new Error(inviteErrorMessage(error.message));
      await audit(context.userId, "user.invite_resent", data.user_id);
    } else {
      const { error } = await supabaseAdmin.auth.resetPasswordForEmail(email, {
        redirectTo: passwordSetupRedirect(),
      });
      if (error) throw new Error(inviteErrorMessage(error.message));
      await audit(context.userId, "user.password_reset_email", data.user_id);
    }
    return { ok: true, email, pending };
  });

/**
 * Chamado pelo próprio usuário depois de trocar a senha:
 * remove a exigência de troca obrigatória (senha provisória ou definida pelo Administrador).
 */
export const clearMustChangePassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: me, error: getErr } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (getErr || !me.user) throw new Error("Usuário não encontrado.");
    const meta = (me.user.app_metadata ?? {}) as Record<string, unknown>;
    if (meta.must_change_password !== true) return { ok: true };
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      app_metadata: { ...meta, must_change_password: false },
    });
    if (error) throw new Error(error.message);
    await audit(context.userId, "user.password_changed_first_access", context.userId);
    return { ok: true };
  });
