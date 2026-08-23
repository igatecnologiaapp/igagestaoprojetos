import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldAlert, ShieldCheck, Search, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/permissions")({
  component: () => (
    <RequireAuth>
      <PermissionsPage />
    </RequireAuth>
  ),
  head: () => ({
    meta: [
      { title: "Permissões e Papéis — Gestão de Projetos IGA" },
      { name: "description", content: "Administração do RBAC granular: papéis, catálogo de permissões, exceções individuais e permissões efetivas por usuário." },
      { property: "og:title", content: "Permissões e Papéis — Gestão de Projetos IGA" },
      { property: "og:description", content: "Administração do RBAC granular do sistema de gestão de projetos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Role = "owner" | "collaborator" | "viewer";
const roleLabels: Record<Role, string> = {
  owner: "Administrador",
  collaborator: "Colaborador",
  viewer: "Visualizador",
};
const roles: Role[] = ["owner", "collaborator", "viewer"];

function PermissionsPage() {
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [roleTab, setRoleTab] = useState<Role>("collaborator");

  const { data: permissions = [] } = useQuery({
    queryKey: ["app-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_permissions")
        .select("key,category,description")
        .order("category")
        .order("key");
      if (error) throw error;
      return data;
    },
    enabled: isOwner,
  });

  const { data: rolePerms = [] } = useQuery({
    queryKey: ["role-permissions"],
    queryFn: async () => {
      const { data, error } = await supabase.from("role_permissions").select("id,role,permission_key");
      if (error) throw error;
      return data;
    },
    enabled: isOwner,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["rbac-users"],
    queryFn: async () => {
      const [{ data: profiles }, { data: ur }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,job_title").order("full_name"),
        supabase.from("user_roles").select("user_id,role"),
      ]);
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (ur ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as Role),
      }));
    },
    enabled: isOwner,
  });

  const { data: overrides = [] } = useQuery({
    queryKey: ["permission-overrides"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_permission_overrides")
        .select("id,user_id,permission_key,granted");
      if (error) throw error;
      return data;
    },
    enabled: isOwner,
  });

  const toggleRolePerm = useMutation({
    mutationFn: async (v: { role: Role; key: string; enable: boolean }) => {
      if (v.enable) {
        const { error } = await supabase.from("role_permissions").insert({ role: v.role, permission_key: v.key });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("role_permissions")
          .delete()
          .eq("role", v.role)
          .eq("permission_key", v.key);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["role-permissions"] });
      toast.success("Permissão do perfil atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setOverride = useMutation({
    mutationFn: async (v: { user_id: string; key: string; granted: boolean | null }) => {
      await supabase
        .from("user_permission_overrides")
        .delete()
        .eq("user_id", v.user_id)
        .eq("permission_key", v.key);
      if (v.granted !== null) {
        const { error } = await supabase
          .from("user_permission_overrides")
          .insert({ user_id: v.user_id, permission_key: v.key, granted: v.granted });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["permission-overrides"] });
      toast.success("Exceção individual atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const filteredUsers = useMemo(
    () => users.filter((u) => (u.full_name ?? "").toLowerCase().includes(search.toLowerCase())),
    [users, search],
  );

  const current = users.find((u) => u.id === selectedUser) ?? null;

  const effective = useMemo(() => {
    if (!current) return {} as Record<string, { effective: boolean; source: string }>;
    const isAdmin = current.roles.includes("owner");
    const inherited = new Set(
      rolePerms.filter((rp) => current.roles.includes(rp.role as Role)).map((rp) => rp.permission_key),
    );
    const map: Record<string, { effective: boolean; source: string }> = {};
    for (const p of permissions) {
      const ov = overrides.find((o) => o.user_id === current.id && o.permission_key === p.key);
      if (ov && ov.granted === false) map[p.key] = { effective: false, source: "Exceção: negada" };
      else if (isAdmin) map[p.key] = { effective: true, source: "Administrador (total)" };
      else if (ov && ov.granted === true) map[p.key] = { effective: true, source: "Exceção: concedida" };
      else if (inherited.has(p.key)) map[p.key] = { effective: true, source: "Herdada do perfil" };
      else map[p.key] = { effective: false, source: "Sem permissão" };
    }
    return map;
  }, [current, permissions, rolePerms, overrides]);

  const categories = useMemo(() => {
    const g: Record<string, typeof permissions> = {};
    for (const p of permissions) (g[p.category] ??= []).push(p);
    return g;
  }, [permissions]);

  if (!isOwner) {
    return (
      <Card className="p-8 text-center">
        <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
        <h2 className="mt-4 font-semibold">Acesso restrito</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Apenas Administradores podem gerenciar papéis e permissões.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Permissões e Papéis</h1>
        <p className="text-sm text-muted-foreground">
          Catálogo de {permissions.length} permissões, herança por perfil, exceções individuais e permissões efetivas.
        </p>
      </div>

      <Tabs defaultValue="roles">
        <TabsList>
          <TabsTrigger value="roles">Perfis e permissões</TabsTrigger>
          <TabsTrigger value="users">Usuários e exceções</TabsTrigger>
        </TabsList>

        <TabsContent value="roles" className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Perfil</span>
            <Select value={roleTab} onValueChange={(v) => setRoleTab(v as Role)}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r} value={r}>
                    {roleLabels[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {roleTab === "owner" && (
              <Badge variant="secondary">Administrador possui todas as permissões por definição</Badge>
            )}
          </div>

          {Object.entries(categories).map(([cat, list]) => (
            <Card key={cat} className="p-4">
              <h3 className="font-medium capitalize mb-3">{cat}</h3>
              <div className="grid gap-2 md:grid-cols-2">
                {list.map((p) => {
                  const enabled = rolePerms.some((rp) => rp.role === roleTab && rp.permission_key === p.key);
                  return (
                    <label key={p.key} className="flex items-start gap-3 rounded-md border p-3">
                      <Switch
                        checked={roleTab === "owner" ? true : enabled}
                        disabled={roleTab === "owner" || toggleRolePerm.isPending}
                        onCheckedChange={(v) => toggleRolePerm.mutate({ role: roleTab, key: p.key, enable: v })}
                      />
                      <span className="text-sm">
                        <span className="font-mono text-xs">{p.key}</span>
                        <span className="block text-muted-foreground">{p.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="users" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[280px_1fr]">
            <Card className="p-3 space-y-2 h-fit">
              <div className="relative">
                <Search className="h-4 w-4 absolute left-2 top-2.5 text-muted-foreground" />
                <Input
                  className="pl-8"
                  placeholder="Pesquisar usuário"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="space-y-1 max-h-[520px] overflow-auto">
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => setSelectedUser(u.id)}
                    className={`w-full text-left rounded-md px-3 py-2 text-sm ${selectedUser === u.id ? "bg-accent" : "hover:bg-muted"}`}
                  >
                    <div className="font-medium">{u.full_name ?? "—"}</div>
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {u.roles.map((r) => (
                        <Badge key={r} variant="outline" className="text-[10px]">
                          {roleLabels[r]}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              {!current ? (
                <p className="text-sm text-muted-foreground">Selecione um usuário para ver as permissões efetivas.</p>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <div className="font-medium">{current.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {current.roles.map((r) => roleLabels[r]).join(", ") || "Sem papel atribuído"}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {permissions.map((p) => {
                      const eff = effective[p.key];
                      const ov = overrides.find((o) => o.user_id === current.id && o.permission_key === p.key);
                      return (
                        <div key={p.key} className="flex items-center justify-between gap-3 rounded-md border p-2">
                          <div className="min-w-0">
                            <div className="font-mono text-xs truncate">{p.key}</div>
                            <div className="text-xs text-muted-foreground">{eff?.source}</div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Badge variant={eff?.effective ? "default" : "outline"}>
                              {eff?.effective ? "Permitido" : "Bloqueado"}
                            </Badge>
                            <Button
                              size="sm"
                              variant={ov?.granted === true ? "default" : "outline"}
                              onClick={() =>
                                setOverride.mutate({
                                  user_id: current.id,
                                  key: p.key,
                                  granted: ov?.granted === true ? null : true,
                                })
                              }
                            >
                              Conceder
                            </Button>
                            <Button
                              size="sm"
                              variant={ov?.granted === false ? "destructive" : "outline"}
                              onClick={() =>
                                setOverride.mutate({
                                  user_id: current.id,
                                  key: p.key,
                                  granted: ov?.granted === false ? null : false,
                                })
                              }
                            >
                              Negar
                            </Button>
                            {ov && (
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Remover exceção"
                                onClick={() => setOverride.mutate({ user_id: current.id, key: p.key, granted: null })}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
