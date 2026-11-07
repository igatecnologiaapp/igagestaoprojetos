import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ClipboardPaste, Lock, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { generateRecurringCosts } from "@/lib/use-recurring-costs";
import { parseLocaleNumber, parseUsageText, suggestProject } from "@/lib/usage-import";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/financeiro/consumo")({
  component: () => (
    <RequireAuth>
      <UsagePage />
    </RequireAuth>
  ),
  head: () => ({
    meta: [
      { title: "Consumo e rateio — IGA Tecnologia" },
      {
        name: "description",
        content:
          "Consumo de créditos por projeto em cada conta de ferramenta e rateio automático dos custos.",
      },
    ],
  }),
});

const NONE = "__none";
type DraftRow = { key: string; name: string; quantity: string; projectId: string };

function previousMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}
const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
const num = (v: number) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(v);

function UsagePage() {
  const { hasPermission, user } = useAuth();
  const canView = hasPermission("financial.view");
  const canEdit = hasPermission("financial.edit");
  const qc = useQueryClient();

  const [serviceId, setServiceId] = useState<string>("");
  const [month, setMonth] = useState(previousMonth());
  const period = `${month}-01`;
  const [pasted, setPasted] = useState("");
  const [draft, setDraft] = useState<DraftRow[] | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const { data: services = [] } = useQuery({
    queryKey: ["usage_services"],
    enabled: canView,
    queryFn: async () =>
      (
        await supabase
          .from("finance_services")
          .select("id,name,plan,amount,currency,status,recurrence,finance_vendors(name)")
          .neq("recurrence", "one_off")
          .order("name")
      ).data ?? [],
  });
  useEffect(() => {
    if (!serviceId && services.length) setServiceId(services[0].id);
  }, [services, serviceId]);

  const { data: projects = [] } = useQuery({
    queryKey: ["usage_projects"],
    enabled: canView,
    queryFn: async () =>
      (await supabase.from("projects").select("id,name").order("name")).data ?? [],
  });

  const key = ["usage_period", serviceId, period];
  const { data: state, isLoading } = useQuery({
    queryKey: key,
    enabled: canView && !!serviceId,
    queryFn: async () => {
      await generateRecurringCosts();
      const [{ data: per }, { data: aliases }, { data: costs }] = await Promise.all([
        supabase
          .from("finance_usage_periods")
          .select(
            "id,status,source,closed_at,finance_usage_entries(id,external_name,project_id,quantity)",
          )
          .eq("service_id", serviceId)
          .eq("period", period)
          .maybeSingle(),
        supabase
          .from("finance_usage_aliases")
          .select("external_name,project_id")
          .eq("service_id", serviceId),
        supabase
          .from("finance_costs")
          .select(
            "id,description,amount,currency,status,allocation_source,auto_generated,competence",
          )
          .eq("service_id", serviceId)
          .gte("competence", period)
          .lt("competence", nextMonth(period))
          .neq("status", "cancelled")
          .order("competence"),
      ]);
      return { per, aliases: aliases ?? [], costs: costs ?? [] };
    },
  });

  const { data: unallocated = [] } = useQuery({
    queryKey: ["usage_unallocated", period],
    enabled: canView,
    queryFn: async () =>
      (
        await supabase
          .from("v_finance_unallocated_costs")
          .select("cost_id,description,unallocated,currency,service_id")
          .eq("period", period)
      ).data ?? [],
  });

  const closed = state?.per?.status === "closed";
  const entries = useMemo(() => state?.per?.finance_usage_entries ?? [], [state]);
  const usageCosts = (state?.costs ?? []).filter((c) => c.allocation_source === "usage");
  const usageTotalValue = usageCosts.reduce((a, c) => a + Number(c.amount), 0);
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? "Não vinculado";

  // linhas exibidas: rascunho (se houver) ou o que está salvo
  const rows: DraftRow[] = useMemo(
    () =>
      draft ??
      entries.map((e) => ({
        key: e.id,
        name: e.external_name,
        quantity: String(e.quantity).replace(".", ","),
        projectId: e.project_id ?? NONE,
      })),
    [draft, entries],
  );
  const totalQty = rows.reduce((a, r) => a + (parseLocaleNumber(r.quantity) || 0), 0);

  const readPasted = () => {
    const parsed = parseUsageText(pasted);
    if (!parsed.length) {
      toast.error(
        'Não encontrei linhas no formato "Projeto — 15,2 credits". Copie a lista da tela Usage details.',
      );
      return;
    }
    const aliasOf = (name: string) =>
      state?.aliases.find((a) => a.external_name.trim().toLowerCase() === name.trim().toLowerCase())
        ?.project_id;
    setDraft(
      parsed.map((p, i) => ({
        key: `n${i}`,
        name: p.name,
        quantity: String(p.quantity).replace(".", ","),
        projectId: aliasOf(p.name) ?? suggestProject(p.name, projects)?.id ?? NONE,
      })),
    );
    toast.success(`${parsed.length} projeto(s) lidos. Confira os vínculos e salve.`);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const bad = draft.find(
        (r) => !r.name.trim() || !Number.isFinite(parseLocaleNumber(r.quantity)),
      );
      if (bad)
        throw new Error(
          `Confira a linha "${bad.name || "sem nome"}": nome e consumo são obrigatórios.`,
        );
      let periodId = state?.per?.id;
      if (!periodId) {
        const { data, error } = await supabase
          .from("finance_usage_periods")
          .insert({
            service_id: serviceId,
            period,
            source: pasted.trim() ? "paste" : "manual",
            imported_by: user?.id ?? null,
          })
          .select("id")
          .single();
        if (error) throw error;
        periodId = data.id;
      }
      const { error: delErr } = await supabase
        .from("finance_usage_entries")
        .delete()
        .eq("period_id", periodId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabase.from("finance_usage_entries").insert(
        draft.map((r) => ({
          period_id: periodId!,
          external_name: r.name.trim(),
          project_id: r.projectId === NONE ? null : r.projectId,
          quantity: parseLocaleNumber(r.quantity),
        })),
      );
      if (insErr) throw insErr;
      // lembra os vínculos para os próximos meses
      for (const r of draft.filter((x) => x.projectId !== NONE)) {
        const existing = state?.aliases.find(
          (a) => a.external_name.trim().toLowerCase() === r.name.trim().toLowerCase(),
        );
        if (existing?.project_id === r.projectId) continue;
        if (existing) {
          await supabase
            .from("finance_usage_aliases")
            .update({ project_id: r.projectId })
            .eq("service_id", serviceId)
            .eq("external_name", existing.external_name);
        } else {
          await supabase.from("finance_usage_aliases").insert({
            service_id: serviceId,
            external_name: r.name.trim(),
            project_id: r.projectId,
          });
        }
      }
      const { error: rpcErr } = await supabase.rpc("finance_apply_usage_allocation", {
        _period_id: periodId!,
      });
      if (rpcErr) throw rpcErr;
    },
    onSuccess: () => {
      toast.success("Consumo salvo e custos rateados.");
      setDraft(null);
      setPasted("");
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleSource = useMutation({
    mutationFn: async ({ id, usage }: { id: string; usage: boolean }) => {
      const { error } = await supabase
        .from("finance_costs")
        .update({ allocation_source: usage ? "usage" : "manual" })
        .eq("id", id);
      if (error) throw error;
      if (usage && state?.per?.id) {
        const { error: rpcErr } = await supabase.rpc("finance_apply_usage_allocation", {
          _period_id: state.per.id,
        });
        if (rpcErr) throw rpcErr;
      }
    },
    onSuccess: () => void qc.invalidateQueries(),
    onError: (e: Error) => toast.error(e.message),
  });

  const closeMonth = useMutation({
    mutationFn: async () => {
      if (!state?.per?.id) throw new Error("Lance o consumo antes de fechar o mês.");
      const { error } = await supabase.rpc("finance_close_usage_period", {
        _period_id: state.per.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Mês fechado. O rateio desta conta está congelado.");
      setConfirmClose(false);
      void qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canView) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">Você não tem acesso ao financeiro.</Card>
    );
  }

  const editing = !!draft;
  const updateRow = (k: string, patch: Partial<DraftRow>) =>
    setDraft((d) => (d ?? rows).map((r) => (r.key === k ? { ...r, ...patch } : r)));
  const unallocatedTotal = unallocated.reduce((a, u) => a + Number(u.unallocated ?? 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold">Consumo e rateio</h1>
        <p className="text-sm text-muted-foreground">
          Créditos usados por projeto em cada conta de ferramenta. Os custos da conta no mês são
          divididos na proporção do consumo.
        </p>
      </div>

      <Card className="p-4 flex flex-wrap gap-4 items-end">
        <div className="space-y-1 min-w-[260px] flex-1">
          <Label htmlFor="usage-service">Conta</Label>
          <Select
            value={serviceId}
            onValueChange={(v) => {
              setServiceId(v);
              setDraft(null);
            }}
          >
            <SelectTrigger id="usage-service">
              <SelectValue placeholder="Escolha a conta" />
            </SelectTrigger>
            <SelectContent>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                  {s.plan ? ` · ${s.plan}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="usage-month">Mês</Label>
          <Input
            id="usage-month"
            type="month"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setDraft(null);
            }}
          />
        </div>
        {state?.per && (
          <Badge variant={closed ? "secondary" : "outline"} className="h-8">
            {closed ? (
              <>
                <Lock className="h-3.5 w-3.5 mr-1" /> Mês fechado
              </>
            ) : (
              "Mês aberto"
            )}
          </Badge>
        )}
      </Card>

      {services.length === 0 && (
        <Card className="p-6 text-sm text-muted-foreground">
          Cadastre cada conta (workspace) em Financeiro › Assinaturas, por exemplo "Lovable —
          Workspace IGA". Plano gratuito pode ter valor R$ 0.
        </Card>
      )}

      {serviceId && (
        <>
          {canEdit && !closed && (
            <Card className="p-4 space-y-3">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <ClipboardPaste className="h-4 w-4" /> Colar do Lovable
              </h2>
              <ol className="text-xs text-muted-foreground list-decimal pl-5 space-y-0.5">
                <li>
                  No Lovable, abra Settings › Plans &amp; credit usage › Usage details, no workspace
                  desta conta.
                </li>
                <li>Escolha "All credits" e o período do mês (Custom range).</li>
                <li>Selecione a lista de projetos com o consumo, copie e cole abaixo.</li>
              </ol>
              <Label htmlFor="usage-paste" className="sr-only">
                Texto copiado do Lovable
              </Label>
              <Textarea
                id="usage-paste"
                rows={5}
                placeholder={"Gestao Etiquetas\n15,2 credits\nIga Gestão de Projetos\n6,41 credits"}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button onClick={readPasted} disabled={!pasted.trim()}>
                  Ler texto colado
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    setDraft([
                      ...(draft ?? rows),
                      { key: `m${Date.now()}`, name: "", quantity: "0", projectId: NONE },
                    ])
                  }
                >
                  <Plus className="h-4 w-4" /> Lançar à mão
                </Button>
              </div>
            </Card>
          )}

          <Card className="p-4 space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg font-semibold">Consumo por projeto</h2>
              <span className="text-sm text-muted-foreground">
                Total {num(totalQty)} créditos · custos rateados pelo consumo{" "}
                {money(usageTotalValue)}
              </span>
            </div>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum consumo lançado neste mês. Sem consumo, os custos da conta ficam como custo
                ocioso da IGA.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">Projeto na ferramenta</th>
                      <th className="py-2 pr-2 font-medium">Consumo</th>
                      <th className="py-2 pr-2 font-medium">Projeto da IGA</th>
                      <th className="py-2 pr-2 font-medium text-right">Fatia</th>
                      <th className="py-2 pr-2 font-medium text-right">Custo rateado</th>
                      {editing && <th className="py-2" aria-label="Ações" />}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const q = parseLocaleNumber(r.quantity) || 0;
                      const share = totalQty > 0 ? q / totalQty : 0;
                      return (
                        <tr key={r.key} className="border-t">
                          <td className="py-2 pr-2">
                            {editing ? (
                              <Input
                                aria-label="Nome do projeto na ferramenta"
                                value={r.name}
                                onChange={(e) => updateRow(r.key, { name: e.target.value })}
                              />
                            ) : (
                              r.name
                            )}
                          </td>
                          <td className="py-2 pr-2 w-32">
                            {editing ? (
                              <Input
                                aria-label={`Consumo de ${r.name}`}
                                inputMode="decimal"
                                value={r.quantity}
                                onChange={(e) => updateRow(r.key, { quantity: e.target.value })}
                              />
                            ) : (
                              num(q)
                            )}
                          </td>
                          <td className="py-2 pr-2 min-w-[200px]">
                            {editing ? (
                              <Select
                                value={r.projectId}
                                onValueChange={(v) => updateRow(r.key, { projectId: v })}
                              >
                                <SelectTrigger aria-label={`Projeto da IGA para ${r.name}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NONE}>
                                    Não vinculado (fica como não atribuído)
                                  </SelectItem>
                                  {projects.map((p) => (
                                    <SelectItem key={p.id} value={p.id}>
                                      {p.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className={r.projectId === NONE ? "text-muted-foreground" : ""}>
                                {projectName(r.projectId === NONE ? null : r.projectId)}
                              </span>
                            )}
                          </td>
                          <td className="py-2 pr-2 text-right">
                            {(share * 100).toFixed(1).replace(".", ",")}%
                          </td>
                          <td className="py-2 pr-2 text-right">{money(usageTotalValue * share)}</td>
                          {editing && (
                            <td className="py-2">
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Remover ${r.name}`}
                                onClick={() => setDraft(rows.filter((x) => x.key !== r.key))}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              {editing ? (
                <>
                  <Button variant="outline" onClick={() => setDraft(null)}>
                    Descartar
                  </Button>
                  <Button onClick={() => save.mutate()} disabled={save.isPending}>
                    {save.isPending ? "Salvando…" : "Salvar e ratear"}
                  </Button>
                </>
              ) : (
                canEdit &&
                !closed &&
                rows.length > 0 && (
                  <>
                    <Button variant="outline" onClick={() => setDraft(rows)}>
                      Editar consumo
                    </Button>
                    <Button variant="outline" onClick={() => setConfirmClose(true)}>
                      <Lock className="h-4 w-4" /> Fechar mês
                    </Button>
                  </>
                )
              )}
            </div>
          </Card>

          <Card className="p-4 space-y-2">
            <h2 className="font-display text-lg font-semibold">Custos desta conta no mês</h2>
            {(state?.costs ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum custo lançado para esta conta no mês.
              </p>
            ) : (
              <ul className="divide-y">
                {(state?.costs ?? []).map((c) => (
                  <li key={c.id} className="py-2 flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{c.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {money(Number(c.amount))}{" "}
                        {c.auto_generated ? "· despesa fixa automática" : ""}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={c.allocation_source === "usage"}
                        disabled={!canEdit || closed || toggleSource.isPending}
                        onCheckedChange={(v) => toggleSource.mutate({ id: c.id, usage: v })}
                        aria-label={`Ratear ${c.description} pelo consumo`}
                      />
                      Ratear pelo consumo
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground">
              Desligue para custos comprados para um projeto específico; o rateio deles é feito na
              tela de Custos.
            </p>
          </Card>
        </>
      )}

      <Card className="p-4 space-y-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-lg font-semibold">
            Custo ocioso e não atribuído no mês
          </h2>
          <span className="text-sm font-semibold">{money(unallocatedTotal)}</span>
        </div>
        {unallocated.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todos os custos do mês estão rateados entre projetos.
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {unallocated.map((u) => (
              <li key={u.cost_id} className="py-1.5 flex justify-between gap-3">
                <span className="min-w-0 truncate">{u.description}</span>
                <span className="shrink-0">{money(Number(u.unallocated))}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={confirmClose} onOpenChange={setConfirmClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Fechar o mês desta conta?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            O rateio é refeito uma última vez e fica congelado. Depois disso, o consumo não pode ser
            alterado; correções entram como lançamento de ajuste na tela de Custos.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmClose(false)}>
              Voltar
            </Button>
            <Button onClick={() => closeMonth.mutate()} disabled={closeMonth.isPending}>
              Fechar mês
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function nextMonth(firstDay: string) {
  const [y, m] = firstDay.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 1));
  return d.toISOString().slice(0, 10);
}
