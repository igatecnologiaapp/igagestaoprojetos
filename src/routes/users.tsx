import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppModule } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil, ShieldAlert, KeyRound, Power } from "lucide-react";
import { toast } from "sonner";
import {
  adminCreateUser,
  adminUpdateUserAccess,
  adminDeleteUser,
  adminListAuthUsers,
  adminSetUserActive,
  adminSendPasswordSetup,
} from "@/utils/users.functions";

export const Route = createFileRoute("/users")({
  component: () => <RequireAuth><UsersPage /></RequireAuth>,
  head: () => ({
    meta: [
      { title: "Usuários — IGA Tecnologia" },
      { name: "description", content: "Administração de usuários, perfis, permissões e acessos do sistema de gestão de projetos." },
      { property: "og:title", content: "Usuários — IGA Tecnologia" },
      { property: "og:description", content: "Administração de usuários, perfis, permissões e acessos do sistema de gestão de projetos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Role = "owner" | "collaborator" | "viewer";
const roleLabels: Record<Role, string> = { owner: "Administrador", collaborator: "Colaborador", viewer: "Visualizador" };
const allModules: { value: AppModule; label: string }[] = [
  { value: "companies", label: "Empresas" },
  { value: "projects", label: "Projetos" },
  { value: "tasks", label: "Tarefas" },
  { value: "appointments", label: "Agendamentos" },
  { value: "reports", label: "Relatórios" },
];

function UsersPage() {
  const { isOwner } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [inviteMode, setInviteMode] = useState(true);
  const [setupLink, setSetupLink] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: "", password: "", full_name: "", job_title: "",
    role: "collaborator" as Role,
    modules: [] as AppModule[],
  });

  const { data: authUsers = [] } = useQuery({
    queryKey: ["auth-users"],
    queryFn: () => adminListAuthUsers(),
    enabled: isOwner,
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["all-users"],
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }, { data: mods }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,phone,job_title,created_at").order("full_name"),
        supabase.from("user_roles").select("user_id,role"),
        supabase.from("user_module_access").select("user_id,module"),
      ]);
      return (profiles ?? []).map((p) => ({
        ...p,
        roles: (roles ?? []).filter((r) => r.user_id === p.id).map((r) => r.role as Role),
        modules: (mods ?? []).filter((m) => m.user_id === p.id).map((m) => m.module as AppModule),
      }));
    },
    enabled: isOwner,
  });

  const authOf = (id: string) => authUsers.find((a) => a.id === id);

  const reset = () => {
    setForm({ email: "", password: "", full_name: "", job_title: "", role: "collaborator", modules: [] });
    setEditing(null);
    setInviteMode(true);
  };

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["all-users"] });
    qc.invalidateQueries({ queryKey: ["auth-users"] });
  };

  const createMut = useMutation({
    mutationFn: () =>
      adminCreateUser({
        data: {
          email: form.email,
          full_name: form.full_name,
          job_title: form.job_title || undefined,
          role: form.role,
          modules: form.modules,
          ...(inviteMode ? {} : { password: form.password }),
        },
      }),
    onSuccess: (r) => {
      toast.success("Usuário criado");
      if (r.link) setSetupLink(r.link);
      refresh();
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: () => adminUpdateUserAccess({ data: { user_id: editing!, role: form.role, modules: form.modules } }),
    onSuccess: () => { toast.success("Atualizado"); refresh(); setOpen(false); reset(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminDeleteUser({ data: { user_id: id } }),
    onSuccess: () => { toast.success("Usuário removido"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const activeMut = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => adminSetUserActive({ data: { user_id: v.id, active: v.active } }),
    onSuccess: () => { toast.success("Situação de acesso atualizada"); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setupMut = useMutation({
    mutationFn: (id: string) => adminSendPasswordSetup({ data: { user_id: id } }),
    onSuccess: (r) => { setSetupLink(r.link); toast.success("Link de definição de senha gerado"); },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isOwner) {
    return (
      <Card className="p-8 text-center">
        <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
        <h2 className="mt-4 font-semibold">Acesso restrito</h2>
        <p className="text-sm text-muted-foreground mt-1">Apenas Administradores podem gerenciar usuários.</p>
      </Card>
    );
  }

  const toggleMod = (m: AppModule) => setForm((f) => ({
    ...f,
    modules: f.modules.includes(m) ? f.modules.filter((x) => x !== m) : [...f.modules, m],
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Usuários</h1>
          <p className="text-sm text-muted-foreground">
            O acesso é concedido apenas por Administradores. Não existe autocadastro público.
          </p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
          <DialogTrigger asChild>
            <Button onClick={reset}><Plus className="h-4 w-4" /> Novo usuário</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing ? "Editar acesso" : "Novo usuário"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {!editing && (
                <>
                  <div><Label>Nome completo</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                  <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>Cargo/função</Label><Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} /></div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={inviteMode} onCheckedChange={(v) => setInviteMode(v === true)} />
                    Enviar convite para o próprio usuário definir a senha (recomendado)
                  </label>
                  {!inviteMode && (
                    <div>
                      <Label>Senha provisória</Label>
                      <Input type="password" minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                    </div>
                  )}
                </>
              )}
              <div>
                <Label>Perfil</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(roleLabels) as [Role, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Módulos liberados</Label>
                <p className="text-xs text-muted-foreground mb-2">Vazio = todos. Administradores acessam tudo.</p>
                <div className="grid grid-cols-2 gap-2">
                  {allModules.map((m) => (
                    <label key={m.value} className="flex items-center gap-2 text-sm">
                      <Checkbox checked={form.modules.includes(m.value)} onCheckedChange={() => toggleMod(m.value)} />
                      {m.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Exceções individuais de permissão e escopo por projeto continuam na tela Permissões.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => editing ? updateMut.mutate() : createMut.mutate()}
                disabled={
                  createMut.isPending || updateMut.isPending
                  || (!editing && (!form.email || !form.full_name || (!inviteMode && form.password.length < 8)))
                }
              >
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {setupLink && (
        <Card className="p-4 space-y-2">
          <div className="text-sm font-medium">Link seguro de definição de senha</div>
          <p className="text-xs text-muted-foreground">
            Envie este link ao usuário. Ele é de uso único e não fica registrado na auditoria.
          </p>
          <Input readOnly value={setupLink} onFocus={(e) => e.currentTarget.select()} />
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(setupLink); toast.success("Link copiado"); }}>
              Copiar link
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSetupLink(null)}>Fechar</Button>
          </div>
        </Card>
      )}

      {isLoading ? <p className="text-muted-foreground">Carregando…</p> : (
        <div className="grid gap-3">
          {users.map((u) => {
            const auth = authOf(u.id);
            const active = auth?.active ?? true;
            return (
              <Card key={u.id} className="p-4 flex items-center justify-between flex-wrap gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{u.full_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {auth?.email ?? "—"}{u.job_title ? ` · ${u.job_title}` : ""}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant={active ? "secondary" : "destructive"}>{active ? "Ativo" : "Desativado"}</Badge>
                    {u.roles.map((r) => <Badge key={r} variant="secondary">{roleLabels[r]}</Badge>)}
                    {u.modules.length === 0
                      ? <Badge variant="outline">Todos os módulos</Badge>
                      : u.modules.map((m) => <Badge key={m} variant="outline">{allModules.find((x) => x.value === m)?.label}</Badge>)}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" aria-label="Editar acesso" onClick={() => {
                    setEditing(u.id);
                    setForm({ email: "", password: "", full_name: u.full_name ?? "", job_title: u.job_title ?? "", role: (u.roles[0] ?? "collaborator") as Role, modules: u.modules });
                    setOpen(true);
                  }}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Gerar link de definição de senha" onClick={() => setupMut.mutate(u.id)}>
                    <KeyRound className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label={active ? "Desativar acesso" : "Ativar acesso"} onClick={() => activeMut.mutate({ id: u.id, active: !active })}>
                    <Power className={`h-4 w-4 ${active ? "" : "text-destructive"}`} />
                  </Button>
                  <Button size="icon" variant="ghost" aria-label="Remover usuário" onClick={() => {
                    if (confirm(`Remover ${u.full_name}? Prefira desativar o acesso quando houver histórico vinculado.`)) deleteMut.mutate(u.id);
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
