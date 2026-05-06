import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type AppRole = "owner" | "collaborator" | "viewer";
type AppModule = "companies" | "projects" | "tasks" | "appointments" | "reports";

const schema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(6).max(72),
  full_name: z.string().min(1).max(120),
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
