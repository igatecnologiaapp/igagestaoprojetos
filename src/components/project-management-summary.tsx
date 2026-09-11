import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Pencil, Plus, Save, X } from "lucide-react";
import { consumption, currentMonthRange, levelLabels, levelVariant, realizedFor } from "@/lib/finance-budgets";

const sb = supabase as unknown as { from: (t: string) => any };

export const projectStatusOptions = [
  { value: "planning", label: "Planejamento" },
  { value: "in_progress", label: "Em andamento" },
  { value: "in_development", label: "Em desenvolvimento" },
  { value: "testing", label: "Em testes" },
  { value: "validation", label: "Em validação" },
  { value: "homologation", label: "Em homologação" },
  { value: "deployment", label: "Em implantação" },
  { value: "awaiting_credits", label: "Aguardando créditos" },
  { value: "awaiting_client", label: "Aguardando cliente" },
  { value: "awaiting_info", label: "Aguardando informação" },
  { value: "paused", label: "Pausado" },
  { value: "completed", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" },
];

export const promptStatusOptions = [
  { value: "draft", label: "Em elaboração" },
  { value: "to_send", label: "A enviar" },
  { value: "sent", label: "Enviado" },
  { value: "awaiting_reply", label: "Aguardando retorno" },
  { value: "done", label: "Concluído" },
  { value: "cancelled", label: "Cancelado" },
];

const debtStatusLabels = [
  { value: "open", label: "Aberta" },
  { value: "analysis", label: "Em análise" },
  { value: "planned", label: "Planejada" },
  { value: "resolved", label: "Resolvida" },
  { value: "accepted", label: "Aceita" },
];

const platformSuggestions = ["Lovable", "Claude", "ChatGPT", "GitHub", "Supabase", "Gamma", "Base44", "VPS", "Docker", "Outra"];

const money = (v: number | null | undefined, currency = "BRL") =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
const dt = (v: unknown) => (v ? new Date(String(v)).toLocaleString("pt-BR") : "—");
const dd = (v: unknown) => (v ? new Date(String(v) + "T00:00:00").toLocaleDateString("pt-BR") : "—");
const labelOf = (opts: { value: string; label: string }[], v: unknown) =>
  opts.find((o) => o.value === String(v))?.label ?? (v ? String(v) : "—");

const monthlyFactor: Record<string, number | null> = {
  monthly: 1,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  annual: 1 / 12,
  one_off: null,
};

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  value: number | null;
  start_date: string | null;
  end_date: string | null;
  phase: string | null;
  next_action: string | null;
  owner_id: string | null;
  created_by: string | null;
  last_activity_at: string;
  companies?: { name: string } | null;
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-sm font-semibold">{children}</h4>;
}

