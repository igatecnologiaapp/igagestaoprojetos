export type CostType = "recurring" | "one_off";
export type CostStatus = "forecast" | "open" | "paid" | "cancelled";

export const costTypeLabels: Record<CostType, string> = {
  recurring: "Recorrente",
  one_off: "Eventual",
};

export const costStatusLabels: Record<CostStatus, string> = {
  forecast: "Previsto",
  open: "Em aberto",
  paid: "Pago",
  cancelled: "Cancelado",
};

export interface CostAllocationRow {
  id: string;
  project_id: string;
  percentage: number;
  amount: number;
  projects?: { name: string } | null;
}

export interface CostRow {
  id: string;
  description: string;
  service_id: string | null;
  vendor_id: string | null;
  category_id: string | null;
  cost_type: CostType;
  competence: string;
  due_date: string | null;
  paid_at: string | null;
  amount: number;
  currency: string;
  amount_brl: number | null;
  status: CostStatus;
  is_shared: boolean;
  notes: string | null;
  finance_cost_allocations?: CostAllocationRow[];
}

export function money(v: number | null | undefined, currency = "BRL") {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(v);
}
