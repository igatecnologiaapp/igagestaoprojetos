import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Calendar, MapPin, Users, Pencil, Trash2, X } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/appointments")({
  component: () => <RequireAuth module="appointments"><AppointmentsPage /></RequireAuth>,
  head: () => ({ meta: [{ title: "Agendamentos — FlowDesk" }] }),
});

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  to_schedule: { label: "Agendar", variant: "secondary" },
  scheduled: { label: "Agendado", variant: "default" },
  in_progress: { label: "Em andamento", variant: "secondary" },
  done: { label: "Concluído", variant: "outline" },
  cancelled: { label: "Cancelado", variant: "destructive" },
};

type AppForm = {
  title: string; description: string; company_id: string; project_id: string;
  start_at: string; end_at: string; location: string;
  status: "to_schedule" | "scheduled" | "in_progress" | "done" | "cancelled";
  participants: string[];
};

const empty: AppForm = {
  title: "", description: "", company_id: "", project_id: "",
  start_at: "", end_at: "", location: "", status: "scheduled", participants: [],
};

function AppointmentsPage() {
  const qc = useQueryClient();
  const { canEdit, isOwner } = useAuth();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<AppForm>(empty);

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["appointments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, companies(name), projects(name), appointment_participants(user_id)")
        .order("start_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-select"],
    queryFn: async () => (await supabase.from("companies").select("id,name").order("name")).data ?? [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-select-all"],
    queryFn: async () => (await supabase.from("projects").select("id,name,company_id").order("name")).data ?? [],
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => (await supabase.from("profiles").select("id,full_name").order("full_name")).data ?? [],
  });

  const filteredProjects = form.company_id ? projects.filter((p) => p.company_id === form.company_id) : projects;

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        title: form.title,
        description: form.description || null,
        company_id: form.company_id || null,
        project_id: form.project_id || null,
        start_at: form.start_at,
        end_at: form.end_at || null,
        location: form.location || null,
        status: form.status,
      };
      let id = editingId;
      if (editingId) {
        const { error } = await supabase.from("appointments").update(payload).eq("id", editingId);
        if (error) throw error;
        await supabase.from("appointment_participants").delete().eq("appointment_id", editingId);
      } else {
        const { data, error } = await supabase.from("appointments").insert(payload).select("id").single();
        if (error) throw error;
        id = data.id;
      }
      if (form.participants.length > 0 && id) {
        const rows = form.participants.map((user_id) => ({ appointment_id: id!, user_id }));
        const { error } = await supabase.from("appointment_participants").insert(rows);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Agendamento atualizado" : "Agendamento criado");
      qc.invalidateQueries({ queryKey: ["appointments"] });
      setOpen(false); setEditingId(null); setForm(empty);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("appointments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Agendamento removido"); qc.invalidateQueries({ queryKey: ["appointments"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (a: typeof appointments[number]) => {
    setEditingId(a.id);
    const parts = (a.appointment_participants as Array<{ user_id: string }> | null) ?? [];
    setForm({
      title: a.title, description: a.description ?? "",
      company_id: a.company_id ?? "", project_id: a.project_id ?? "",
      start_at: a.start_at?.slice(0, 16) ?? "", end_at: a.end_at?.slice(0, 16) ?? "",
      location: a.location ?? "", status: a.status,
      participants: parts.map((p) => p.user_id),
    });
    setOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-semibold">Agendamentos</h1>
          <p className="text-muted-foreground mt-1">Reuniões e compromissos vinculados a empresas e projetos</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm(empty); } }}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditingId(null); setForm(empty); }}>
                <Plus className="h-4 w-4 mr-1" />Novo agendamento
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingId ? "Editar agendamento" : "Novo agendamento"}</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }}>
                <div className="space-y-1.5">
                  <Label className="text-xs">Título *</Label>
                  <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Descrição</Label>
                  <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Empresa</Label>
                    <Select value={form.company_id || "none"} onValueChange={(v) => setForm({ ...form, company_id: v === "none" ? "" : v, project_id: "" })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Nenhuma —</SelectItem>
                        {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Projeto</Label>
                    <Select value={form.project_id || "none"} onValueChange={(v) => setForm({ ...form, project_id: v === "none" ? "" : v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Nenhum —</SelectItem>
                        {filteredProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Início *</Label>
                    <Input type="datetime-local" required value={form.start_at} onChange={(e) => setForm({ ...form, start_at: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Fim</Label>
                    <Input type="datetime-local" value={form.end_at} onChange={(e) => setForm({ ...form, end_at: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Local</Label>
                    <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Endereço, sala, link…" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as AppForm["status"] })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Participantes</Label>
                  <Select value="" onValueChange={(v) => { if (v && !form.participants.includes(v)) setForm({ ...form, participants: [...form.participants, v] }); }}>
                    <SelectTrigger><SelectValue placeholder="Adicionar participante…" /></SelectTrigger>
                    <SelectContent>
                      {users.filter((u) => !form.participants.includes(u.id)).map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.full_name ?? u.id.slice(0, 8)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {form.participants.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {form.participants.map((pid) => {
                        const u = users.find((x) => x.id === pid);
                        return (
                          <Badge key={pid} variant="secondary" className="gap-1">
                            {u?.full_name ?? pid.slice(0, 8)}
                            <button type="button" onClick={() => setForm({ ...form, participants: form.participants.filter((p) => p !== pid) })}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={saveMut.isPending}>{editingId ? "Salvar" : "Criar"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : appointments.length === 0 ? (
        <Card className="p-12 text-center">
          <Calendar className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">Nenhum agendamento ainda</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {appointments.map((a) => {
            const parts = (a.appointment_participants as Array<{ user_id: string }> | null) ?? [];
            const partNames = parts.map((p) => users.find((u) => u.id === p.user_id)?.full_name ?? p.user_id.slice(0, 6));
            return (
              <Card key={a.id} className="p-5 group">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-display font-semibold truncate">{a.title}</h3>
                    <div className="text-xs text-muted-foreground mt-1">
                      {(a.companies as { name: string } | null)?.name}
                      {(a.companies && a.projects) && " · "}
                      {(a.projects as { name: string } | null)?.name}
                    </div>
                  </div>
                  <Badge variant={statusLabels[a.status].variant}>{statusLabels[a.status].label}</Badge>
                </div>
                {a.description && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{a.description}</p>}
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3" />
                    {new Date(a.start_at).toLocaleString("pt-BR")}
                    {a.end_at && ` → ${new Date(a.end_at).toLocaleString("pt-BR")}`}
                  </div>
                  {a.location && <div className="flex items-center gap-1.5"><MapPin className="h-3 w-3" />{a.location}</div>}
                  {parts.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Users className="h-3 w-3" />
                      {partNames.join(", ")}
                    </div>
                  )}
                </div>
                {canEdit && (
                  <div className="mt-3 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                    {isOwner && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm("Excluir agendamento?")) deleteMut.mutate(a.id); }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
