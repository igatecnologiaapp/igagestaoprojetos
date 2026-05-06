import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { RequireAuth } from "@/components/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Building2, FolderKanban, ListChecks, AlertTriangle } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/dashboard")({
  component: () => (
    <RequireAuth>
      <DashboardPage />
    </RequireAuth>
  ),
  head: () => ({ meta: [{ title: "Dashboard — FlowDesk" }] }),
});

function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: async () => {
      const [companies, projects, tasks] = await Promise.all([
        supabase.from("companies").select("id,status"),
        supabase.from("projects").select("id,status,end_date"),
        supabase.from("tasks").select("id,status,due_date"),
      ]);
      return {
        companies: companies.data ?? [],
        projects: projects.data ?? [],
        tasks: tasks.data ?? [],
      };
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  const activeProjects = data?.projects.filter((p) => p.status === "in_progress").length ?? 0;
  const lateProjects = data?.projects.filter((p) => p.end_date && p.end_date < today && p.status !== "completed").length ?? 0;
  const completedProjects = data?.projects.filter((p) => p.status === "completed").length ?? 0;
  const overdueTasks = data?.tasks.filter((t) => t.due_date && t.due_date < today && t.status !== "completed").length ?? 0;
  const completedTasks = data?.tasks.filter((t) => t.status === "completed").length ?? 0;
  const totalTasks = data?.tasks.length ?? 0;
  const completionRate = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const statusGroups = [
    { key: "pending", label: "Pendente" },
    { key: "started", label: "Iniciada" },
    { key: "in_progress", label: "Em andamento" },
    { key: "paused", label: "Pausada" },
    { key: "completed", label: "Concluída" },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-semibold">Dashboard</h1>
        <p className="text-muted-foreground mt-1">Visão geral do seu fluxo de trabalho</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard icon={Building2} label="Empresas" value={data?.companies.length ?? 0} />
        <KpiCard icon={FolderKanban} label="Projetos ativos" value={activeProjects} accent="primary" />
        <KpiCard icon={ListChecks} label="Tarefas concluídas" value={`${completedTasks}/${totalTasks}`} />
        <KpiCard icon={AlertTriangle} label="Tarefas atrasadas" value={overdueTasks} accent="destructive" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2">
          <h3 className="font-display font-semibold text-lg mb-4">Tarefas por status</h3>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Carregando…</div>
          ) : (
            <div className="space-y-3">
              {statusGroups.map((g) => {
                const count = data?.tasks.filter((t) => t.status === g.key).length ?? 0;
                const pct = totalTasks ? (count / totalTasks) * 100 : 0;
                return (
                  <div key={g.key}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{g.label}</span>
                      <span className="text-muted-foreground">{count}</span>
                    </div>
                    <Progress value={pct} />
                  </div>
                );
              })}
            </div>
          )}
        </Card>
        <Card className="p-6">
          <h3 className="font-display font-semibold text-lg mb-4">Conclusão geral</h3>
          <div className="text-5xl font-display font-bold">{completionRate}%</div>
          <p className="text-sm text-muted-foreground mt-2">Tarefas concluídas no total</p>
          <div className="mt-6 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">Projetos atrasados</span><span className="font-medium">{lateProjects}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Projetos concluídos</span><span className="font-medium">{completedProjects}</span></div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon: Icon, label, value, accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  accent?: "primary" | "destructive";
}) {
  const accentBg =
    accent === "primary" ? "bg-primary/10 text-primary"
    : accent === "destructive" ? "bg-destructive/10 text-destructive"
    : "bg-accent text-accent-foreground";
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-3xl font-display font-semibold mt-1">{value}</div>
        </div>
        <div className={`grid place-items-center h-11 w-11 rounded-lg ${accentBg}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
