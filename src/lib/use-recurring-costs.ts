import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

/**
 * Fase 2A — garante que as despesas fixas do mês estejam lançadas.
 * Chama a geração no banco (idempotente) no máximo uma vez por dia por aba,
 * para quem pode ver o financeiro. Complementa o agendamento diário (pg_cron),
 * que pode não existir em todos os ambientes.
 */
export function useRecurringCostsSync() {
  const { user, hasPermission, loading } = useAuth();
  const qc = useQueryClient();
  const canView = hasPermission("financial.view");

  useEffect(() => {
    if (loading || !user || !canView) return;
    const key = `iga:recurring-costs:${user.id}:${new Date().toISOString().slice(0, 10)}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* sessionStorage indisponível: segue e gera mesmo assim (é idempotente) */
    }
    void generateRecurringCosts().then((n) => {
      if (n > 0) void qc.invalidateQueries();
    });
  }, [loading, user, canView, qc]);
}

/** Gera os lançamentos devidos; retorna quantos foram criados (0 em caso de erro). */
export async function generateRecurringCosts(): Promise<number> {
  const [costs, revenues] = await Promise.all([
    supabase.rpc("finance_generate_recurring_costs"),
    // Fase 2C: parcelas de receitas (implantação e mensalidades) devidas até hoje
    supabase.rpc("project_revenue_generate_installments"),
  ]);
  const n = (r: { data: unknown; error: unknown }) =>
    !r.error && typeof r.data === "number" ? r.data : 0;
  return n(costs) + n(revenues);
}
