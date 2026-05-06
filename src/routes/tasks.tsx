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
import { Plus, ListChecks, AlertTriangle, GripVertical, Paperclip, Link2, X, Upload, Download, ExternalLink, FileText, Pencil, Trash2, Share2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { AuditHistory } from "@/components/audit-history";
import { TaskShares, TaskComments } from "@/components/task-collaboration";

const searchSchema = z.object({ project: z.string().optional(), task: z.string().optional() });

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
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "", description: "", company_id: "", project_id: "",
    start_date: "", due_date: "",
    priority: "medium" as "low" | "medium" | "high" | "urgent",
    status: "pending" as Status,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["companies-select"],
    queryFn: async () => {
      const { data } = await supabase.from("companies").select("id,name").order("name");
      return data ?? [];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-select"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id,name,company_id").order("name");
      return data ?? [];
    },
  });

  const filteredProjects = form.company_id
    ? projects.filter((p) => (p as { company_id: string }).company_id === form.company_id)
    : projects;

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

  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingLinks, setPendingLinks] = useState<{ name: string; url: string }[]>([]);
  const [linkDraft, setLinkDraft] = useState({ name: "", url: "" });

  const createMut = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      const { data: task, error } = await supabase.from("tasks").insert({
        name: form.name,
        description: form.description || null,
        project_id: form.project_id,
        start_date: form.start_date || null,
        due_date: form.due_date || null,
        priority: form.priority,
        status: form.status,
      }).select("id").single();
      if (error) throw error;

      // Upload files
      const attachments: Array<{ task_id: string; type: "file" | "link"; name: string; url: string; storage_path: string | null; created_by: string | null }> = [];
      for (const file of pendingFiles) {
        const path = `${task.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("task-files").upload(path, file);
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("task-files").getPublicUrl(path);
        attachments.push({ task_id: task.id, type: "file", name: file.name, url: pub.publicUrl, storage_path: path, created_by: userId ?? null });
      }
      for (const link of pendingLinks) {
        attachments.push({ task_id: task.id, type: "link", name: link.name || link.url, url: link.url, storage_path: null, created_by: userId ?? null });
      }
      if (attachments.length > 0) {
        const { error: attErr } = await supabase.from("task_attachments").insert(attachments);
        if (attErr) throw attErr;
      }
    },
    onSuccess: () => {
      toast.success("Tarefa criada");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setOpen(false);
      setForm({ ...form, name: "", description: "", company_id: "", project_id: "", start_date: "", due_date: "" });
      setPendingFiles([]);
      setPendingLinks([]);
      setLinkDraft({ name: "", url: "" });
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

  const updatePriorityMut = useMutation({
    mutationFn: async ({ id, priority }: { id: string; priority: "low" | "medium" | "high" | "urgent" }) => {
      const { error } = await supabase.from("tasks").update({ priority }).eq("id", id);
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
              <DialogContent className="max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Nova tarefa</DialogTitle></DialogHeader>
                <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Nome *</Label>
                    <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Empresa *</Label>
                    <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v, project_id: "" })}>
                      <SelectTrigger><SelectValue placeholder="Selecione uma empresa" /></SelectTrigger>
                      <SelectContent>
                        {companies.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Projeto *</Label>
                    <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })} disabled={!form.company_id}>
                      <SelectTrigger><SelectValue placeholder={form.company_id ? "Selecione um projeto" : "Selecione uma empresa primeiro"} /></SelectTrigger>
                      <SelectContent>
                        {filteredProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
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

                  <div className="space-y-2 pt-2 border-t">
                    <Label className="text-xs flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" />Anexar arquivos</Label>
                    <Input
                      type="file"
                      multiple
                      onChange={(e) => setPendingFiles([...pendingFiles, ...Array.from(e.target.files ?? [])])}
                    />
                    {pendingFiles.length > 0 && (
                      <ul className="space-y-1">
                        {pendingFiles.map((f, i) => (
                          <li key={i} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1">
                            <span className="flex items-center gap-1.5 truncate"><Upload className="h-3 w-3" />{f.name}</span>
                            <button type="button" onClick={() => setPendingFiles(pendingFiles.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs flex items-center gap-1.5"><Link2 className="h-3.5 w-3.5" />Links externos</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nome (opcional)"
                        value={linkDraft.name}
                        onChange={(e) => setLinkDraft({ ...linkDraft, name: e.target.value })}
                      />
                      <Input
                        placeholder="https://..."
                        value={linkDraft.url}
                        onChange={(e) => setLinkDraft({ ...linkDraft, url: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!linkDraft.url) return;
                          setPendingLinks([...pendingLinks, linkDraft]);
                          setLinkDraft({ name: "", url: "" });
                        }}
                      >Add</Button>
                    </div>
                    {pendingLinks.length > 0 && (
                      <ul className="space-y-1">
                        {pendingLinks.map((l, i) => (
                          <li key={i} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1">
                            <span className="flex items-center gap-1.5 truncate"><Link2 className="h-3 w-3" />{l.name || l.url}</span>
                            <button type="button" onClick={() => setPendingLinks(pendingLinks.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
                          </li>
                        ))}
                      </ul>
                    )}
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
                        onClick={() => setSelectedTaskId(t.id)}
                        className="group rounded-md border bg-background p-3 cursor-pointer hover:shadow-sm transition-shadow"
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
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                              {canEdit ? (
                                <Select value={t.priority} onValueChange={(v) => updatePriorityMut.mutate({ id: t.id, priority: v as "low" | "medium" | "high" | "urgent" })}>
                                  <SelectTrigger className="h-5 px-1.5 text-[10px] w-auto gap-1 border-0 bg-transparent"><SelectValue /></SelectTrigger>
                                  <SelectContent>{Object.entries(priorityLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                                </Select>
                              ) : (
                                <Badge variant={priorityLabels[t.priority].variant} className="text-[10px] py-0 h-5">{priorityLabels[t.priority].label}</Badge>
                              )}
                              {canEdit && (
                                <Select value={t.status} onValueChange={(v) => updateStatusMut.mutate({ id: t.id, status: v as Status })}>
                                  <SelectTrigger className="h-5 px-1.5 text-[10px] w-auto gap-1 border-0 bg-muted"><SelectValue /></SelectTrigger>
                                  <SelectContent>{statusColumns.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                                </Select>
                              )}
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

      <TaskDetailDialog taskId={selectedTaskId} onClose={() => setSelectedTaskId(null)} />
    </div>
  );
}

function TaskDetailDialog({ taskId, onClose }: { taskId: string | null; onClose: () => void }) {
  const { canEdit } = useAuth();
  const qc = useQueryClient();

  const { data: task } = useQuery({
    queryKey: ["task-detail", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("*, projects(name, companies(name))")
        .eq("id", taskId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["task-attachments", taskId],
    enabled: !!taskId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("task_attachments")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteAttMut = useMutation({
    mutationFn: async (att: { id: string; storage_path: string | null }) => {
      if (att.storage_path) {
        await supabase.storage.from("task-files").remove([att.storage_path]);
      }
      const { error } = await supabase.from("task_attachments").delete().eq("id", att.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Anexo removido");
      qc.invalidateQueries({ queryKey: ["task-attachments", taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const downloadFile = async (path: string, name: string) => {
    const { data, error } = await supabase.storage.from("task-files").download(path);
    if (error) { toast.error(error.message); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };

  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ name: "", description: "", status: "pending" as Status, priority: "medium" as "low" | "medium" | "high" | "urgent", start_date: "", due_date: "" });

  const startEdit = () => {
    if (!task) return;
    setEdit({
      name: task.name, description: task.description ?? "", status: task.status,
      priority: task.priority, start_date: task.start_date ?? "", due_date: task.due_date ?? "",
    });
    setEditing(true);
  };

  const saveEdit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tasks").update({
        name: edit.name, description: edit.description || null, status: edit.status,
        priority: edit.priority, start_date: edit.start_date || null, due_date: edit.due_date || null,
      }).eq("id", taskId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa atualizada");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["task-detail", taskId] });
      setEditing(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteTask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("tasks").delete().eq("id", taskId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Tarefa removida");
      qc.invalidateQueries({ queryKey: ["tasks"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!taskId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2 pr-6">
            <DialogTitle>{task?.name ?? "Tarefa"}</DialogTitle>
            {task && (
              <div className="flex gap-1">
                <Button
                  size="icon" variant="ghost" className="h-7 w-7"
                  title="Compartilhar no WhatsApp"
                  onClick={() => {
                    const url = `${window.location.origin}/tasks?task=${task.id}`;
                    const text = `Tarefa: ${task.name}\nStatus: ${statusColumns.find((s) => s.key === task.status)?.label}\nPrioridade: ${priorityLabels[task.priority].label}${task.due_date ? `\nPrazo: ${new Date(task.due_date).toLocaleDateString("pt-BR")}` : ""}\n${url}`;
                    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
                  }}
                >
                  <Share2 className="h-3.5 w-3.5" />
                </Button>
                {canEdit && !editing && (
                  <>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={startEdit}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm("Excluir tarefa?")) deleteTask.mutate(); }}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </>
                )}
              </div>
            )}
          </div>
        </DialogHeader>
        {task && editing && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveEdit.mutate(); }}>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome</Label>
              <Input required value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição</Label>
              <Textarea rows={3} value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={edit.status} onValueChange={(v) => setEdit({ ...edit, status: v as Status })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{statusColumns.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prioridade</Label>
                <Select value={edit.priority} onValueChange={(v) => setEdit({ ...edit, priority: v as typeof edit.priority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(priorityLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Início</Label>
                <Input type="date" value={edit.start_date} onChange={(e) => setEdit({ ...edit, start_date: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prazo</Label>
                <Input type="date" value={edit.due_date} onChange={(e) => setEdit({ ...edit, due_date: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveEdit.isPending}>Salvar</Button>
            </DialogFooter>
          </form>
        )}
        {task && !editing && (
          <div className="space-y-4">
            <div className="text-xs text-muted-foreground">
              {(task.projects as { name: string; companies: { name: string } | null } | null)?.companies?.name}
              {" · "}
              {(task.projects as { name: string } | null)?.name}
            </div>
            {task.description && <p className="text-sm whitespace-pre-wrap">{task.description}</p>}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={priorityLabels[task.priority].variant}>{priorityLabels[task.priority].label}</Badge>
              <Badge variant="outline">{statusColumns.find((s) => s.key === task.status)?.label}</Badge>
              {task.due_date && <span className="text-xs text-muted-foreground">Prazo: {new Date(task.due_date).toLocaleDateString("pt-BR")}</span>}
            </div>

            <div className="border-t pt-4">
              <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <Paperclip className="h-4 w-4" />
                Anexos ({attachments.length})
              </h3>
              {attachments.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum anexo</p>
              ) : (
                <ul className="space-y-2">
                  {attachments.map((a) => {
                    const ext = a.name.split(".").pop()?.toLowerCase() ?? "";
                    const isImage = a.type === "file" && ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(ext);
                    const isPdf = a.type === "file" && ext === "pdf";
                    return (
                      <li key={a.id} className="bg-muted rounded overflow-hidden">
                        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                          <span className="flex items-center gap-2 text-sm truncate min-w-0">
                            {a.type === "file" ? <FileText className="h-4 w-4 shrink-0" /> : <Link2 className="h-4 w-4 shrink-0" />}
                            <span className="truncate">{a.name}</span>
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            {a.type === "file" && a.storage_path ? (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => downloadFile(a.storage_path!, a.name)} title="Baixar">
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-7 w-7" asChild title="Abrir link">
                                <a href={a.url} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
                              </Button>
                            )}
                            {canEdit && (
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteAttMut.mutate({ id: a.id, storage_path: a.storage_path })} title="Remover">
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                        {isImage && (
                          <a href={a.url} target="_blank" rel="noopener noreferrer" className="block bg-background border-t">
                            <img src={a.url} alt={a.name} className="max-h-64 w-full object-contain" loading="lazy" />
                          </a>
                        )}
                        {isPdf && (
                          <object data={a.url} type="application/pdf" className="w-full h-64 border-t bg-background">
                            <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline p-2 block">
                              Abrir PDF
                            </a>
                          </object>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="border-t pt-4"><TaskShares taskId={task.id} /></div>
            <div className="border-t pt-4"><TaskComments taskId={task.id} /></div>
            <div className="border-t pt-4"><AuditHistory entityType="task" entityId={task.id} /></div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
