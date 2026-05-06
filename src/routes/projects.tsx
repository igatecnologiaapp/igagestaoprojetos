import { createFileRoute, Link } from "@tanstack/react-router";
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
import { Progress } from "@/components/ui/progress";
import { Plus, FolderKanban, AlertTriangle } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/projects")({
  component: () => <RequireAuth><ProjectsPage /></RequireAuth>,
  head: () => ({ meta: [{ title: "Projetos — FlowDesk" }] }),
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

function ProjectsPage() {
  const qc = useQueryClient();
  const { canEdit } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", company_id: "", description: "", value: "", start_date: "", end_date: "",
    status: "planning" as "planning" | "in_progress" | "paused" | "completed" | "cancelled",
  });

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: async () => {
      const [{ data: p }, { data: t }] = await Promise.all([
        supabase.from("projects").select("*, companies(name)").order("created_at", { ascending: false }),
        supabase.from("tasks").select("project_id,status"),
      ]);
      return (p ?? []).map((proj) => {
        const tasks = (t ?? []).filter((tk) => tk.project_id === proj.id);
        const completed = tasks.filter((tk) => tk.status === "completed").length;
        const progress = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
        return { ...proj, progress, tasksCount: tasks.length };
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

  const createMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("projects").insert({
        name: form.name,
        company_id: form.company_id,
        description: form.description || null,
        value: form.value ? Number(form.value) : null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        status: form.status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Projeto criado");
      qc.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
      setForm({ name: "", company_id: "", description: "", value: "", start_date: "", end_date: "", status: "planning" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-semibold">Projetos</h1>
          <p className="text-muted-foreground mt-1">Acompanhe o progresso dos seus projetos</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Novo projeto</Button></DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader><DialogTitle>Novo projeto</DialogTitle></DialogHeader>
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}>
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
                  <Button type="submit" disabled={!form.company_id || createMut.isPending}>Criar projeto</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : projects.length === 0 ? (
        <Card className="p-12 text-center">
          <FolderKanban className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">Nenhum projeto criado ainda</p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => {
            const overdue = p.end_date && p.end_date < today && p.status !== "completed";
            return (
              <Link key={p.id} to="/tasks" search={{ project: p.id }}>
                <Card className="p-5 hover:shadow-md transition-shadow h-full">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-display font-semibold truncate">{p.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {(p.companies as { name: string } | null)?.name ?? "—"}
                      </p>
                    </div>
                    <Badge variant={statusVariant[p.status]}>{statusLabels[p.status]}</Badge>
                  </div>
                  {p.description && (
                    <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{p.description}</p>
                  )}
                  <div className="mt-4">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span className="text-muted-foreground">{p.tasksCount} tarefas</span>
                      <span className="font-medium">{p.progress}%</span>
                    </div>
                    <Progress value={p.progress} />
                  </div>
                  <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{p.end_date ? `Prazo: ${new Date(p.end_date).toLocaleDateString("pt-BR")}` : "Sem prazo"}</span>
                    {overdue && <span className="flex items-center gap-1 text-destructive"><AlertTriangle className="h-3 w-3" />Atrasado</span>}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
