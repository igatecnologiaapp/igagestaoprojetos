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
import { Plus, Trash2, Pencil, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { adminCreateUser, adminUpdateUserAccess, adminDeleteUser } from "@/server/users.functions";

export const Route = createFileRoute("/users")({
  component: () => <RequireAuth><UsersPage /></RequireAuth>,
  head: () => ({ meta: [{ title: "Usuários — FlowDesk" }] }),
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
  const [form, setForm] = useState({
    email: "", password: "", full_name: "",
    role: "collaborator" as Role,
    modules: [] as AppModule[],
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

  const reset = () => { setForm({ email: "", password: "", full_name: "", role: "collaborator", modules: [] }); setEditing(null); };

  const createMut = useMutation({
    mutationFn: () => adminCreateUser({ data: form }),
    onSuccess: () => { toast.success("Usuário criado"); qc.invalidateQueries({ queryKey: ["all-users"] }); setOpen(false); reset(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateMut = useMutation({
    mutationFn: () => adminUpdateUserAccess({ data: { user_id: editing!, role: form.role, modules: form.modules } }),
    onSuccess: () => { toast.success("Atualizado"); qc.invalidateQueries({ queryKey: ["all-users"] }); setOpen(false); reset(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => adminDeleteUser({ data: { user_id: id } }),
    onSuccess: () => { toast.success("Usuário removido"); qc.invalidateQueries({ queryKey: ["all-users"] }); },
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
          <p className="text-sm text-muted-foreground">Cadastre, defina papéis e libere módulos.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
          <DialogTrigger asChild>
            <Button onClick={reset}><Plus className="h-4 w-4" /> Novo usuário</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{editing ? "Editar acesso" : "Novo usuário"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              {!editing && (
                <>
                  <div><Label>Nome completo</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
                  <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                  <div><Label>Senha provisória</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
                </>
              )}
              <div>
                <Label>Papel</Label>
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
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                onClick={() => editing ? updateMut.mutate() : createMut.mutate()}
                disabled={createMut.isPending || updateMut.isPending || (!editing && (!form.email || !form.password || !form.full_name))}
              >
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? <p className="text-muted-foreground">Carregando…</p> : (
        <div className="grid gap-3">
          {users.map((u) => (
            <Card key={u.id} className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-medium">{u.full_name ?? "—"}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {u.roles.map((r) => <Badge key={r} variant="secondary">{roleLabels[r]}</Badge>)}
                  {u.modules.length === 0
                    ? <Badge variant="outline">Todos os módulos</Badge>
                    : u.modules.map((m) => <Badge key={m} variant="outline">{allModules.find((x) => x.value === m)?.label}</Badge>)}
                </div>
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => {
                  setEditing(u.id);
                  setForm({ email: "", password: "", full_name: u.full_name ?? "", role: (u.roles[0] ?? "collaborator") as Role, modules: u.modules });
                  setOpen(true);
                }}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => {
                  if (confirm(`Remover ${u.full_name}?`)) deleteMut.mutate(u.id);
                }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
