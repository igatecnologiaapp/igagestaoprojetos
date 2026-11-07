import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  BellRing,
  CalendarClock,
  FolderKanban,
  ListChecks,
  PiggyBank,
  Scale,
} from "lucide-react";
import { RequireAuth } from "@/components/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { generateRecurringCosts } from "@/lib/use-recurring-costs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/painel")({
  component: () => (
    <RequireAuth>
      <DashboardPage />
    </RequireAuth>
  ),
  head: () => ({
    meta: [
      { title: "Painel do Gestor — IGA Tecnologia" },
      {
        name: "description",
        content:
          "Alertas, prazos, resultado dos projetos e custos da IGA Tecnologia em uma única tela.",
      },
      { property: "og:title", content: "Painel do Gestor — IGA Tecnologia" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

/* ---------- utilidades ---------- */
const money = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));
const iso = (d: Date) => d.toISOString().slice(0, 10);
const dateBr = (d: string | null | undefined) =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const daysFrom = (todayIso: string, d: string) =>
  Math.round(
    (new Date(d + "T12:00:00").getTime() - new Date(todayIso + "T12:00:00").getTime()) / 86400000,
  );
const whenLabel = (n: number) =>
  n < 0
    ? `venceu há ${-n} dia${n === -1 ? "" : "s"}`
    : n === 0
      ? "vence hoje"
      : n === 1
        ? "vence amanhã"
        : `em ${n} dias`;

const RESULT: Record<string, { text: string; cls: string }> = {
  surplus: { text: "Superávit", cls: "bg-success/15 text-success border-success/30" },
  deficit: { text: "Déficit", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  balanced: { text: "Equilíbrio", cls: "bg-muted text-muted-foreground" },
  none: { text: "Sem movimento", cls: "bg-muted text-muted-foreground" },
};
const PROJECT_STATUS: Record<string, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  paused: "Pausado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

type Alert = {
  key: string;
  kind: "pagar" | "receber" | "renovacao" | "projeto" | "tarefa";
  title: string;
  detail: string;
  date: string;
  days: number;
  amount?: number;
  link: React.ReactNode;
};

function DashboardPage() {
  const { hasPermission } = useAuth();
  const canFinance = hasPermission("financial.view");
  const [base, setBase] = useState<"received" | "contracted">("received");

  const now = new Date();
  const today = iso(now);
  const in7 = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7));
  const monthStart = iso(new Date(now.getFullYear(), now.getMonth(), 1));
  const monthEnd = iso(new Date(now.getFullYear(), now.getMonth() + 1, 0));
  const prevMonthStart = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const monthName = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const { data, isLoading } = useQuery({
    queryKey: ["painel", canFinance, today],
    queryFn: async () => {
      const [projects, tasks] = await Promise.all([
        supabase.from("projects").select("id,name,status,end_date"),
        supabase.from("tasks").select("id,name,status,due_date,project_id"),
      ]);
      const base = { projects: projects.data ?? [], tasks: tasks.data ?? [] };
      if (!canFinance) return { ...base, fin: null };

      await generateRecurringCosts();
      const [costsDue, costsMonth, instDue, instMonth, renewals, results, unallocated] =
        await Promise.all([
          supabase
            .from("finance_costs")
            .select("id,description,due_date,amount,amount_brl,status")
            .in("status", ["forecast", "open"])
            .not("due_date", "is", null)
            .lte("due_date", in7)
            .order("due_date"),
          supabase
            .from("finance_costs")
            .select("amount,amount_brl,status")
            .neq("status", "cancelled")
            .gte("competence", monthStart)
            .lte("competence", monthEnd),
          supabase
            .from("project_revenue_installments")
            .select("id,project_id,number,due_date,amount")
            .is("received_at", null)
            .lte("due_date", in7)
            .order("due_date"),
          supabase
            .from("project_revenue_installments")
            .select("amount,received_amount,received_at")
            .gte("due_date", monthStart)
            .lte("due_date", monthEnd),
          supabase
            .from("finance_services")
            .select("id,name,renews_at,amount")
            .eq("status", "active")
            .gte("renews_at", today)
            .lte("renews_at", in7),
          supabase.from("v_project_financial_result").select("*"),
          supabase
            .from("v_finance_unallocated_costs")
            .select("*")
            .gte("period", prevMonthStart)
            .order("unallocated", { ascending: false }),
        ]);
      return {
        ...base,
        fin: {
          costsDue: costsDue.data ?? [],
          costsMonth: costsMonth.data ?? [],
          instDue: instDue.data ?? [],
          instMonth: instMonth.data ?? [],
          renewals: renewals.data ?? [],
          results: results.data ?? [],
          unallocated: unallocated.data ?? [],
        },
      };
    },
  });

  const projectName = useMemo(
    () => new Map((data?.projects ?? []).map((p) => [p.id, p.name])),
    [data],
  );

  /* ---------- alertas: vencidos e próximos 7 dias ---------- */
  const alerts = useMemo<Alert[]>(() => {
    if (!data) return [];
    const list: Alert[] = [];
    const open = (s: string) => s !== "completed" && s !== "cancelled";
    for (const p of data.projects)
      if (p.end_date && p.end_date <= in7 && open(p.status))
        list.push({
          key: "p" + p.id,
          kind: "projeto",
          title: p.name,
          detail: "Prazo final do projeto",
          date: p.end_date,
          days: daysFrom(today, p.end_date),
          link: (
            <Link
              to="/projetos/$projectId"
              params={{ projectId: p.id }}
              className="hover:underline"
            >
              {p.name}
            </Link>
          ),
        });
    for (const t of data.tasks)
      if (t.due_date && t.due_date <= in7 && t.status !== "completed")
        list.push({
          key: "t" + t.id,
          kind: "tarefa",
          title: t.name,
          detail: projectName.get(t.project_id) ?? "Tarefa",
          date: t.due_date,
          days: daysFrom(today, t.due_date),
          link: (
            <Link to="/tarefas" className="hover:underline">
              {t.name}
            </Link>
          ),
        });
    if (data.fin) {
      for (const c of data.fin.costsDue)
        list.push({
          key: "c" + c.id,
          kind: "pagar",
          title: c.description,
          detail: c.status === "forecast" ? "Despesa prevista" : "Despesa em aberto",
          date: c.due_date as string,
          days: daysFrom(today, c.due_date as string),
          amount: Number(c.amount_brl ?? c.amount),
          link: (
            <Link to="/financeiro/custos" className="hover:underline">
              {c.description}
            </Link>
          ),
        });
      for (const i of data.fin.instDue)
        list.push({
          key: "i" + i.id,
          kind: "receber",
          title: projectName.get(i.project_id) ?? "Projeto",
          detail: `Parcela ${i.number} a receber`,
          date: i.due_date,
          days: daysFrom(today, i.due_date),
          amount: Number(i.amount),
          link: (
            <Link
              to="/projetos/$projectId"
              params={{ projectId: i.project_id }}
              search={{ secao: "financeiro" }}
              className="hover:underline"
            >
              {projectName.get(i.project_id) ?? "Projeto"}
            </Link>
          ),
        });
      for (const s of data.fin.renewals)
        list.push({
          key: "s" + s.id,
          kind: "renovacao",
          title: s.name,
          detail: "Renovação de assinatura",
          date: s.renews_at as string,
          days: daysFrom(today, s.renews_at as string),
          amount: Number(s.amount),
          link: (
            <Link to="/financeiro/assinaturas" className="hover:underline">
              {s.name}
            </Link>
          ),
        });
    }
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [data, in7, today, projectName]);

  const overdue = alerts.filter((a) => a.days < 0);
  const upcoming = alerts.filter((a) => a.days >= 0);

  /* ---------- números do mês ---------- */
  const fin = data?.fin;
  const toPay = (fin?.costsMonth ?? []).reduce((s, c) => s + Number(c.amount_brl ?? c.amount), 0);
  const paid = (fin?.costsMonth ?? [])
    .filter((c) => c.status === "paid")
    .reduce((s, c) => s + Number(c.amount_brl ?? c.amount), 0);
  const toReceive = (fin?.instMonth ?? []).reduce((s, i) => s + Number(i.amount), 0);
  const received = (fin?.instMonth ?? [])
    .filter((i) => i.received_at)
    .reduce((s, i) => s + Number(i.received_amount ?? 0), 0);
  const idleTotal = (fin?.unallocated ?? [])
    .filter((u) => (u.period ?? "") >= monthStart)
    .reduce((s, u) => s + Number(u.unallocated), 0);
  const idlePrev = (fin?.unallocated ?? [])
    .filter((u) => (u.period ?? "") < monthStart)
    .reduce((s, u) => s + Number(u.unallocated), 0);

  const results = useMemo(() => {
    const st = new Map((data?.projects ?? []).map((p) => [p.id, p]));
    return (fin?.results ?? [])
      .filter((r): r is typeof r & { project_id: string } => !!r.project_id)
      .map((r) => ({
        ...r,
        status: st.get(r.project_id)?.status ?? "",
        end_date: st.get(r.project_id)?.end_date ?? null,
        value: Number(base === "received" ? r.result_received : r.result_contracted),
        revenue: Number(base === "received" ? r.revenue_received : r.revenue_contracted),
        label: (base === "received" ? r.label_received : r.label_contracted) ?? "none",
      }))
      .filter((r) => r.label !== "none" || ["planning", "in_progress", "paused"].includes(r.status))
      .sort((a, b) => a.value - b.value);
  }, [fin, data, base]);
  const totalResult = results.reduce((s, r) => s + r.value, 0);
  const deficits = results.filter((r) => r.label === "deficit").length;
  const surpluses = results.filter((r) => r.label === "surplus").length;

  /* ---------- operação ---------- */
  const tasks = data?.tasks ?? [];
  const projects = data?.projects ?? [];
  const activeProjects = projects.filter((p) => p.status === "in_progress").length;
  const lateProjects = projects.filter(
    (p) => p.end_date && p.end_date < today && !["completed", "cancelled"].includes(p.status),
  ).length;
  const overdueTasks = tasks.filter(
    (t) => t.due_date && t.due_date < today && t.status !== "completed",
  ).length;
  const completedTasks = tasks.filter((t) => t.status === "completed").length;
  const completionRate = tasks.length ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const statusGroups = [
    { key: "pending", label: "Pendente" },
    { key: "started", label: "Iniciada" },
    { key: "in_progress", label: "Em andamento" },
    { key: "paused", label: "Pausada" },
    { key: "completed", label: "Concluída" },
  ] as const;

  if (isLoading) return <div className="text-sm text-muted-foreground">Carregando painel…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-semibold">Painel do Gestor</h1>
        <p className="text-muted-foreground mt-1">
          O que precisa de atenção agora
          {canFinance ? ` e como está o financeiro de ${monthName}` : ""}.
        </p>
      </div>

      {/* 1. Atenção agora */}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" /> Atenção agora
          </h2>
          <span className="text-sm text-muted-foreground">Vencidos e próximos 7 dias</span>
        </div>
        {alerts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nada vencido nem vencendo nos próximos 7 dias. Tudo em dia.
          </p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            <AlertList
              title={`Vencidos (${overdue.length})`}
              items={overdue}
              tone="destructive"
              empty="Nenhum item vencido."
            />
            <AlertList
              title={`Próximos 7 dias (${upcoming.length})`}
              items={upcoming}
              tone="primary"
              empty="Nada vence nos próximos 7 dias."
            />
          </div>
        )}
      </Card>

      {/* 2. Financeiro do mês */}
      {canFinance && fin && (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <KpiCard
              icon={ArrowDownCircle}
              label={`A receber em ${now.toLocaleDateString("pt-BR", { month: "long" })}`}
              value={money(toReceive)}
              note={`recebido ${money(received)}`}
              accent="success"
            />
            <KpiCard
              icon={ArrowUpCircle}
              label={`A pagar em ${now.toLocaleDateString("pt-BR", { month: "long" })}`}
              value={money(toPay)}
              note={`pago ${money(paid)}`}
              accent="destructive"
            />
            <KpiCard
              icon={Scale}
              label="Saldo previsto do mês"
              value={money(toReceive - toPay)}
              note={`realizado ${money(received - paid)}`}
              accent={toReceive - toPay >= 0 ? "success" : "destructive"}
            />
            <KpiCard
              icon={PiggyBank}
              label="Custo ocioso / sem projeto"
              value={money(idleTotal)}
              note={idlePrev > 0 ? `mês anterior ${money(idlePrev)}` : "parte não rateada"}
              accent={idleTotal > 0 ? "warning" : undefined}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {/* 3. Resultado por projeto */}
            <Card className="p-5 space-y-3 lg:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold">Resultado por projeto</h2>
                <div
                  role="group"
                  aria-label="Base do resultado"
                  className="inline-flex rounded-md border bg-card p-0.5"
                >
                  {(["received", "contracted"] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      aria-pressed={base === b}
                      onClick={() => setBase(b)}
                      className={`min-h-8 rounded px-2.5 text-xs ${base === b ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
                    >
                      {b === "received" ? "Sobre o recebido" : "Sobre o contratado"}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Soma {money(totalResult)} · {surpluses} em Superávit · {deficits} em Déficit. Os que
                precisam de atenção aparecem primeiro.
              </p>
              {results.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum projeto com receita ou custo registrado.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground">
                        <th className="py-2 pr-2 font-medium">Projeto</th>
                        <th className="py-2 pr-2 font-medium">Situação</th>
                        <th className="py-2 pr-2 font-medium text-right">Receita</th>
                        <th className="py-2 pr-2 font-medium text-right">Custo</th>
                        <th className="py-2 pr-2 font-medium text-right">Resultado</th>
                        <th className="py-2 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((r) => {
                        const lab = RESULT[r.label] ?? RESULT.none;
                        const margin =
                          r.revenue > 0 ? Math.round((r.value / r.revenue) * 100) : null;
                        return (
                          <tr key={r.project_id} className="border-t">
                            <td className="py-2 pr-2">
                              <Link
                                to="/projetos/$projectId"
                                params={{ projectId: r.project_id }}
                                search={{ secao: "financeiro" }}
                                className="font-medium hover:underline"
                              >
                                {r.project_name}
                              </Link>
                            </td>
                            <td className="py-2 pr-2 text-muted-foreground">
                              {PROJECT_STATUS[r.status] ?? "—"}
                            </td>
                            <td className="py-2 pr-2 text-right">{money(r.revenue)}</td>
                            <td className="py-2 pr-2 text-right">{money(r.cost_total)}</td>
                            <td className="py-2 pr-2 text-right font-medium">
                              {money(r.value)}
                              {margin !== null && (
                                <span className="ml-1 text-xs text-muted-foreground">
                                  ({margin}%)
                                </span>
                              )}
                            </td>
                            <td className="py-2">
                              <Badge variant="outline" className={lab.cls}>
                                {lab.text}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* 4. Custo ocioso / sem projeto */}
            <Card className="p-5 space-y-3">
              <h2 className="font-display text-lg font-semibold">Custo sem projeto</h2>
              <p className="text-sm text-muted-foreground">
                Parte das despesas que não foi atribuída a nenhum projeto: créditos não usados,
                assinaturas gerais ou rateio pendente.
              </p>
              {fin.unallocated.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Todas as despesas recentes estão rateadas.
                </p>
              ) : (
                <ul className="divide-y text-sm">
                  {fin.unallocated.slice(0, 6).map((u) => (
                    <li
                      key={u.cost_id ?? u.description ?? ""}
                      className="py-2 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date((u.period ?? monthStart) + "T12:00:00").toLocaleDateString(
                            "pt-BR",
                            {
                              month: "short",
                              year: "numeric",
                            },
                          )}{" "}
                          · de {money(u.value)}
                        </p>
                      </div>
                      <span className="shrink-0 font-medium">{money(u.unallocated)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex flex-wrap gap-3 text-sm">
                <Link to="/financeiro/consumo" className="text-primary hover:underline">
                  Ratear por consumo
                </Link>
                <Link to="/financeiro/custos" className="text-primary hover:underline">
                  Ver despesas
                </Link>
              </div>
            </Card>
          </div>
        </>
      )}

      {/* 5. Operação */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={FolderKanban}
          label="Projetos em andamento"
          value={activeProjects}
          accent="primary"
        />
        <KpiCard
          icon={CalendarClock}
          label="Projetos com prazo vencido"
          value={lateProjects}
          accent={lateProjects ? "destructive" : undefined}
        />
        <KpiCard
          icon={ListChecks}
          label="Tarefas concluídas"
          value={`${completedTasks}/${tasks.length}`}
          note={`${completionRate}% do total`}
        />
        <KpiCard
          icon={AlertTriangle}
          label="Tarefas atrasadas"
          value={overdueTasks}
          accent={overdueTasks ? "destructive" : undefined}
        />
      </div>

      <Card className="p-5">
        <h2 className="font-display font-semibold text-lg mb-4">Tarefas por status</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {statusGroups.map((g) => {
            const count = tasks.filter((t) => t.status === g.key).length;
            return (
              <div key={g.key}>
                <div className="flex justify-between text-sm mb-1">
                  <span>{g.label}</span>
                  <span className="text-muted-foreground">{count}</span>
                </div>
                <Progress value={tasks.length ? (count / tasks.length) * 100 : 0} />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

const KIND: Record<Alert["kind"], { label: string; cls: string }> = {
  pagar: { label: "A pagar", cls: "bg-destructive/10 text-destructive border-destructive/30" },
  receber: { label: "A receber", cls: "bg-success/15 text-success border-success/30" },
  renovacao: { label: "Renovação", cls: "bg-accent text-accent-foreground" },
  projeto: { label: "Projeto", cls: "bg-primary/10 text-primary border-primary/30" },
  tarefa: { label: "Tarefa", cls: "bg-muted text-muted-foreground" },
};

function AlertList({
  title,
  items,
  tone,
  empty,
}: {
  title: string;
  items: Alert[];
  tone: "destructive" | "primary";
  empty: string;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, 8);
  return (
    <div className="space-y-2">
      <h3
        className={`text-sm font-semibold ${tone === "destructive" ? "text-destructive" : "text-primary"}`}
      >
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="divide-y rounded-md border text-sm">
          {shown.map((a) => (
            <li key={a.key} className="flex items-center gap-3 px-3 py-2">
              <Badge
                variant="outline"
                className={`w-24 justify-center shrink-0 ${KIND[a.kind].cls}`}
              >
                {KIND[a.kind].label}
              </Badge>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{a.link}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {a.detail} · {dateBr(a.date)} · {whenLabel(a.days)}
                </p>
              </div>
              {a.amount !== undefined && (
                <span className="shrink-0 font-medium">{money(a.amount)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {items.length > 8 && (
        <button
          type="button"
          onClick={() => setAll(!all)}
          className="text-sm text-primary hover:underline"
        >
          {all ? "Mostrar menos" : `Ver todos (${items.length})`}
        </button>
      )}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  note,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  note?: string;
  accent?: "primary" | "destructive" | "success" | "warning";
}) {
  const accentBg =
    accent === "primary"
      ? "bg-primary/10 text-primary"
      : accent === "destructive"
        ? "bg-destructive/10 text-destructive"
        : accent === "success"
          ? "bg-success/15 text-success"
          : accent === "warning"
            ? "bg-warning/15 text-warning"
            : "bg-accent text-accent-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground first-letter:uppercase">{label}</div>
          <div className="text-2xl font-display font-semibold mt-1">{value}</div>
          {note && <div className="text-xs text-muted-foreground mt-0.5">{note}</div>}
        </div>
        <div className={`grid place-items-center h-10 w-10 shrink-0 rounded-lg ${accentBg}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}
