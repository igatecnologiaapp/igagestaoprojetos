import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { money } from "@/lib/finance-costs";
import {
  consumption,
  currentMonthRange,
  levelLabels,
  levelVariant,
  rangeFromPreset,
  realizedFor,
  type BudgetRow,
  type RealizedAllocation,
} from "@/lib/finance-budgets";

export const Route = createFileRoute("/finance/budgets")({
  component: () => (
    <RequireAuth>
      <BudgetsPage />
    </RequireAuth>
  ),
  head: () => ({
    meta: [
      { title: "Orçamentos e previsto × realizado — IGA Tecnologia" },
      {
        name: "description",
        content: "Orçamento previsto por projeto, categoria e período, comparado aos custos realmente realizados.",
      },
      { property: "og:title", content: "Orçamentos e previsto × realizado — IGA Tecnologia" },
      { property: "og:description", content: "Comparação entre orçamento previsto e custos realizados por projeto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const initialRange = currentMonthRange();

const emptyForm = {
  project_id: "",
  category_id: "none",
  period_start: initialRange.start,
  period_end: initialRange.end,
  amount: "",
  notes: "",
};

const dd = (v: string | null | undefined) => (v ? new Date(v + "T00:00:00").toLocaleDateString("pt-BR") : "—");

function BudgetsPage() {
  const { hasPermission, user } = useAuth();
  const canView = hasPermission("financial.view");
  const canEditFinance = hasPermission("financial.edit");
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [projectFilter, setProjectFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [periodStart, setPeriodStart] = useState(initialRange.start);
  const [periodEnd, setPeriodEnd] = useState(initialRange.end);
  const [comparisonProject, setComparisonProject] = useState("");

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ["finance_budgets"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_budgets")
        .select("*, projects(name), finance_categories(name)")
        .order("period_start", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BudgetRow[];
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["finance_projects_options"],
    queryFn: async () => (await supabase.from("projects").select("id,name").order("name")).data ?? [],
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["finance_categories"],
    queryFn: async () => (await supabase.from("finance_categories").select("id,name").order("position")).data ?? [],
  });

  const { data: allocations = [] } = useQuery({
    queryKey: ["finance_budget_allocations"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_cost_allocations")
        .select("amount,project_id,finance_costs(status,competence,category_id)");
      if (error) throw error;
      return (data ?? []) as unknown as RealizedAllocation[];
    },
  });

  const filtered = useMemo(
    () =>
      budgets.filter((b) => {
        if (projectFilter !== "all" && b.project_id !== projectFilter) return false;
        if (categoryFilter !== "all" && (b.category_id ?? "none") !== categoryFilter) return false;
        if (periodStart && b.period_end < periodStart) return false;
        if (periodEnd && b.period_start > periodEnd) return false;
        return true;
      }),
    [budgets, projectFilter, categoryFilter, periodStart, periodEnd],
  );

  const comparison = useMemo(() => {
    const projectId = comparisonProject || (projectFilter !== "all" ? projectFilter : "");
    if (!projectId) return null;
    const rows = budgets.filter(
      (b) => b.project_id === projectId && b.period_end >= periodStart && b.period_start <= periodEnd,
    );
    const byCategory = new Map<string, { name: string; budget: number; realized: number }>();
    for (const b of rows) {
      const key = b.category_id ?? "none";
      const cur = byCategory.get(key) ?? { name: b.finance_categories?.name ?? "Projeto (sem categoria)", budget: 0, realized: 0 };
      cur.budget += Number(b.amount ?? 0);
      byCategory.set(key, cur);
    }
    for (const [key, value] of byCategory) {
      value.realized = realizedFor(allocations, {
        projectId,
        categoryId: key === "none" ? undefined : key,
        periodStart,
        periodEnd,
      }).total;
    }
    const totalRealized = realizedFor(allocations, { projectId, periodStart, periodEnd });
    const totalBudget = rows.reduce((s, b) => s + Number(b.amount ?? 0), 0);
    return { projectId, rows: [...byCategory.values()], totalBudget, totals: totalRealized };
  }, [budgets, allocations, comparisonProject, projectFilter, periodStart, periodEnd]);

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form.project_id) throw new Error("Selecione o projeto.");
      const amount = Number(form.amount);
      if (form.amount === "" || !(amount >= 0)) throw new Error("Informe um valor previsto igual ou maior que zero.");
      if (form.period_end < form.period_start) throw new Error("O fim do período não pode ser anterior ao início.");
      const payload = {
        project_id: form.project_id,
        category_id: form.category_id === "none" ? null : form.category_id,
        period_start: form.period_start,
        period_end: form.period_end,
        amount,
        notes: form.notes || null,
      };
      if (editingId) {
        const { error } = await supabase.from("finance_budgets").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("finance_budgets").insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Orçamento salvo");
      qc.invalidateQueries({ queryKey: ["finance_budgets"] });
      setOpen(false);
      reset();
    },
    onError: (e: Error) =>
      toast.error(
        e.message.includes("uq_finance_budgets_scope")
          ? "Já existe um orçamento para este projeto, categoria e período."
          : e.message.includes("chk_finance_budgets_period")
            ? "Período inválido: o fim não pode ser anterior ao início."
            : e.message.includes("chk_finance_budgets_amount")
              ? "O valor previsto não pode ser negativo."
              : e.message,
      ),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("finance_budgets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Orçamento removido");
      qc.invalidateQueries({ queryKey: ["finance_budgets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (b: BudgetRow) => {
    setEditingId(b.id);
    setForm({
      project_id: b.project_id,
      category_id: b.category_id ?? "none",
      period_start: b.period_start,
      period_end: b.period_end,
      amount: String(b.amount ?? ""),
      notes: b.notes ?? "",
    });
    setOpen(true);
  };

  const applyPreset = (preset: "month" | "quarter" | "year") => {
    const r = rangeFromPreset(preset);
    setPeriodStart(r.start);
    setPeriodEnd(r.end);
  };

  if (!canView) {
    return <p className="text-sm text-muted-foreground">Você não possui permissão para visualizar dados financeiros.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-semibold">Orçamentos</h1>
          <p className="text-muted-foreground mt-1">
            Orçamento previsto por projeto, categoria e período, comparado aos custos realizados.
          </p>
        </div>
        {canEditFinance && (
          <Button
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4 mr-1" /> Novo orçamento
          </Button>
        )}
      </div>

      <Card className="p-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label htmlFor="fb-proj">Projeto</Label>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger id="fb-proj">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os projetos</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="fb-cat">Categoria</Label>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger id="fb-cat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as categorias</SelectItem>
                <SelectItem value="none">Sem categoria (projeto)</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="fb-ini">Período — início</Label>
            <Input id="fb-ini" type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="fb-fim">Período — fim</Label>
            <Input id="fb-fim" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={() => applyPreset("month")}>
            Mês atual
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset("quarter")}>
            Trimestre
          </Button>
          <Button size="sm" variant="outline" onClick={() => applyPreset("year")}>
            Ano
          </Button>
        </div>
      </Card>

      {/* Lista de orçamentos */}
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum orçamento no período selecionado.</Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((b) => {
            const realized = realizedFor(allocations, {
              projectId: b.project_id,
              categoryId: b.category_id ?? undefined,
              periodStart: b.period_start,
              periodEnd: b.period_end,
            });
            const { pct, level } = consumption(Number(b.amount ?? 0), realized.total);
            return (
              <Card key={b.id} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium break-words">{b.projects?.name ?? "Projeto"}</p>
                    <p className="text-xs text-muted-foreground break-words">
                      {b.finance_categories?.name ?? "Sem categoria (projeto)"} · {dd(b.period_start)} a {dd(b.period_end)}
                    </p>
                  </div>
                  <Badge variant={levelVariant[level]}>{levelLabels[level]}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground text-xs block">Previsto</span>
                    {money(Number(b.amount ?? 0))}
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs block">Realizado</span>
                    {money(realized.total)}
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs block">Saldo orçamentário</span>
                    {money(Number(b.amount ?? 0) - realized.total)}
                  </div>
                  <div>
                    <span className="text-muted-foreground text-xs block">Consumo</span>
                    {pct == null ? "—" : `${pct.toFixed(1)}%`}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Pagos {money(realized.paid)} · em aberto {money(realized.open)}
                </p>
                {b.notes && <p className="text-xs text-muted-foreground break-words">{b.notes}</p>}
                {canEditFinance && (
                  <div className="flex gap-1 justify-end">
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Editar orçamento" onClick={() => openEdit(b)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      aria-label="Excluir orçamento"
                      onClick={() => {
                        if (confirm("Excluir este orçamento?")) deleteMut.mutate(b.id);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Previsto x Realizado */}
      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Previsto × Realizado</h2>
            <p className="text-xs text-muted-foreground">
              Realizado calculado a partir dos custos alocados ao projeto no período (custos cancelados são ignorados).
            </p>
          </div>
          <div className="min-w-56">
            <Label htmlFor="fb-comp">Projeto analisado</Label>
            <Select value={comparisonProject || (projectFilter !== "all" ? projectFilter : "")} onValueChange={setComparisonProject}>
              <SelectTrigger id="fb-comp">
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!comparison ? (
          <p className="text-sm text-muted-foreground">Selecione um projeto para comparar previsto e realizado.</p>
        ) : comparison.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum orçamento cadastrado para este projeto no período. Realizado no período: {money(comparison.totals.total)}.
          </p>
        ) : (
          <div className="space-y-2">
            {comparison.rows.map((r) => {
              const { pct, level } = consumption(r.budget, r.realized);
              return (
                <div key={r.name} className="rounded-md border p-3 text-sm grid gap-1 sm:grid-cols-5 sm:items-center">
                  <div className="font-medium break-words sm:col-span-1">{r.name}</div>
                  <div>
                    <span className="text-xs text-muted-foreground sm:hidden">Previsto: </span>
                    {money(r.budget)}
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground sm:hidden">Realizado: </span>
                    {money(r.realized)}
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground sm:hidden">Diferença: </span>
                    {money(r.budget - r.realized)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{pct == null ? "—" : `${pct.toFixed(1)}%`}</span>
                    <Badge variant={levelVariant[level]}>{levelLabels[level]}</Badge>
                  </div>
                </div>
              );
            })}
            <div className="rounded-md border p-3 text-sm font-medium grid gap-1 sm:grid-cols-5 sm:items-center bg-muted/40">
              <div>Total</div>
              <div>{money(comparison.totalBudget)}</div>
              <div>{money(comparison.totals.total)}</div>
              <div>{money(comparison.totalBudget - comparison.totals.total)}</div>
              <div>
                {consumption(comparison.totalBudget, comparison.totals.total).pct == null
                  ? "—"
                  : `${consumption(comparison.totalBudget, comparison.totals.total).pct!.toFixed(1)}%`}
              </div>
            </div>
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Orçamento não é custo; custo em aberto não é custo pago; resultado bruto gerencial não é lucro líquido contábil.
        </p>
      </Card>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) reset();
        }}
      >
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar orçamento" : "Novo orçamento"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div>
              <Label htmlFor="nb-proj">Projeto *</Label>
              <Select value={form.project_id} onValueChange={(v) => setForm({ ...form, project_id: v })}>
                <SelectTrigger id="nb-proj">
                  <SelectValue placeholder="Selecione o projeto" />
                </SelectTrigger>
                <SelectContent>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="nb-cat">Categoria (opcional)</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger id="nb-cat">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Orçamento do projeto (sem categoria)</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="nb-ini">Início do período *</Label>
                <Input id="nb-ini" type="date" value={form.period_start} onChange={(e) => setForm({ ...form, period_start: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="nb-fim">Fim do período *</Label>
                <Input id="nb-fim" type="date" value={form.period_end} onChange={(e) => setForm({ ...form, period_end: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="nb-valor">Valor previsto (R$) *</Label>
              <Input id="nb-valor" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="nb-notas">Observações</Label>
              <Textarea id="nb-notas" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={!canEditFinance || saveMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
