import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { RequireAuth } from "@/components/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, ListChecks, AlertTriangle, GripVertical } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

const searchSchema = z.object({ project: z.string().optional() });

export const Route = createFileRoute("/tasks")({
  component: () => <RequireAuth><TasksPage /></RequireAuth>,
  validateSearch: searchSchema,
  head: () => ({ meta: [{ title: "Tarefas — FlowDesk" }] }),
});

const statusColumns = [
  { key: "pending", label: "Pendente", color: "bg-muted" },
  { key: "started", label: "Iniciada", color: "bg-chart-3/15" },
  { key: "in_progress", label: "Em andamento", color: "bg-primary/10" },
  { key: "paused", label: "Pausada", color: "bg-warning/15" },
  { key: "completed", label: "Concluída", color: "bg-success/15" },
] as const;

type Status = typeof statusColumns[number]["key"];

const priorityLabels: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  low: { label: "Baixa", variant: "secondary" },
  medium: { label: "Média", variant: "outline" },
  high: { label: "Alta", variant: "default" },
  urgent: { label: "Urgente", variant: "destructive" },
};

function TasksPage() {
  const qc = useQueryClient();
  const { canEdit } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const projectFilter = search.project ?? "all";

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", description: "", project_id: "",
    start_date: "", due_date: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    status: "pending" as Status,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-select"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id,name").order("name");
      return data ?? [];
    },
  });

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", projectFilter],
    queryFn: async () => {
      let q = supabase.from("tasks").select("*, projects(name)").order("position");
      if (projectFilter !== "all") q = q.eq("project_id", projectFilter);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tasks").insert({
        name: form.name,
        description: form.description || null,
        project_id: form.project_id,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        priority: form.priority,
        status: form.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa criada");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setOpen(false);
      setForm({ ...form, name: "", description: "", start_date: "", due_date: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const today = new Date().toISOString().slice(0, 10);

  const onDrop = (e: React.DragEvent, status: Status) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/plain");
    if (id) updateStatusMut.mutate({ id, status });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-semibold">Tarefas</h1>
          <p className="text-muted-foreground mt-1">Arraste entre colunas para atualizar o status</p>
        </div>
        <div className="flex gap-2">
          <Select
            value={projectFilter}
            onValueChange={(v) => navigate({ search: v === "all" ? {} : { project: v } })}
          >
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os projetos</SelectItem>
              {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {canEdit && (
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Nova tarefa</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome *</Label>
                    <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Projeto *</Label>
                    <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione um projeto" /></SelectTrigger>
                      <SelectContent>
                        {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Descrição</Label>
                    <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Início</Label>
                      <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Prazo</Label>
                      <Input type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Prioridade</Label>
                      <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as typeof form.priority })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {Object.entries(priorityLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Status inicial</Label>
                      <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {statusColumns.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={!form.project_id || createMut.isPending}>Criar tarefa</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : tasks.length === 0 ? (
        <Card className="p-12 text-center">
          <ListChecks className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">Nenhuma tarefa ainda</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
          {statusColumns.map((col) => {
            const colTasks = tasks.filter((t) => t.status === col.key);
            return (
              <div
                key={col.key}
                className="rounded-lg border bg-card p-3 min-h-[200px]"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onDrop(e, col.key)}
              >
                <div className={`flex items-center justify-between px-2 py-1.5 rounded-md mb-3 ${col.color}`}>
                  <span className="text-sm font-medium">{col.label}</span>
                  <span className="text-xs text-muted-foreground">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((t) => {
                    const overdue = t.due_date && t.due_date < today && t.status !== "completed";
                    return (
                      <div
                        key={t.id}
                        draggable={canEdit}
                        onDragStart={(e) => e.dataTransfer.setData("text/plain", t.id)}
                        className="group rounded-md border bg-background p-3 cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow"
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="h-4 w-4 text-muted-foreground mt-0.5 opacity-0 group-hover:opacity-100" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium leading-snug">{t.name}</div>
                            {(t.projects as { name: string } | null) && (
                              <div className="text-xs text-muted-foreground mt-0.5 truncate">
                                {(t.projects as { name: string }).name}
                              </div>
                            )}
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              <Badge variant={priorityLabels[t.priority].variant} className="text-[10px] py-0 h-5">
                                {priorityLabels[t.priority].label}
                              </Badge>
                              {t.due_date && (
                                <span className={`text-[10px] flex items-center gap-1 ${overdue ? "text-destructive" : "text-muted-foreground"}`}>
                                  {overdue && <AlertTriangle className="h-3 w-3" />}
                                  {new Date(t.due_date).toLocaleDateString("pt-BR")}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
