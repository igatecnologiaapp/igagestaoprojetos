export interface BudgetRow {
  id: string;
  project_id: string;
  category_id: string | null;
  period_start: string;
  period_end: string;
  amount: number;
  notes: string | null;
  projects?: { name: string } | null;
  finance_categories?: { name: string } | null;
}

export interface RealizedAllocation {
  amount: number;
  project_id: string;
  finance_costs?: {
    status: string;
    competence: string;
    category_id: string | null;
  } | null;
}

export const NO_CATEGORY = "__none__";

/** Soma de custos alocados (exclui cancelados) dentro do período e escopo informados. */
export function realizedFor(
  allocations: RealizedAllocation[],
  opts: { projectId: string; categoryId?: string | null; periodStart: string; periodEnd: string },
) {
  let total = 0;
  let paid = 0;
  let open = 0;
  for (const a of allocations) {
    const c = a.finance_costs;
    if (!c || c.status === "cancelled") continue;
    if (a.project_id !== opts.projectId) continue;
    if (c.competence < opts.periodStart || c.competence > opts.periodEnd) continue;
    if (opts.categoryId !== undefined && opts.categoryId !== null && c.category_id !== opts.categoryId) continue;
    const v = Number(a.amount ?? 0);
    total += v;
    if (c.status === "paid") paid += v;
    else open += v;
  }
  return { total, paid, open };
}

export type ConsumptionLevel = "normal" | "attention" | "exceeded" | "unknown";

export function consumption(budget: number, realized: number): { pct: number | null; level: ConsumptionLevel } {
  if (!(budget > 0)) return { pct: null, level: "unknown" };
  const pct = (realized / budget) * 100;
  return { pct, level: pct > 100 ? "exceeded" : pct >= 80 ? "attention" : "normal" };
}

export const levelLabels: Record<ConsumptionLevel, string> = {
  normal: "Dentro do previsto",
  attention: "Atenção",
  exceeded: "Excedido",
  unknown: "Sem orçamento",
};

export const levelVariant: Record<ConsumptionLevel, "default" | "secondary" | "destructive" | "outline"> = {
  normal: "secondary",
  attention: "default",
  exceeded: "destructive",
  unknown: "outline",
};

/** Início/fim do mês corrente (YYYY-MM-DD). */
export function currentMonthRange() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function rangeFromPreset(preset: "month" | "quarter" | "year", ref = new Date()) {
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  if (preset === "month") return currentMonthRange();
  if (preset === "quarter") {
    const qStart = Math.floor(m / 3) * 3;
    return {
      start: new Date(Date.UTC(y, qStart, 1)).toISOString().slice(0, 10),
      end: new Date(Date.UTC(y, qStart + 3, 0)).toISOString().slice(0, 10),
    };
  }
  return {
    start: new Date(Date.UTC(y, 0, 1)).toISOString().slice(0, 10),
    end: new Date(Date.UTC(y, 12, 0)).toISOString().slice(0, 10),
  };
}
