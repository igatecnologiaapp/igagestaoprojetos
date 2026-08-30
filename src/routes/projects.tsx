import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, FolderKanban, AlertTriangle, Pencil, Trash2, LayoutGrid, Rows3, Settings2, Search } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { ProjectShares } from "@/components/task-collaboration";
import { ProjectDetailDialog } from "@/components/project-detail";
import { CustomFieldDefinitions } from "@/components/project-custom-fields";

export const Route = createFileRoute("/projects")({
  component: () => <RequireAuth module="projects"><ProjectsPage /></RequireAuth>,
  head: () => ({
    meta: [
      { title: "Projetos — FlowDesk" },
      { name: "description", content: "Gerencie projetos, prompts, repositórios, créditos Lovable e campos personalizados." },
      { property: "og:title", content: "Projetos — FlowDesk" },
      { property: "og:description", content: "Gerencie projetos, prompts, repositórios, créditos Lovable e campos personalizados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const statusLabels: Record<string, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  paused: "Pausado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  planning: "secondary",
  in_progress: "default",
  paused: "outline",
  completed: "default",
  cancelled: "destructive",
};

type ProjectForm = {
  name: string; company_id: string; description: string; value: string; start_date: string; end_date: string;
  status: "planning" | "in_progress" | "paused" | "completed" | "cancelled";
  phase: string; next_action: string; owner_id: string;
};
const emptyProject: ProjectForm = {
  name: "", company_id: "", description: "", value: "", start_date: "", end_date: "", status: "planning",
  phase: "", next_action: "", owner_id: "",
};

function ProjectsPage() {
  const qc = useQueryClient();
  const { canEdit, isOwner } = useAuth();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [view, setView] = useState<"cards" | "table">("cards");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [form, setForm] = useState<ProjectForm>(emptyProject);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const [{ data: p }, { data: t }, { data: c }] = await Promise.all([
        supabase.from("projects").select("*, companies(name)").order("created_at", { ascending: false }),
        supabase.from("tasks").select("project_id,status"),
        (supabase as unknown as { from: (t: string) => any }).from("project_credits").select("project_id,amount"),
      ]);
      return (p ?? []).map((proj) => {
        const tasks = (t ?? []).filter((tk) => tk.project_id === proj.id);
        const completed = tasks.filter((tk) => tk.status === "completed").length;
        const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
        const credits = ((c ?? []) as { project_id: string; amount: number }[])
          .filter((cr) => cr.project_id === proj.id)
          .reduce((s, cr) => s + Number(cr.amount ?? 0), 0);
        return { ...proj, progress, tasksCount: tasks.length, credits };
      });
    },
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-select"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id,name").eq("status", "active").order("name");
      return data ?? [];
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-select"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name").order("full_name");
      return data ?? [];
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name,
        company_id: form.company_id,
        description: form.description || null,
        value: form.value ? Number(form.value) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: form.status,
        phase: form.phase || null,
        next_action: form.next_action || null,
        owner_id: form.owner_id || null,
      };
      if (editingId) {
        const { error } = await supabase.from("projects").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("projects").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Projeto atualizado" : "Projeto criado");
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["company-projects"] });
      setOpen(false); setEditingId(null); setForm(emptyProject);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Projeto removido"); qc.invalidateQueries({ queryKey: ["projects"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (p: typeof projects[number]) => {
    setEditingId(p.id);
    setForm({
      name: p.name, company_id: p.company_id, description: p.description ?? "",
      value: p.value != null ? String(p.value) : "", start_date: p.start_date ?? "",
      end_date: p.end_date ?? "", status: p.status,
      phase: p.phase ?? "", next_action: p.next_action ?? "", owner_id: p.owner_id ?? "",
    });
    setOpen(true);
  };

  const today = new Date().toISOString().slice(0, 10);
  const nameOf = (uid: string | null | undefined) => profiles.find((pr) => pr.id === uid)?.full_name ?? "—";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return projects.filter((p) => {
      const matchesText = !q
        || p.name.toLowerCase().includes(q)
        || ((p.companies as { name: string } | null)?.name ?? "").toLowerCase().includes(q)
        || (p.phase ?? "").toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || p.status === statusFilter;
      return matchesText && matchesStatus;
    });
  }, [projects, search, statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-semibold">Projetos</h1>
          <p className="text-muted-foreground mt-1">Acompanhe o progresso, os recursos e o histórico dos seus projetos</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isOwner && (
            <Dialog open={fieldsOpen} onOpenChange={setFieldsOpen}>
              <DialogTrigger asChild>
                <Button variant="outline"><Settings2 className="h-4 w-4 mr-1" />Campos personalizados</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader><DialogTitle>Campos personalizados de projetos</DialogTitle></DialogHeader>
                <CustomFieldDefinitions />
              </DialogContent>
            </Dialog>
          )}
          {canEdit && (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm(emptyProject); } }}>
              <DialogTrigger asChild><Button onClick={() => { setEditingId(null); setForm(emptyProject); }}><Plus className="h-4 w-4 mr-1" />Novo projeto</Button></DialogTrigger>
              <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>{editingId ? "Editar projeto" : "Novo projeto"}</DialogTitle></DialogHeader>
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }}>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome *</Label>
                    <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Empresa *</Label>
                    <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger>
                      <SelectContent>
                        {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Descrição</Label>
                    <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Etapa atual</Label>
                      <Input value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Responsável</Label>
                      <Select value={form.owner_id} onValueChange={(v) => setForm({ ...form, owner_id: v })}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {profiles.map((pr) => <SelectItem key={pr.id} value={pr.id}>{pr.full_name ?? pr.id.slice(0, 8)}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Próxima ação</Label>
                    <Input value={form.next_action} onChange={(e) => setForm({ ...form, next_action: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Valor (R$)</Label>
                      <Input type="number" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Início</Label>
                      <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Fim</Label>
                      <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as typeof form.status })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={!form.company_id || saveMut.isPending}>{editingId ? "Salvar alterações" : "Criar projeto"}</Button>
                  </DialogFooter>
                </form>
                {editingId && (
                  <div className="border-t pt-4 mt-2">
                    <ProjectShares projectId={editingId} />
                  </div>
                )}
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-0 sm:min-w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="Buscar por projeto, empresa ou etapa…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {Object.entries(statusLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex rounded-md border overflow-hidden">
          <Button size="sm" variant={view === "cards" ? "secondary" : "ghost"} className="rounded-none" onClick={() => setView("cards")}>
            <LayoutGrid className="h-4 w-4 mr-1" />Cards
          </Button>
          <Button size="sm" variant={view === "table" ? "secondary" : "ghost"} className="rounded-none" onClick={() => setView("table")}>
            <Rows3 className="h-4 w-4 mr-1" />Tabela
          </Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">Nenhum projeto encontrado</p>
        </Card>
      ) : view === "table" ? (
        <Card className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Projeto</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Etapa</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead className="text-right">Progresso</TableHead>
                <TableHead className="text-right">Créditos</TableHead>
                <TableHead>Prazo</TableHead>
                <TableHead>Atualizado</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id} className="cursor-pointer" onClick={() => setDetailId(p.id)}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{(p.companies as { name: string } | null)?.name ?? "—"}</TableCell>
                  <TableCell><Badge variant={statusVariant[p.status]}>{statusLabels[p.status]}</Badge></TableCell>
                  <TableCell>{p.phase ?? "—"}</TableCell>
                  <TableCell>{nameOf(p.owner_id)}</TableCell>
                  <TableCell className="text-right">{p.progress}%</TableCell>
                  <TableCell className="text-right">{p.credits.toLocaleString("pt-BR")}</TableCell>
                  <TableCell>{p.end_date ? new Date(p.end_date + "T00:00:00").toLocaleDateString("pt-BR") : "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {p.last_activity_at ? new Date(p.last_activity_at).toLocaleDateString("pt-BR") : "—"}
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    {canEdit && (
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                        {isOwner && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm("Excluir projeto?")) deleteMut.mutate(p.id); }}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((p) => {
            const overdue = p.end_date && p.end_date < today && p.status !== "completed";
            return (
              <Card key={p.id} className="p-5 hover:shadow-md transition-shadow h-full group relative min-w-0">
                <button type="button" className="block w-full text-left" onClick={() => setDetailId(p.id)}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-display font-semibold truncate">{p.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {(p.companies as { name: string } | null)?.name ?? "—"}
                      </p>
                    </div>
                    <Badge variant={statusVariant[p.status]}>{statusLabels[p.status]}</Badge>
                  </div>
                  {p.phase && <p className="text-xs text-muted-foreground mt-2">Etapa: {p.phase}</p>}
                  {p.description && (
                    <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{p.description}</p>
                  )}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">{p.tasksCount} tarefas · {p.credits.toLocaleString("pt-BR")} créditos</span>
                      <span className="font-medium">{p.progress}%</span>
                    </div>
                    <Progress value={p.progress} />
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{p.end_date ? `Prazo: ${new Date(p.end_date + "T00:00:00").toLocaleDateString("pt-BR")}` : "Sem prazo"}</span>
                    {overdue && <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" />Atrasado</span>}
                  </div>
                </button>
                {canEdit && (
                  <div className="absolute bottom-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-background/90 rounded-md border shadow-sm">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.preventDefault(); openEdit(p); }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    {isOwner && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={(e) => { e.preventDefault(); if (confirm("Excluir projeto?")) deleteMut.mutate(p.id); }}>
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

      <ProjectDetailDialog projectId={detailId} onOpenChange={(o) => { if (!o) setDetailId(null); }} />
    </div>
  );
}
