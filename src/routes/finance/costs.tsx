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
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Split, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  costStatusLabels,
  costTypeLabels,
  money,
  type CostRow,
  type CostStatus,
  type CostType,
} from "@/lib/finance-costs";

export const Route = createFileRoute("/finance/costs")({
  component: () => (
    <RequireAuth>
      <CostsPage />
    </RequireAuth>
  ),
  head: () => ({
    meta: [
      { title: "Custos e rateios entre projetos — IGA Tecnologia" },
      { name: "description", content: "Custos reais registrados, situação de pagamento e rateio entre projetos da IGA Tecnologia." },
      { property: "og:title", content: "Custos e rateios entre projetos — IGA Tecnologia" },
      { property: "og:description", content: "Custos reais registrados e distribuição entre projetos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const emptyForm = {
  description: "",
  vendor_id: "none",
  category_id: "none",
  service_id: "none",
  cost_type: "one_off" as CostType,
  competence: new Date().toISOString().slice(0, 8) + "01",
  due_date: "",
  paid_at: "",
  amount: "",
  currency: "BRL",
  amount_brl: "",
  status: "open" as CostStatus,
  is_shared: false,
  notes: "",
};

function CostsPage() {
  const { hasPermission, user } = useAuth();
  const canView = hasPermission("financial.view");
  const canEditFinance = hasPermission("financial.edit");
  const qc = useQueryClient();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [vendorFilter, setVendorFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [competenceFilter, setCompetenceFilter] = useState("");
  const [allocFor, setAllocFor] = useState<CostRow | null>(null);

  const { data: costs = [], isLoading } = useQuery({
    queryKey: ["finance_costs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("finance_costs")
        .select("*, finance_cost_allocations(id,project_id,percentage,amount,projects(name))")
        .order("competence", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CostRow[];
    },
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["finance_vendors"],
    queryFn: async () => (await supabase.from("finance_vendors").select("id,name").order("name")).data ?? [],
  });
  const { data: categories = [] } = useQuery({
    queryKey: ["finance_categories"],
    queryFn: async () => (await supabase.from("finance_categories").select("id,name").order("position")).data ?? [],
  });
  const { data: services = [] } = useQuery({
    queryKey: ["finance_services_options"],
    queryFn: async () =>
      (await supabase.from("finance_services").select("id,name,amount,currency,vendor_id,category_id,recurrence,default_project_id").order("name")).data ?? [],
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["finance_projects_options"],
    queryFn: async () => (await supabase.from("projects").select("id,name").order("name")).data ?? [],
  });

  const filtered = useMemo(
    () =>
      costs.filter((c) => {
        if (statusFilter !== "all" && c.status !== statusFilter) return false;
        if (vendorFilter !== "all" && c.vendor_id !== vendorFilter) return false;
        if (categoryFilter !== "all" && c.category_id !== categoryFilter) return false;
        if (competenceFilter && !String(c.competence).startsWith(competenceFilter)) return false;
        if (projectFilter !== "all" && !(c.finance_cost_allocations ?? []).some((a) => a.project_id === projectFilter)) return false;
        if (search && !c.description.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [costs, statusFilter, vendorFilter, categoryFilter, competenceFilter, projectFilter, search],
  );

  const totals = useMemo(() => {
    let paid = 0;
    let openTotal = 0;
    for (const c of filtered) {
      const v = Number(c.amount_brl ?? c.amount ?? 0);
      if (c.status === "paid") paid += v;
      else if (c.status === "open" || c.status === "forecast") openTotal += v;
    }
    return { paid, open: openTotal };
  }, [filtered]);

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!form.description.trim()) throw new Error("Informe a descrição do custo.");
      if (form.amount === "" || Number(form.amount) < 0) throw new Error("Informe um valor válido (maior ou igual a zero).");
      const payload = {
        description: form.description.trim(),
        vendor_id: form.vendor_id === "none" ? null : form.vendor_id,
        category_id: form.category_id === "none" ? null : form.category_id,
        service_id: form.service_id === "none" ? null : form.service_id,
        cost_type: form.cost_type,
        competence: form.competence,
        due_date: form.due_date || null,
        paid_at: form.status === "paid" ? form.paid_at || new Date().toISOString().slice(0, 10) : form.paid_at || null,
        amount: Number(form.amount),
        currency: form.currency.toUpperCase(),
        amount_brl: form.amount_brl === "" ? null : Number(form.amount_brl),
        status: form.status,
        is_shared: form.is_shared,
        notes: form.notes || null,
      };
      if (editingId) {
        const { error } = await supabase.from("finance_costs").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("finance_costs").insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Custo salvo");
      qc.invalidateQueries({ queryKey: ["finance_costs"] });
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CostStatus }) => {
      const patch: Record<string, unknown> = { status };
      if (status === "paid") patch['paid_at'] = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("finance_costs").update(patch as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["finance_costs"] });
      toast.success("Situação atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const generateFromService = useMutation({
    mutationFn: async (serviceId: string) => {
      const s = services.find((x) => x.id === serviceId);
      if (!s) throw new Error("Serviço não encontrado.");
      if (s.amount == null) throw new Error("O serviço não possui valor definido.");
      const competence = new Date().toISOString().slice(0, 8) + "01";
      const { data, error } = await supabase
        .from("finance_costs")
        .insert({
          description: s.name,
          service_id: s.id,
          vendor_id: s.vendor_id,
          category_id: s.category_id,
          cost_type: s.recurrence === "one_off" ? "one_off" : "recurring",
          competence,
          amount: Number(s.amount),
          currency: s.currency ?? "BRL",
          status: "open",
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (s.default_project_id && data) {
        await supabase.from("finance_cost_allocations").insert({
          cost_id: data.id,
          project_id: s.default_project_id,
          percentage: 100,
          amount: Number(s.amount),
          created_by: user?.id ?? null,
        });
      }
    },
    onSuccess: () => {
      toast.success("Custo da competência gerado");
      qc.invalidateQueries({ queryKey: ["finance_costs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canView) {
    return <Card className="p-6 text-sm text-muted-foreground">Você não possui permissão para visualizar dados financeiros.</Card>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Custos e rateios</h1>
          <p className="text-sm text-muted-foreground">Custos realmente registrados e sua distribuição entre projetos.</p>
        </div>
        {canEditFinance && (
          <div className="flex gap-2 flex-wrap">
            <Select onValueChange={(v) => generateFromService.mutate(v)}>
              <SelectTrigger className="w-[230px]" aria-label="Gerar custo desta competência">
                <SelectValue placeholder="Gerar custo desta competência" />
              </SelectTrigger>
              <SelectContent>
                {services.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => {
                reset();
                setOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Novo custo
            </Button>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Custos pagos (realizado)</p>
          <p className="text-lg font-semibold mt-1">{money(totals.paid)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Custos em aberto/previstos</p>
          <p className="text-lg font-semibold mt-1">{money(totals.open)}</p>
        </Card>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <Input placeholder="Buscar descrição" aria-label="Buscar custo" value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger aria-label="Filtrar por situação"><SelectValue placeholder="Situação" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as situações</SelectItem>
            {(Object.entries(costStatusLabels) as [CostStatus, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger aria-label="Filtrar por projeto"><SelectValue placeholder="Projeto" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os projetos</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={vendorFilter} onValueChange={setVendorFilter}>
          <SelectTrigger aria-label="Filtrar por fornecedor"><SelectValue placeholder="Fornecedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os fornecedores</SelectItem>
            {vendors.map((v) => (
              <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger aria-label="Filtrar por categoria"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as categorias</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input type="month" aria-label="Filtrar por competência" value={competenceFilter} onChange={(e) => setCompetenceFilter(e.target.value)} />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">Nenhum custo encontrado.</Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((c) => {
            const allocs = c.finance_cost_allocations ?? [];
            const allocPct = allocs.reduce((s, a) => s + Number(a.percentage), 0);
            return (
              <Card key={c.id} className="p-4 flex items-start justify-between flex-wrap gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="font-medium flex items-center gap-2 flex-wrap">
                    {c.description}
                    <Badge variant={c.status === "paid" ? "secondary" : c.status === "cancelled" ? "outline" : "default"}>
                      {costStatusLabels[c.status]}
                    </Badge>
                    <Badge variant="outline">{costTypeLabels[c.cost_type]}</Badge>
                    {c.is_shared && <Badge variant="outline">Compartilhado</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Competência {new Date(c.competence + "T00:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })} ·{" "}
                    {money(Number(c.amount_brl ?? c.amount), c.currency)}
                    {c.paid_at ? ` · pago em ${new Date(c.paid_at + "T00:00:00").toLocaleDateString("pt-BR")}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {allocs.length === 0
                      ? "Sem rateio definido"
                      : allocs.map((a) => `${a.projects?.name ?? "Projeto"} ${Number(a.percentage)}%`).join(" · ")}
                    {allocs.length > 0 && allocPct < 100 ? ` (rateio parcial: ${allocPct}%)` : ""}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => setAllocFor(c)}>
                    <Split className="h-4 w-4" /> Rateio
                  </Button>
                  {canEditFinance && c.status !== "paid" && c.status !== "cancelled" && (
                    <Button size="sm" variant="outline" onClick={() => statusMut.mutate({ id: c.id, status: "paid" })}>
                      Marcar como pago
                    </Button>
                  )}
                  {canEditFinance && c.status !== "cancelled" && (
                    <Button size="sm" variant="ghost" onClick={() => statusMut.mutate({ id: c.id, status: "cancelled" })}>
                      Cancelar
                    </Button>
                  )}
                  {canEditFinance && (
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Editar ${c.description}`}
                      onClick={() => {
                        setEditingId(c.id);
                        setForm({
                          description: c.description,
                          vendor_id: c.vendor_id ?? "none",
                          category_id: c.category_id ?? "none",
                          service_id: c.service_id ?? "none",
                          cost_type: c.cost_type,
                          competence: c.competence,
                          due_date: c.due_date ?? "",
                          paid_at: c.paid_at ?? "",
                          amount: String(c.amount),
                          currency: c.currency,
                          amount_brl: c.amount_brl == null ? "" : String(c.amount_brl),
                          status: c.status,
                          is_shared: c.is_shared,
                          notes: c.notes ?? "",
                        });
                        setOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar" : "Novo"} custo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="cost-descricao">Descrição *</Label>
              <Input id="cost-descricao" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="cost-tipo">Tipo</Label>
                <Select value={form.cost_type} onValueChange={(v) => setForm({ ...form, cost_type: v as CostType })}>
                  <SelectTrigger id="cost-tipo"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(costTypeLabels) as [CostType, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="cost-situacao">Situação</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as CostStatus })}>
                  <SelectTrigger id="cost-situacao"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.entries(costStatusLabels) as [CostStatus, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{v}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="cost-fornecedor">Fornecedor</Label>
                <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                  <SelectTrigger id="cost-fornecedor"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Não definido</SelectItem>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="cost-categoria">Categoria</Label>
                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                  <SelectTrigger id="cost-categoria"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Não definida</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="cost-servico">Serviço de origem</Label>
                <Select value={form.service_id} onValueChange={(v) => setForm({ ...form, service_id: v })}>
                  <SelectTrigger id="cost-servico"><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Sem serviço vinculado</SelectItem>
                    {services.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="cost-competencia">Competência *</Label>
                <Input id="cost-competencia" type="date" value={form.competence} onChange={(e) => setForm({ ...form, competence: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="cost-vencimento">Vencimento</Label>
                <Input id="cost-vencimento" type="date" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="cost-pagamento">Data de pagamento</Label>
                <Input id="cost-pagamento" type="date" value={form.paid_at} onChange={(e) => setForm({ ...form, paid_at: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="cost-valor">Valor *</Label>
                <Input id="cost-valor" type="number" step="0.01" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="cost-moeda">Moeda</Label>
                <Input id="cost-moeda" value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="cost-valor-brl">Valor base em BRL</Label>
                <Input id="cost-valor-brl" type="number" step="0.01" min="0" value={form.amount_brl} onChange={(e) => setForm({ ...form, amount_brl: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="cost-compartilhado" checked={form.is_shared} onCheckedChange={(v) => setForm({ ...form, is_shared: v === true })} />
              <Label htmlFor="cost-compartilhado">Custo compartilhado entre projetos</Label>
            </div>
            <div>
              <Label htmlFor="cost-observacoes">Observações</Label>
              <Textarea id="cost-observacoes" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending || !canEditFinance}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AllocationDialog cost={allocFor} projects={projects} onClose={() => setAllocFor(null)} canEdit={canEditFinance} />
    </div>
  );
}

export function AllocationDialog({
  cost,
  projects,
  onClose,
  canEdit,
}: {
  cost: CostRow | null;
  projects: { id: string; name: string }[];
  onClose: () => void;
  canEdit: boolean;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [projectId, setProjectId] = useState("");
  const [percentage, setPercentage] = useState("100");

  const allocs = cost?.finance_cost_allocations ?? [];
  const used = allocs.reduce((s, a) => s + Number(a.percentage), 0);
  const costAmount = cost ? Number(cost.amount_brl ?? cost.amount) : 0;

  const addMut = useMutation({
    mutationFn: async () => {
      if (!cost) return;
      if (!projectId) throw new Error("Selecione um projeto.");
      const pct = Number(percentage);
      if (!(pct > 0 && pct <= 100)) throw new Error("O percentual deve estar entre 0 e 100.");
      const { error } = await supabase.from("finance_cost_allocations").insert({
        cost_id: cost.id,
        project_id: projectId,
        percentage: pct,
        amount: Number(((costAmount * pct) / 100).toFixed(2)),
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rateio adicionado");
      setProjectId("");
      qc.invalidateQueries({ queryKey: ["finance_costs"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("finance_cost_allocations").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Rateio removido");
      qc.invalidateQueries({ queryKey: ["finance_costs"] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={!!cost} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto w-[calc(100vw-1.5rem)] max-w-[calc(100vw-1.5rem)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Rateio entre projetos</DialogTitle>
        </DialogHeader>
        {cost && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {cost.description} · {money(costAmount, cost.currency)} · {used}% distribuído
            </p>
            <ul className="space-y-2">
              {allocs.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                  <span className="min-w-0">
                    {a.projects?.name ?? "Projeto"} — {Number(a.percentage)}% · {money(Number(a.amount))}
                  </span>
                  {canEdit && (
                    <Button size="icon" variant="ghost" aria-label="Remover rateio" onClick={() => removeMut.mutate(a.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </li>
              ))}
              {allocs.length === 0 && <li className="text-sm text-muted-foreground">Nenhum projeto rateado ainda.</li>}
            </ul>
            {canEdit && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="alloc-projeto">Projeto</Label>
                  <Select value={projectId} onValueChange={setProjectId}>
                    <SelectTrigger id="alloc-projeto"><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {projects
                        .filter((p) => !allocs.some((a) => a.project_id === p.id))
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="alloc-percentual">Percentual (%)</Label>
                  <Input id="alloc-percentual" type="number" min="0.001" max="100" step="0.01" value={percentage} onChange={(e) => setPercentage(e.target.value)} />
                  <p className="text-xs text-muted-foreground mt-1">
                    Valor estimado: {money(Number(((costAmount * Number(percentage || 0)) / 100).toFixed(2)))}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          {canEdit && (
            <Button onClick={() => addMut.mutate()} disabled={addMut.isPending}>
              Adicionar rateio
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
