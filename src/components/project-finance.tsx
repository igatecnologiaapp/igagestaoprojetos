import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, Plus, XCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { generateRecurringCosts } from "@/lib/use-recurring-costs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Fase 2C — Financeiro da pasta do projeto: receitas (implantação e recorrente;
 * contratado, faturado e recebido), custo rateado e resultado bruto em
 * Superávit / Déficit. Só aparece para quem tem financial.view; editar exige financial.edit.
 */
const money = (v: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));
const dateBr = (d: string | null) =>
  d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const today = () => new Date().toISOString().slice(0, 10);

const LABELS: Record<string, { text: string; box: string; pill: string }> = {
  surplus: {
    text: "Superávit",
    box: "border-success/40 bg-success/10",
    pill: "bg-success text-success-foreground",
  },
  deficit: {
    text: "Déficit",
    box: "border-destructive/40 bg-destructive/10",
    pill: "bg-destructive text-destructive-foreground",
  },
  balanced: {
    text: "Equilíbrio",
    box: "border-border bg-muted",
    pill: "bg-secondary text-secondary-foreground",
  },
  none: {
    text: "Sem movimento",
    box: "border-border bg-muted",
    pill: "bg-secondary text-secondary-foreground",
  },
};

type Base = "received" | "contracted";

export function ProjectFinance({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { hasPermission, user } = useAuth();
  const canEdit = hasPermission("financial.edit");
  const [base, setBase] = useState<Base>("received");
  const [newOpen, setNewOpen] = useState(false);
  const [receiveFor, setReceiveFor] = useState<{ id: string; amount: number } | null>(null);
  const [receivedAt, setReceivedAt] = useState(today());
  const [receivedAmount, setReceivedAmount] = useState("");
  const emptyForm = {
    kind: "implementation",
    description: "",
    amount: "",
    installments: "1",
    start_date: today(),
    end_date: "",
    billing_day: "",
  };
  const [form, setForm] = useState(emptyForm);

  const key = ["project-finance", projectId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      await generateRecurringCosts();
      const [result, revenues, allocations] = await Promise.all([
        supabase
          .from("v_project_financial_result")
          .select("*")
          .eq("project_id", projectId)
          .maybeSingle(),
        supabase
          .from("project_revenues")
          .select(
            "id,kind,description,amount,installments,start_date,end_date,status,project_revenue_installments(id,number,due_date,amount,invoiced_at,invoice_ref,received_at,received_amount)",
          )
          .eq("project_id", projectId)
          .order("start_date"),
        supabase
          .from("finance_cost_allocations")
          .select(
            "id,amount,percentage,finance_costs(id,description,competence,status,cost_type,auto_generated)",
          )
          .eq("project_id", projectId),
      ]);
      return {
        result: result.data,
        revenues: revenues.data ?? [],
        allocations: allocations.data ?? [],
      };
    },
  });

  const refresh = () => void qc.invalidateQueries({ queryKey: key });

  const createRevenue = useMutation({
    mutationFn: async () => {
      const amount = Number(form.amount.replace(/\./g, "").replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0)
        throw new Error("Informe um valor maior que zero.");
      const { error } = await supabase.from("project_revenues").insert({
        project_id: projectId,
        kind: form.kind,
        description:
          form.description.trim() ||
          (form.kind === "implementation" ? "Implantação" : "Mensalidade"),
        amount,
        installments:
          form.kind === "implementation" ? Math.max(1, Number(form.installments) || 1) : 1,
        start_date: form.start_date,
        end_date: form.kind === "recurring" && form.end_date ? form.end_date : null,
        billing_day: form.billing_day ? Number(form.billing_day) : null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
      await supabase.rpc("project_revenue_generate_installments");
    },
    onSuccess: () => {
      toast.success("Receita registrada.");
      setNewOpen(false);
      setForm(emptyForm);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateInstallment = useMutation({
    mutationFn: async (v: {
      id: string;
      patch: {
        invoiced_at?: string;
        invoice_ref?: string | null;
        received_at?: string;
        received_amount?: number;
      };
    }) => {
      const { error } = await supabase
        .from("project_revenue_installments")
        .update(v.patch)
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      setReceiveFor(null);
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelRevenue = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("project_revenues")
        .update({ status: "cancelled", cancelled_at: today() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Contrato encerrado. Parcelas futuras não faturadas foram removidas.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const r = data?.result;
  const label =
    LABELS[(base === "received" ? r?.label_received : r?.label_contracted) ?? "none"] ??
    LABELS.none;
  const result = Number((base === "received" ? r?.result_received : r?.result_contracted) ?? 0);
  const revenueBase = Number(
    (base === "received" ? r?.revenue_received : r?.revenue_contracted) ?? 0,
  );
  const margin = revenueBase > 0 ? Math.round((result / revenueBase) * 100) : null;

  const costs = useMemo(
    () =>
      (data?.allocations ?? [])
        .filter((a) => a.finance_costs && a.finance_costs.status !== "cancelled")
        .sort((a, b) =>
          String(b.finance_costs?.competence).localeCompare(String(a.finance_costs?.competence)),
        ),
    [data],
  );

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando financeiro…</p>;

  return (
    <div className="space-y-4">
      <Card className={`p-5 border ${label.box} flex flex-wrap items-center justify-between gap-4`}>
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">Resultado bruto acumulado</span>
            <div
              role="group"
              aria-label="Base do resultado"
              className="inline-flex rounded-md border bg-card p-0.5"
            >
              {(["received", "contracted"] as Base[]).map((b) => (
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
          <p className="font-display text-3xl font-semibold">{money(result)}</p>
          <p className="text-sm text-muted-foreground">
            {revenueBase > 0
              ? `${base === "received" ? "Recebido" : "Contratado"} ${money(revenueBase)} − custo ${money(r?.cost_total)}${margin !== null ? ` · margem ${margin}%` : ""}`
              : `Sem receita ${base === "received" ? "recebida" : "contratada"}: custo de ${money(r?.cost_total)}`}
          </p>
        </div>
        <span
          className={`rounded-full px-4 py-1.5 font-display text-lg font-semibold ${label.pill}`}
        >
          {label.text}
        </span>
      </Card>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {[
          { l: "Contratado", v: r?.revenue_contracted, n: "parcelas geradas até hoje" },
          { l: "Faturado", v: r?.revenue_invoiced, n: "notas emitidas" },
          { l: "Recebido", v: r?.revenue_received, n: "valores que entraram" },
          { l: "Custo do projeto", v: r?.cost_total, n: `pago ${money(r?.cost_paid)}` },
        ].map((c) => (
          <Card key={c.l} className="p-4 space-y-1">
            <p className="text-xs text-muted-foreground">{c.l}</p>
            <p className="font-display text-xl font-semibold">{money(c.v)}</p>
            <p className="text-xs text-muted-foreground">{c.n}</p>
          </Card>
        ))}
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-display text-lg font-semibold">Receitas da venda</h3>
          {canEdit && (
            <Button size="sm" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> Nova receita
            </Button>
          )}
        </div>
        {(data?.revenues ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma receita registrada. Projeto sem venda negociada: todo o custo aparece como
            Déficit.
          </p>
        ) : (
          (data?.revenues ?? []).map((rev) => (
            <div key={rev.id} className="rounded-md border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{rev.description}</span>
                  <Badge variant="outline">
                    {rev.kind === "implementation" ? "Implantação" : "Recorrente"}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {rev.kind === "implementation"
                      ? `${money(rev.amount)} em ${rev.installments}x`
                      : `${money(rev.amount)}/mês desde ${dateBr(rev.start_date)}${rev.end_date ? ` até ${dateBr(rev.end_date)}` : ""}`}
                  </span>
                  {rev.status === "cancelled" && <Badge variant="secondary">Encerrado</Badge>}
                </div>
                {canEdit && rev.status === "active" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (
                        confirm(
                          "Encerrar este contrato? As parcelas futuras ainda não faturadas serão removidas.",
                        )
                      )
                        cancelRevenue.mutate(rev.id);
                    }}
                  >
                    <XCircle className="h-4 w-4" /> Encerrar
                  </Button>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-1.5 pr-2 font-medium">Parcela</th>
                      <th className="py-1.5 pr-2 font-medium">Vencimento</th>
                      <th className="py-1.5 pr-2 font-medium text-right">Contratado</th>
                      <th className="py-1.5 pr-2 font-medium">Faturado</th>
                      <th className="py-1.5 pr-2 font-medium">Recebido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...(rev.project_revenue_installments ?? [])]
                      .sort((a, b) => a.number - b.number)
                      .map((p) => (
                        <tr key={p.id} className="border-t">
                          <td className="py-1.5 pr-2">{p.number}</td>
                          <td className="py-1.5 pr-2">{dateBr(p.due_date)}</td>
                          <td className="py-1.5 pr-2 text-right">{money(p.amount)}</td>
                          <td className="py-1.5 pr-2">
                            {p.invoiced_at ? (
                              <span className="inline-flex items-center gap-1">
                                <FileText className="h-3.5 w-3.5 text-primary" />{" "}
                                {dateBr(p.invoiced_at)}
                                {p.invoice_ref ? ` · ${p.invoice_ref}` : ""}
                              </span>
                            ) : canEdit ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                onClick={() => {
                                  const ref = prompt("Número da nota fiscal (opcional):") ?? "";
                                  updateInstallment.mutate({
                                    id: p.id,
                                    patch: {
                                      invoiced_at: today(),
                                      invoice_ref: ref.trim() || null,
                                    },
                                  });
                                }}
                              >
                                Marcar faturado
                              </Button>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-1.5 pr-2">
                            {p.received_at ? (
                              <span className="inline-flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5 text-success" />{" "}
                                {money(p.received_amount)} em {dateBr(p.received_at)}
                              </span>
                            ) : canEdit ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                onClick={() => {
                                  setReceiveFor({ id: p.id, amount: Number(p.amount) });
                                  setReceivedAt(today());
                                  setReceivedAmount(String(p.amount).replace(".", ","));
                                }}
                              >
                                Registrar recebimento
                              </Button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </Card>

      <Card className="p-4 space-y-2">
        <h3 className="font-display text-lg font-semibold">Custos do projeto</h3>
        {costs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum custo rateado para este projeto.</p>
        ) : (
          <ul className="divide-y text-sm">
            {costs.map((a) => (
              <li key={a.id} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium truncate">{a.finance_costs?.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {dateBr(a.finance_costs?.competence ?? null)} ·{" "}
                    {Number(a.percentage).toLocaleString("pt-BR")}% do custo
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {a.finance_costs?.cost_type === "recurring" ? "Fixo" : "Variável"}
                  </Badge>
                  <Badge variant={a.finance_costs?.status === "paid" ? "secondary" : "outline"}>
                    {a.finance_costs?.status === "paid"
                      ? "Pago"
                      : a.finance_costs?.status === "forecast"
                        ? "Previsto"
                        : "Em aberto"}
                  </Badge>
                  <span className="w-28 text-right">{money(a.amount)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova receita</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="rev-kind">Tipo</Label>
              <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                <SelectTrigger id="rev-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="implementation">Implantação (valor da venda)</SelectItem>
                  <SelectItem value="recurring">Recorrente (mensalidade)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="rev-desc">Descrição</Label>
              <Input
                id="rev-desc"
                value={form.description}
                placeholder={
                  form.kind === "implementation" ? "Implantação" : "Mensalidade de suporte"
                }
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="rev-amount">
                  {form.kind === "implementation" ? "Valor total (R$)" : "Valor mensal (R$)"}
                </Label>
                <Input
                  id="rev-amount"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              {form.kind === "implementation" ? (
                <div className="space-y-1">
                  <Label htmlFor="rev-inst">Parcelas</Label>
                  <Input
                    id="rev-inst"
                    type="number"
                    min={1}
                    max={120}
                    value={form.installments}
                    onChange={(e) => setForm({ ...form, installments: e.target.value })}
                  />
                </div>
              ) : (
                <div className="space-y-1">
                  <Label htmlFor="rev-end">Até (opcional)</Label>
                  <Input
                    id="rev-end"
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="rev-start">
                  {form.kind === "implementation" ? "1º vencimento" : "Início"}
                </Label>
                <Input
                  id="rev-start"
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="rev-day">Dia de vencimento</Label>
                <Input
                  id="rev-day"
                  type="number"
                  min={1}
                  max={31}
                  placeholder="igual ao início"
                  value={form.billing_day}
                  onChange={(e) => setForm({ ...form, billing_day: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {form.kind === "implementation"
                ? "As parcelas são mensais a partir do 1º vencimento; a última leva os centavos do arredondamento."
                : "Uma parcela é criada automaticamente a cada mês, até a data final (se houver) ou o encerramento."}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createRevenue.mutate()}
              disabled={!form.amount || !form.start_date || createRevenue.isPending}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!receiveFor}
        onOpenChange={(v) => {
          if (!v) setReceiveFor(null);
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar recebimento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="recv-date">Data do recebimento</Label>
              <Input
                id="recv-date"
                type="date"
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="recv-amount">Valor recebido (R$)</Label>
              <Input
                id="recv-amount"
                inputMode="decimal"
                value={receivedAmount}
                onChange={(e) => setReceivedAmount(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReceiveFor(null)}>
              Cancelar
            </Button>
            <Button
              disabled={!receivedAt || !receivedAmount || updateInstallment.isPending}
              onClick={() => {
                const v = Number(receivedAmount.replace(/\./g, "").replace(",", "."));
                if (!receiveFor || !Number.isFinite(v) || v < 0)
                  return toast.error("Informe um valor válido.");
                updateInstallment.mutate({
                  id: receiveFor.id,
                  patch: { received_at: receivedAt, received_amount: v },
                });
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
