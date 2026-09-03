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
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/finance/services")({
  component: () => (
    <RequireAuth>
      <ServicesPage />
    </RequireAuth>
  ),
  head: () => ({
    meta: [
      { title: "Serviços e recursos contratados — IGA Tecnologia" },
      { name: "description", content: "Assinaturas, plataformas e recursos tecnológicos contratados pela IGA Tecnologia." },
      { property: "og:title", content: "Serviços e recursos contratados — IGA Tecnologia" },
      { property: "og:description", content: "Assinaturas, plataformas e recursos tecnológicos contratados." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Recurrence = "monthly" | "quarterly" | "semiannual" | "annual" | "one_off";
type ServiceStatus = "active" | "paused" | "cancelled" | "expired";

const recurrenceLabels: Record<Recurrence, string> = {
  monthly: "Mensal",
  quarterly: "Trimestral",
  semiannual: "Semestral",
  annual: "Anual",
  one_off: "Eventual/único",
};
const statusLabels: Record<ServiceStatus, string> = {
  active: "Ativo",
  paused: "Pausado",
  cancelled: "Cancelado",
  expired: "Expirado",
};

const emptyForm = {
  vendor_id: "",
  category_id: "none",
  name: "",
  description: "",
  plan: "",
  recurrence: "monthly" as Recurrence,
  amount: "",
  currency: "BRL",
  billing_day: "",
  contracted_at: "",
  renews_at: "",
  expires_at: "",
  auto_renew: true,
  status: "active" as ServiceStatus,
  project_account_id: "none",
  default_project_id: "none",
  is_shared: false,
  notes: "",
};

function ServicesPage() {
  const { hasPermission, user } = useAuth();
  const canView = hasPermission("financial.view");
  const canEditFinance = hasPermission("financial.edit");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");

  const { data: services = [], isLoading } = useQuery({
    queryKey: ["finance_services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("finance_services").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: vendors = [] } = useQuery({
    queryKey: ["finance_vendors"],
    enabled: canView,
    queryFn: async () => (await supabase.from("finance_vendors").select("id,name,status").order("name")).data ?? [],
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["finance_categories"],
    enabled: canView,
    queryFn: async () => (await supabase.from("finance_categories").select("id,name,active").order("position")).data ?? [],
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["finance_projects_options"],
    queryFn: async () => (await supabase.from("projects").select("id,name").order("name")).data ?? [],
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["finance_project_accounts_options", form.default_project_id],
    enabled: form.default_project_id !== "none",
    queryFn: async () =>
      (await supabase.from("project_accounts").select("id,platform,project_id").eq("project_id", form.default_project_id)).data ?? [],
  });

  const filtered = useMemo(
    () =>
      services.filter(
        (s) => (statusFilter === "all" || s.status === statusFilter) && (vendorFilter === "all" || s.vendor_id === vendorFilter),
      ),
    [services, statusFilter, vendorFilter],
  );

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        vendor_id: form.vendor_id,
        category_id: form.category_id === "none" ? null : form.category_id,
        name: form.name.trim(),
        description: form.description || null,
        plan: form.plan || null,
        recurrence: form.recurrence,
        amount: form.amount === "" ? null : Number(form.amount),
        currency: form.currency.toUpperCase(),
        billing_day: form.billing_day === "" ? null : Number(form.billing_day),
        contracted_at: form.contracted_at || null,
        renews_at: form.renews_at || null,
        expires_at: form.expires_at || null,
        auto_renew: form.auto_renew,
        status: form.status,
        project_account_id: form.project_account_id === "none" ? null : form.project_account_id,
        default_project_id: form.default_project_id === "none" ? null : form.default_project_id,
        is_shared: form.is_shared,
        notes: form.notes || null,
      };
      if (editingId) {
        const { error } = await supabase.from("finance_services").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("finance_services").insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Serviço salvo");
      qc.invalidateQueries({ queryKey: ["finance_services"] });
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const statusMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ServiceStatus }) => {
      const { error } = await supabase.from("finance_services").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance_services"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const vendorName = (id: string) => vendors.find((v) => v.id === id)?.name ?? "—";
  const money = (v: number | null, c: string) =>
    v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: c || "BRL" }).format(v);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Serviços e recursos</h1>
          <p className="text-sm text-muted-foreground">Assinaturas, plataformas e recursos tecnológicos contratados.</p>
        </div>
        {canEditFinance && (
          <Button
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Novo serviço
          </Button>
        )}
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as situações</SelectItem>
            {(Object.entries(statusLabels) as [ServiceStatus, string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canView && (
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Fornecedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os fornecedores</SelectItem>
              {vendors.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">Nenhum serviço encontrado.</Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((s) => (
            <Card key={s.id} className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  {s.name}
                  <Badge variant={s.status === "active" ? "secondary" : "outline"}>{statusLabels[s.status as ServiceStatus]}</Badge>
                  <Badge variant="outline">{recurrenceLabels[s.recurrence as Recurrence]}</Badge>
                  {s.is_shared && <Badge variant="outline">Compartilhado</Badge>}
                </div>
                <div className="text-xs text-muted-foreground">
                  {vendorName(s.vendor_id)} · {money(s.amount as number | null, s.currency)}
                  {s.renews_at ? ` · renova em ${new Date(s.renews_at).toLocaleDateString("pt-BR")}` : ""}
                </div>
              </div>
              {canEditFinance && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => statusMut.mutate({ id: s.id, status: s.status === "active" ? "paused" : "active" })}
                  >
                    {s.status === "active" ? "Pausar" : "Ativar"}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${s.name}`}
                    onClick={() => {
                      setEditingId(s.id);
                      setForm({
                        vendor_id: s.vendor_id,
                        category_id: s.category_id ?? "none",
                        name: s.name,
                        description: s.description ?? "",
                        plan: s.plan ?? "",
                        recurrence: s.recurrence as Recurrence,
                        amount: s.amount == null ? "" : String(s.amount),
                        currency: s.currency,
                        billing_day: s.billing_day == null ? "" : String(s.billing_day),
                        contracted_at: s.contracted_at ?? "",
                        renews_at: s.renews_at ?? "",
                        expires_at: s.expires_at ?? "",
                        auto_renew: s.auto_renew,
                        status: s.status as ServiceStatus,
                        project_account_id: s.project_account_id ?? "none",
                        default_project_id: s.default_project_id ?? "none",
                        is_shared: s.is_shared,
                        notes: s.notes ?? "",
                      });
                      setOpen(true);
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar" : "Novo"} serviço</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Fornecedor *</Label>
              <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {vendors.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Categoria</Label>
                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Plano</Label>
                <Input value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Periodicidade</Label>
                <Select value={form.recurrence} onValueChange={(v) => setForm({ ...form, recurrence: v as Recurrence })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(recurrenceLabels) as [Recurrence, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Situação</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as ServiceStatus })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.entries(statusLabels) as [ServiceStatus, string][]).map(([k, v]) => (
                      <SelectItem key={k} value={k}>
                        {v}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Valor</Label>
                <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <Label>Moeda</Label>
                <Input maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              </div>
              <div>
                <Label>Dia cobrança</Label>
                <Input type="number" min="1" max="31" value={form.billing_day} onChange={(e) => setForm({ ...form, billing_day: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Contratação</Label>
                <Input type="date" value={form.contracted_at} onChange={(e) => setForm({ ...form, contracted_at: e.target.value })} />
              </div>
              <div>
                <Label>Renovação</Label>
                <Input type="date" value={form.renews_at} onChange={(e) => setForm({ ...form, renews_at: e.target.value })} />
              </div>
              <div>
                <Label>Expiração</Label>
                <Input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Projeto padrão</Label>
              <Select
                value={form.default_project_id}
                onValueChange={(v) => setForm({ ...form, default_project_id: v, project_account_id: "none" })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhum</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.default_project_id !== "none" && (
              <div>
                <Label>Conta/plataforma do projeto</Label>
                <Select value={form.project_account_id} onValueChange={(v) => setForm({ ...form, project_account_id: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhuma</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.platform}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.auto_renew} onCheckedChange={(v) => setForm({ ...form, auto_renew: Boolean(v) })} />
                Renovação automática
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={form.is_shared} onCheckedChange={(v) => setForm({ ...form, is_shared: Boolean(v) })} />
                Recurso compartilhado
              </label>
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Não registre senhas, tokens ou chaves de acesso.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={!form.vendor_id || !form.name.trim() || saveMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