export function ProjectManagementSummary({
  projectId,
  responsibleName,
}: {
  projectId: string;
  responsibleName: (id: unknown) => string | null;
}) {
  const { hasPermission, isOwner, user } = useAuth();
  const canEditProject = isOwner || hasPermission("projects.edit");
  const canViewFinance = hasPermission("financial.view");
  const canEditFinance = hasPermission("financial.edit");
  const canViewCredentials = isOwner || hasPermission("credentials.metadata.view");
  const canEditPrompts = isOwner || hasPermission("prompts.edit") || canEditProject;
  const qc = useQueryClient();

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [promptFilterStatus, setPromptFilterStatus] = useState("all");
  const [promptFilterPlatform, setPromptFilterPlatform] = useState("all");
  const [newPromptOpen, setNewPromptOpen] = useState(false);
  const [newCostOpen, setNewCostOpen] = useState(false);
  const [costForm, setCostForm] = useState({
    description: "",
    amount: "",
    competence: new Date().toISOString().slice(0, 8) + "01",
    cost_type: "one_off",
    status: "open",
    percentage: "100",
  });
  const [promptForm, setPromptForm] = useState({
    title: "",
    platform: "Lovable",
    status: "to_send",
    content: "",
    planned_send_date: "",
    notes: "",
  });

  const { data: project } = useQuery<Project | null>({
    queryKey: ["project-detail", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*, companies(name)").eq("id", projectId).maybeSingle();
      if (error) throw error;
      return data as unknown as Project;
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ["project-finance-services", projectId],
    enabled: canViewFinance,
    queryFn: async () => {
      const { data, error } = await sb
        .from("finance_services")
        .select("id,name,amount,currency,recurrence,status,is_shared,vendor_id,finance_vendors(name)")
        .eq("default_project_id", projectId);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        name: string;
        amount: number | null;
        currency: string;
        recurrence: string;
        status: string;
        is_shared: boolean;
        finance_vendors?: { name: string } | null;
      }[];
    },
  });

  const { data: platforms = [] } = useQuery({
    queryKey: ["project-platforms", projectId, canViewCredentials],
    queryFn: async () => {
      const [accounts, lovable, repos, emails] = await Promise.all([
        canViewCredentials ? sb.from("project_accounts").select("*").eq("project_id", projectId) : Promise.resolve({ data: [] }),
        sb.from("project_lovable").select("*").eq("project_id", projectId),
        sb.from("project_github_repos").select("*").eq("project_id", projectId),
        sb.from("project_emails").select("*").eq("project_id", projectId),
      ]);
      const rows: {
        id: string;
        platform: string;
        purpose: string | null;
        url: string | null;
        email: string | null;
        username: string | null;
        workspace: string | null;
        notes: string | null;
        source: string;
      }[] = [];
      for (const a of accounts.data ?? [])
        rows.push({
          id: `acc-${a.id}`,
          platform: a.platform,
          purpose: null,
          url: a.url,
          email: a.email,
          username: a.username,
          workspace: null,
          notes: a.notes,
          source: "Contas e acessos",
        });
      for (const l of lovable.data ?? [])
        rows.push({
          id: `lov-${l.id}`,
          platform: "Lovable",
          purpose: "Desenvolvimento",
          url: l.project_url ?? l.public_url,
          email: l.account_email,
          username: null,
          workspace: l.workspace,
          notes: l.notes,
          source: "Lovable",
        });
      for (const g of repos.data ?? [])
        rows.push({
          id: `gh-${g.id}`,
          platform: "GitHub",
          purpose: "Repositório",
          url: g.url,
          email: null,
          username: g.owner,
          workspace: g.repo_name,
          notes: g.notes,
          source: "GitHub",
        });
      for (const e of emails.data ?? [])
        rows.push({
          id: `em-${e.id}`,
          platform: e.provider ?? "E-mail",
          purpose: e.purpose,
          url: null,
          email: e.email,
          username: null,
          workspace: null,
          notes: e.notes,
          source: "E-mails",
        });
      return rows;
    },
  });

  const { data: prompts = [] } = useQuery({
    queryKey: ["project-prompts-pending", projectId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("project_prompts")
        .select("*")
        .eq("project_id", projectId)
        .order("prompt_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    },
  });

  const { data: debts = [] } = useQuery({
    queryKey: ["project-open-debts", projectId],
    queryFn: async () => {
      const { data } = await sb
        .from("project_technical_debts")
        .select("id,code,title,status,priority,identified_at")
        .eq("project_id", projectId)
        .neq("status", "resolved")
        .order("identified_at", { ascending: false });
      return (data ?? []) as Record<string, unknown>[];
    },
  });

  const { data: lastRecords = [] } = useQuery({
    queryKey: ["project-last-origin", projectId],
    queryFn: async () => {
      const [dev, prm] = await Promise.all([
        sb.from("project_development_records").select("record_type,title,updated_at").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(1),
        sb.from("project_prompts").select("title,updated_at").eq("project_id", projectId).order("updated_at", { ascending: false }).limit(1),
      ]);
      const out: { origin: string; title: string; at: string }[] = [];
      const devTypes: Record<string, string> = {
        decision: "Decisão de desenvolvimento",
        version: "Versão",
        test: "Teste",
        homologation: "Homologação",
        deployment: "Implantação",
      };
      for (const d of dev.data ?? []) out.push({ origin: devTypes[d.record_type] ?? "Desenvolvimento", title: d.title, at: d.updated_at });
      for (const p of prm.data ?? []) out.push({ origin: "Prompt", title: p.title, at: p.updated_at });
      return out.sort((a, b) => (a.at < b.at ? 1 : -1));
    },
  });

  // Custos reais alocados a este projeto (Bloco 4C)
  const { data: allocations = [] } = useQuery({
    queryKey: ["project-cost-allocations", projectId],
    enabled: canViewFinance,
    queryFn: async () => {
      const { data, error } = await sb
        .from("finance_cost_allocations")
        .select("id,percentage,amount,finance_costs(id,description,competence,status,cost_type,currency,amount,amount_brl,paid_at)")
        .eq("project_id", projectId);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        percentage: number;
        amount: number;
        finance_costs?: {
          id: string;
          description: string;
          competence: string;
          status: string;
          cost_type: string;
          currency: string;
          amount: number;
          amount_brl: number | null;
          paid_at: string | null;
        } | null;
      }[];
    },
  });

  // Orçamentos do projeto (Bloco 4D)
  const { data: budgets = [] } = useQuery({
    queryKey: ["project-budgets", projectId],
    enabled: canViewFinance,
    queryFn: async () => {
      const { data, error } = await sb
        .from("finance_budgets")
        .select("id,amount,period_start,period_end,category_id,notes,finance_categories(name)")
        .eq("project_id", projectId)
        .order("period_start", { ascending: false });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        amount: number;
        period_start: string;
        period_end: string;
        category_id: string | null;
        notes: string | null;
        finance_categories?: { name: string } | null;
      }[];
    },
  });

  const realized = useMemo(() => {
    let paid = 0;
    let openTotal = 0;
    let total = 0;
    for (const a of allocations) {
      const c = a.finance_costs;
      if (!c || c.status === "cancelled") continue;
      const v = Number(a.amount);
      total += v;
      if (c.status === "paid") paid += v;
      else openTotal += v;
    }
    return { paid, open: openTotal, total, count: allocations.length };
  }, [allocations]);

  const budgetTotal = useMemo(() => budgets.reduce((s, b) => s + Number(b.amount ?? 0), 0), [budgets]);
  const budgetBalance = budgetTotal - realized.total;
  const budgetConsumption = consumption(budgetTotal, realized.total);




  const finance = useMemo(() => {
    const active = services.filter((s) => s.status === "active");
    let monthly = 0;
    let oneOff = 0;
    let ignoredShared = 0;
    for (const s of active) {
      const amount = s.amount == null ? null : Number(s.amount);
      if (amount == null) {
        if (s.is_shared) ignoredShared += 1;
        continue;
      }
      const factor = monthlyFactor[s.recurrence];
      if (factor == null) oneOff += amount;
      else monthly += amount * factor;
    }
    return { monthly, oneOff, ignoredShared, count: active.length };
  }, [services]);

  const revenue = project?.value == null ? null : Number(project.value);
  const grossResult = revenue == null ? null : revenue - finance.monthly;

  const filteredPrompts = useMemo(
    () =>
      prompts.filter(
        (p) =>
          (promptFilterStatus === "all" || String(p['status']) === promptFilterStatus) &&
          (promptFilterPlatform === "all" || (p['platform'] ?? "") === promptFilterPlatform),
      ),
    [prompts, promptFilterStatus, promptFilterPlatform],
  );
  const pendingPrompts = filteredPrompts.filter((p) => !["done", "cancelled"].includes(String(p['status'])));

  const saveProject = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("projects")
        .update({
          status: form['status'] as Project["status"],
          next_action: form['next_action'] || null,
          phase: form['phase'] || null,
          description: form['description'] || null,
          start_date: form['start_date'] || null,
          value: form['value'] === "" ? null : Number(form['value']),
        } as never)
        .eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Projeto atualizado");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["project-detail", projectId] });
      qc.invalidateQueries({ queryKey: ["projects"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePrompt = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("project_prompts").insert({
        project_id: projectId,
        title: promptForm.title.trim(),
        platform: promptForm.platform,
        status: promptForm.status,
        content: promptForm.content || null,
        planned_send_date: promptForm.planned_send_date || null,
        notes: promptForm.notes || null,
        prompt_type: "other",
        prompt_date: new Date().toISOString().slice(0, 10),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Prompt registrado");
      setNewPromptOpen(false);
      setPromptForm({ title: "", platform: "Lovable", status: "to_send", content: "", planned_send_date: "", notes: "" });
      qc.invalidateQueries({ queryKey: ["project-prompts-pending", projectId] });
      qc.invalidateQueries({ queryKey: ["project-records", "project_prompts", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createCost = useMutation({
    mutationFn: async () => {
      if (!costForm.description.trim()) throw new Error("Informe a descrição do custo.");
      const amount = Number(costForm.amount);
      if (!(amount >= 0) || costForm.amount === "") throw new Error("Informe um valor válido.");
      const pct = Number(costForm.percentage);
      if (!(pct > 0 && pct <= 100)) throw new Error("O percentual deve estar entre 0 e 100.");
      const { data, error } = await sb
        .from("finance_costs")
        .insert({
          description: costForm.description.trim(),
          amount,
          currency: "BRL",
          competence: costForm.competence,
          cost_type: costForm.cost_type,
          status: costForm.status,
          is_shared: pct < 100,
          paid_at: costForm.status === "paid" ? new Date().toISOString().slice(0, 10) : null,
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      const { error: allocError } = await sb.from("finance_cost_allocations").insert({
        cost_id: data.id,
        project_id: projectId,
        percentage: pct,
        amount: Number(((amount * pct) / 100).toFixed(2)),
        created_by: user?.id ?? null,
      });
      if (allocError) throw allocError;
    },
    onSuccess: () => {
      toast.success("Custo registrado");
      setNewCostOpen(false);
      setCostForm({
        description: "",
        amount: "",
        competence: new Date().toISOString().slice(0, 8) + "01",
        cost_type: "one_off",
        status: "open",
        percentage: "100",
      });
      qc.invalidateQueries({ queryKey: ["project-cost-allocations", projectId] });
      qc.invalidateQueries({ queryKey: ["project-detail", projectId] });
      qc.invalidateQueries({ queryKey: ["finance_costs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changePromptStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await sb.from("project_prompts").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-prompts-pending", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!project) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  const startEdit = () => {
    setForm({
      status: project.status,
      next_action: project.next_action ?? "",
      phase: project.phase ?? "",
      description: project.description ?? "",
      start_date: project.start_date ?? "",
      value: project.value == null ? "" : String(project.value),
    });
    setEditing(true);
  };

  return (
    <div className="space-y-6">
      {/* Indicadores */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Status</div>
          <Badge className="mt-1">{labelOf(projectStatusOptions, project.status)}</Badge>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Última atualização</div>
          <p className="text-sm font-medium mt-1">{dt(project.last_activity_at)}</p>
          {lastRecords[0] && (
            <p className="text-xs text-muted-foreground truncate">
              Origem provável: {lastRecords[0].origin} — {lastRecords[0].title}
            </p>
          )}
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Custo mensal estimado</div>
          <p className="text-lg font-semibold mt-1">{canViewFinance ? money(finance.monthly) : "Sem permissão"}</p>
          {canViewFinance && <p className="text-xs text-muted-foreground">{finance.count} serviço(s) ativo(s)</p>}
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Receita bruta contratada</div>
          <p className="text-lg font-semibold mt-1">{money(revenue)}</p>
          <p className="text-xs text-muted-foreground">Valor contratado do projeto</p>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Resultado bruto estimado</div>
          <p className="text-lg font-semibold mt-1">{canViewFinance && grossResult != null ? money(grossResult) : "—"}</p>
          <p className="text-xs text-muted-foreground">Estimativa (receita − custo mensal conhecido)</p>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Custos realizados no período</div>
          <p className="text-lg font-semibold mt-1">{canViewFinance ? money(realized.total) : "Sem permissão"}</p>
          {canViewFinance && (
            <p className="text-xs text-muted-foreground">
              Pagos {money(realized.paid)} · em aberto {money(realized.open)}
            </p>
          )}
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Resultado bruto gerencial</div>
          <p className="text-lg font-semibold mt-1">
            {canViewFinance && revenue != null ? money(revenue - realized.total) : "—"}
          </p>
          <p className="text-xs text-muted-foreground">Receita contratada − custos reais conhecidos</p>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Próxima ação</div>
          <p className="text-sm font-medium mt-1 break-words">{project.next_action || "—"}</p>
        </Card>
      </div>

      {/* Visão geral / edição rápida */}
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle>Visão geral</SectionTitle>
          {canEditProject &&
            (editing ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(false)}>
                  <X className="h-4 w-4" /> Cancelar
                </Button>
                <Button size="sm" onClick={() => saveProject.mutate()} disabled={saveProject.isPending}>
                  <Save className="h-4 w-4" /> Salvar
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" onClick={startEdit}>
                <Pencil className="h-4 w-4" /> Editar
              </Button>
            ))}
        </div>

        {editing ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="mg-status">Status</Label>
              <Select value={form['status']} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger id="mg-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {projectStatusOptions.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="mg-next-action">Próxima ação necessária</Label>
              <Input id="mg-next-action" value={form['next_action']} onChange={(e) => setForm({ ...form, next_action: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="mg-phase">Etapa atual</Label>
              <Input id="mg-phase" value={form['phase']} onChange={(e) => setForm({ ...form, phase: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="mg-start">Data de início</Label>
              <Input id="mg-start" type="date" value={form['start_date']} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="mg-value">Receita bruta / valor contratado</Label>
              <Input id="mg-value" type="number" step="0.01" min="0" value={form['value']} onChange={(e) => setForm({ ...form, value: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="mg-description">Observações gerais</Label>
              <Textarea id="mg-description" rows={3} value={form['description']} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            <div><span className="text-muted-foreground">Projeto: </span>{project.name}</div>
            <div><span className="text-muted-foreground">Empresa/cliente: </span>{project.companies?.name ?? "—"}</div>
            <div><span className="text-muted-foreground">Início: </span>{dd(project.start_date)}</div>
            <div><span className="text-muted-foreground">Responsável: </span>{responsibleName(project.owner_id ?? project.created_by) ?? "—"}</div>
            <div><span className="text-muted-foreground">Etapa atual: </span>{project.phase || "—"}</div>
            <div><span className="text-muted-foreground">Última atividade: </span>{dt(project.last_activity_at)}</div>
            <div className="sm:col-span-2"><span className="text-muted-foreground">Observações: </span>{project.description || "—"}</div>
          </div>
        )}
      </div>

      {/* Plataformas e contas */}
      <div className="space-y-2 border-t pt-4">
        <SectionTitle>Plataformas e contas</SectionTitle>
        {!canViewCredentials && (
          <p className="text-xs text-muted-foreground">Contas de acesso ocultas: sem permissão para ver credenciais.</p>
        )}
        {platforms.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma plataforma registrada neste projeto.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {platforms.map((p) => (
              <Card key={p.id} className="p-3 text-sm">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{p.platform}</span>
                  <Badge variant="outline">{p.source}</Badge>
                </div>
                <p className="text-xs text-muted-foreground break-words">
                  {[p.purpose, p.email, p.username, p.workspace].filter(Boolean).join(" · ") || "Sem dados adicionais"}
                </p>
                {p.url && (
                  <a className="text-xs text-primary underline break-all" href={p.url} target="_blank" rel="noreferrer">
                    {p.url}
                  </a>
                )}
                {p.notes && <p className="text-xs text-muted-foreground break-words">{p.notes}</p>}
              </Card>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">
          Senhas não são armazenadas no sistema. Guarde-as em um gerenciador de senhas e registre aqui apenas conta, login e finalidade.
        </p>
      </div>

      {/* Resumo financeiro */}
      <div className="space-y-2 border-t pt-4">
        <SectionTitle>Resumo financeiro</SectionTitle>
        {!canViewFinance ? (
          <p className="text-sm text-muted-foreground">Você não possui permissão para visualizar dados financeiros.</p>
        ) : services.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum serviço financeiro vinculado a este projeto.</p>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 text-sm">
              <div><span className="text-muted-foreground">Custos recorrentes estimados/mês: </span>{money(finance.monthly)}</div>
              <div><span className="text-muted-foreground">Custos eventuais registrados: </span>{money(finance.oneOff)}</div>
            </div>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {services.map((s) => (
                <li key={s.id} className="break-words">
                  {s.finance_vendors?.name ? `${s.finance_vendors.name} · ` : ""}
                  {s.name} — {s.amount == null ? "sem valor" : money(Number(s.amount), s.currency)} ·{" "}
                  {labelOf(
                    [
                      { value: "monthly", label: "Mensal" },
                      { value: "quarterly", label: "Trimestral" },
                      { value: "semiannual", label: "Semestral" },
                      { value: "annual", label: "Anual" },
                      { value: "one_off", label: "Eventual" },
                    ],
                    s.recurrence,
                  )}
                  {s.is_shared ? " · compartilhado" : ""}
                  {s.status !== "active" ? " · inativo" : ""}
                </li>
              ))}
            </ul>
            {finance.ignoredShared > 0 && (
              <p className="text-xs text-muted-foreground">
                {finance.ignoredShared} serviço(s) compartilhado(s) sem valor diretamente atribuível foram ignorados no cálculo.
              </p>
            )}
          </>
        )}
      </div>

      {/* Custos reais (realizado) */}
      {canViewFinance && (
        <div className="space-y-3 border-t pt-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <SectionTitle>Custos realizados</SectionTitle>
            {canEditFinance && (
              <Button size="sm" variant="outline" onClick={() => setNewCostOpen((v) => !v)}>
                <Plus className="h-4 w-4" /> Adicionar custo
              </Button>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-3 text-sm">
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Custos alocados ao projeto</div>
              <p className="font-semibold mt-1">{money(realized.total)}</p>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Custos pagos</div>
              <p className="font-semibold mt-1">{money(realized.paid)}</p>
            </Card>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">Custos em aberto</div>
              <p className="font-semibold mt-1">{money(realized.open)}</p>
            </Card>
          </div>

          {newCostOpen && canEditFinance && (
            <Card className="p-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="pc-desc">Descrição *</Label>
                  <Input id="pc-desc" value={costForm.description} onChange={(e) => setCostForm({ ...costForm, description: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pc-valor">Valor total (R$) *</Label>
                  <Input id="pc-valor" type="number" step="0.01" min="0" value={costForm.amount} onChange={(e) => setCostForm({ ...costForm, amount: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pc-competencia">Competência *</Label>
                  <Input id="pc-competencia" type="date" value={costForm.competence} onChange={(e) => setCostForm({ ...costForm, competence: e.target.value })} />
                </div>
                <div>
                  <Label htmlFor="pc-tipo">Tipo</Label>
                  <Select value={costForm.cost_type} onValueChange={(v) => setCostForm({ ...costForm, cost_type: v })}>
                    <SelectTrigger id="pc-tipo"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="one_off">Eventual</SelectItem>
                      <SelectItem value="recurring">Recorrente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="pc-situacao">Situação</Label>
                  <Select value={costForm.status} onValueChange={(v) => setCostForm({ ...costForm, status: v })}>
                    <SelectTrigger id="pc-situacao"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="forecast">Previsto</SelectItem>
                      <SelectItem value="open">Em aberto</SelectItem>
                      <SelectItem value="paid">Pago</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="pc-percentual">Parcela deste projeto (%)</Label>
                  <Input id="pc-percentual" type="number" min="0.01" max="100" step="0.01" value={costForm.percentage} onChange={(e) => setCostForm({ ...costForm, percentage: e.target.value })} />
                </div>
                <div className="flex items-end">
                  <p className="text-xs text-muted-foreground">
                    Use 100% para custo exclusivo. Para dividir com outros projetos, informe a parcela e conclua o rateio em Financeiro · Custos.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => createCost.mutate()} disabled={createCost.isPending}>
                  <Save className="h-4 w-4" /> Salvar custo
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNewCostOpen(false)}>
                  <X className="h-4 w-4" /> Cancelar
                </Button>
              </div>
            </Card>
          )}

          {allocations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum custo real alocado a este projeto.</p>
          ) : (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {allocations.map((a) => (
                <li key={a.id} className="break-words">
                  {a.finance_costs?.description ?? "Custo"} — parcela {Number(a.percentage)}% · {money(Number(a.amount))} ·{" "}
                  {a.finance_costs?.status === "paid"
                    ? "pago"
                    : a.finance_costs?.status === "cancelled"
                      ? "cancelado"
                      : a.finance_costs?.status === "forecast"
                        ? "previsto"
                        : "em aberto"}
                  {a.finance_costs?.competence
                    ? ` · competência ${new Date(a.finance_costs.competence + "T00:00:00").toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}`
                    : ""}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Valores estimados vêm dos serviços contratados; valores realizados vêm dos custos efetivamente registrados. Estimado não significa pago.
          </p>
        </div>
      )}

      {/* Prompts pendentes */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <SectionTitle>Prompts pendentes</SectionTitle>
          {canEditPrompts && (
            <Button size="sm" variant="outline" onClick={() => setNewPromptOpen((v) => !v)}>
              <Plus className="h-4 w-4" /> Novo prompt
            </Button>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          <Select value={promptFilterStatus} onValueChange={setPromptFilterStatus}>
            <SelectTrigger className="w-44" aria-label="Filtrar prompts por situação">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as situações</SelectItem>
              {promptStatusOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={promptFilterPlatform} onValueChange={setPromptFilterPlatform}>
            <SelectTrigger className="w-44" aria-label="Filtrar prompts por plataforma">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as plataformas</SelectItem>
              {platformSuggestions.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {newPromptOpen && (
          <Card className="p-3 space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="pp-title">Título *</Label>
                <Input id="pp-title" value={promptForm.title} onChange={(e) => setPromptForm({ ...promptForm, title: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pp-platform">Plataforma destino</Label>
                <Select value={promptForm.platform} onValueChange={(v) => setPromptForm({ ...promptForm, platform: v })}>
                  <SelectTrigger id="pp-platform">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {platformSuggestions.map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pp-status">Situação</Label>
                <Select value={promptForm.status} onValueChange={(v) => setPromptForm({ ...promptForm, status: v })}>
                  <SelectTrigger id="pp-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {promptStatusOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pp-date">Data prevista de envio</Label>
                <Input
                  id="pp-date"
                  type="date"
                  value={promptForm.planned_send_date}
                  onChange={(e) => setPromptForm({ ...promptForm, planned_send_date: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="pp-content">Conteúdo do prompt</Label>
                <Textarea id="pp-content" rows={4} value={promptForm.content} onChange={(e) => setPromptForm({ ...promptForm, content: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="pp-notes">Observações</Label>
                <Textarea id="pp-notes" rows={2} value={promptForm.notes} onChange={(e) => setPromptForm({ ...promptForm, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => setNewPromptOpen(false)}>
                Cancelar
              </Button>
              <Button size="sm" onClick={() => savePrompt.mutate()} disabled={!promptForm.title.trim() || savePrompt.isPending}>
                Salvar prompt
              </Button>
            </div>
          </Card>
        )}

        {pendingPrompts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum prompt pendente com os filtros atuais.</p>
        ) : (
          <div className="space-y-2">
            {pendingPrompts.map((p) => (
              <Card key={String(p['id'])} className="p-3 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{String(p['title'])}</span>
                  <Badge variant="secondary">{labelOf(promptStatusOptions, p['status'])}</Badge>
                  {p['platform'] ? <Badge variant="outline">{String(p['platform'])}</Badge> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {[
                    `Criado em ${dd(p['prompt_date'])}`,
                    p['planned_send_date'] ? `Previsto para ${dd(p['planned_send_date'])}` : null,
                    p['commit_ref'] ? `commit ${String(p['commit_ref'])}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                {p['content'] ? <p className="text-xs whitespace-pre-wrap break-words">{String(p['content'])}</p> : null}
                {p['notes'] ? <p className="text-xs text-muted-foreground break-words">{String(p['notes'])}</p> : null}
                {canEditPrompts && (
                  <Select value={String(p['status'])} onValueChange={(v) => changePromptStatus.mutate({ id: String(p['id']), status: v })}>
                    <SelectTrigger className="w-44 h-8" aria-label={`Alterar situação de ${String(p['title'])}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {promptStatusOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Pendências / erros */}
      <div className="space-y-2 border-t pt-4">
        <SectionTitle>Pendências e erros em aberto</SectionTitle>
        {debts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma pendência em aberto. Registre novas na aba Governança.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {debts.map((d) => (
              <li key={String(d['id'])} className="flex flex-wrap items-center gap-2">
                {d['code'] ? <Badge variant="outline">{String(d['code'])}</Badge> : null}
                <span className="break-words">{String(d['title'])}</span>
                <Badge variant="secondary">{labelOf(debtStatusLabels, d['status'])}</Badge>
                <span className="text-xs text-muted-foreground">{dd(d['identified_at'])}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Anotações e decisões de desenvolvimento ficam na aba Governança (registros de desenvolvimento e dívidas técnicas).
        </p>
      </div>
    </div>
  );
}
