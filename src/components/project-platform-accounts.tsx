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
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ExternalLink, LayoutGrid, Pencil, Plus, Table2, Trash2 } from "lucide-react";

const sb = supabase as unknown as { from: (t: string) => any };

export const platformOptions = ["Lovable", "ChatGPT", "Claude", "GitHub", "Supabase", "Gamma", "Outra"];

const recurrenceOptions = [
  { value: "monthly", label: "Mensal" },
  { value: "quarterly", label: "Trimestral" },
  { value: "semiannual", label: "Semestral" },
  { value: "annual", label: "Anual" },
  { value: "one_off", label: "Eventual/único" },
];

const statusOptions = [
  { value: "active", label: "Ativa" },
  { value: "inactive", label: "Inativa" },
];

const monthlyFactor: Record<string, number | null> = {
  monthly: 1,
  quarterly: 1 / 3,
  semiannual: 1 / 6,
  annual: 1 / 12,
  one_off: null,
};

const money = (v: number | null | undefined, currency = "BRL") =>
  v == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(v);
const dd = (v: unknown) => (v ? new Date(String(v) + "T00:00:00").toLocaleDateString("pt-BR") : "—");
const labelOf = (opts: { value: string; label: string }[], v: unknown) =>
  opts.find((o) => o.value === String(v))?.label ?? (v ? String(v) : "—");

export type AccountRow = {
  id: string;
  project_id: string;
  platform: string;
  url: string | null;
  username: string | null;
  email: string | null;
  notes: string | null;
  plan: string | null;
  purpose: string | null;
  amount: number | null;
  currency: string;
  recurrence: string | null;
  renews_at: string | null;
  status: string;
};

const emptyForm = {
  platform: "Lovable",
  email: "",
  username: "",
  plan: "",
  purpose: "",
  amount: "",
  currency: "BRL",
  recurrence: "monthly",
  renews_at: "",
  status: "active",
  url: "",
  notes: "",
};

export function monthlyEquivalent(row: { amount: number | null; recurrence: string | null; status: string }) {
  if (row.status !== "active" || row.amount == null || !row.recurrence) return null;
  const f = monthlyFactor[row.recurrence];
  return f == null ? null : Number(row.amount) * f;
}

export function ProjectPlatformAccounts({ projectId }: { projectId: string }) {
  const { hasPermission, isOwner, user } = useAuth();
  const canViewCredentials = isOwner || hasPermission("credentials.metadata.view");
  const canEdit = isOwner || hasPermission("credentials.metadata.edit") || hasPermission("projects.edit");
  const qc = useQueryClient();

  const [view, setView] = useState<"cards" | "table">("cards");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["project-accounts-sheet", projectId, canViewCredentials],
    enabled: canViewCredentials,
    queryFn: async () => {
      const { data, error } = await sb.from("project_accounts").select("*").eq("project_id", projectId).order("platform");
      if (error) throw error;
      return (data ?? []) as AccountRow[];
    },
  });

  const { data: lovable } = useQuery({
    queryKey: ["project-lovable-sheet", projectId],
    queryFn: async () => {
      const { data } = await sb.from("project_lovable").select("*").eq("project_id", projectId).maybeSingle();
      return (data ?? null) as Record<string, unknown> | null;
    },
  });

  const { data: repos = [] } = useQuery({
    queryKey: ["project-github-sheet", projectId],
    queryFn: async () => {
      const { data } = await sb.from("project_github_repos").select("*").eq("project_id", projectId);
      return (data ?? []) as Record<string, unknown>[];
    },
  });

  const { data: credits = [] } = useQuery({
    queryKey: ["project-credits-sheet", projectId],
    queryFn: async () => {
      const { data } = await sb.from("project_credits").select("amount").eq("project_id", projectId);
      return (data ?? []) as { amount: number }[];
    },
  });

  const creditTotal = useMemo(() => credits.reduce((s, c) => s + Number(c.amount ?? 0), 0), [credits]);

  const totalMonthly = useMemo(
    () => accounts.reduce((s, a) => s + (monthlyEquivalent(a) ?? 0), 0),
    [accounts],
  );

  const lovableAccount = accounts.find((a) => a.platform.toLowerCase() === "lovable") ?? null;

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!form.platform.trim()) throw new Error("Informe a plataforma.");
      if (form.amount !== "" && !(Number(form.amount) >= 0)) throw new Error("Informe um custo válido.");
      const payload = {
        platform: form.platform.trim(),
        email: form.email || null,
        username: form.username || null,
        plan: form.plan || null,
        purpose: form.purpose || null,
        amount: form.amount === "" ? null : Number(form.amount),
        currency: (form.currency || "BRL").toUpperCase().slice(0, 3),
        recurrence: form.recurrence || null,
        renews_at: form.renews_at || null,
        status: form.status,
        url: form.url || null,
        notes: form.notes || null,
      };
      if (editingId) {
        const { error } = await sb.from("project_accounts").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await sb
          .from("project_accounts")
          .insert({ ...payload, project_id: projectId, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Plataforma salva");
      setOpen(false);
      reset();
      qc.invalidateQueries({ queryKey: ["project-accounts-sheet", projectId] });
      qc.invalidateQueries({ queryKey: ["project-platforms", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("project_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Plataforma removida");
      qc.invalidateQueries({ queryKey: ["project-accounts-sheet", projectId] });
      qc.invalidateQueries({ queryKey: ["project-platforms", projectId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (a: AccountRow) => {
    setEditingId(a.id);
    setForm({
      platform: a.platform,
      email: a.email ?? "",
      username: a.username ?? "",
      plan: a.plan ?? "",
      purpose: a.purpose ?? "",
      amount: a.amount == null ? "" : String(a.amount),
      currency: a.currency ?? "BRL",
      recurrence: a.recurrence ?? "monthly",
      renews_at: a.renews_at ?? "",
      status: a.status ?? "active",
      url: a.url ?? "",
      notes: a.notes ?? "",
    });
    setOpen(true);
  };

  const quickAdd = (platform: string) => {
    reset();
    setForm({ ...emptyForm, platform });
    setOpen(true);
  };

  if (!canViewCredentials) {
    return (
      <div className="space-y-2 border-t pt-4">
        <h4 className="text-sm font-semibold">Plataformas e contas</h4>
        <p className="text-sm text-muted-foreground">
          Você não possui permissão para visualizar contas e acessos deste projeto.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h4 className="text-sm font-semibold">Plataformas e contas</h4>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            aria-label={view === "cards" ? "Ver como tabela" : "Ver como cards"}
            onClick={() => setView(view === "cards" ? "table" : "cards")}
          >
            {view === "cards" ? <Table2 className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            {view === "cards" ? "Tabela" : "Cards"}
          </Button>
          {canEdit && (
            <Button size="sm" onClick={() => quickAdd("Lovable")}>
              <Plus className="h-4 w-4" /> Nova plataforma
            </Button>
          )}
        </div>
      </div>

      {canEdit && (
        <div className="flex gap-2 flex-wrap">
          {platformOptions.map((p) => (
            <Button key={p} size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => quickAdd(p)}>
              + {p}
            </Button>
          ))}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3">
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Custo mensal das plataformas</div>
          <p className="text-lg font-semibold mt-1">{money(totalMonthly)}</p>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Plataformas ativas</div>
          <p className="text-lg font-semibold mt-1">{accounts.filter((a) => a.status === "active").length}</p>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-muted-foreground">Créditos registrados</div>
          <p className="text-lg font-semibold mt-1">{money(creditTotal)}</p>
        </Card>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma plataforma registrada neste projeto.</p>
      ) : view === "table" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="text-left text-xs text-muted-foreground border-b">
                <th className="py-2 pr-3">Plataforma</th>
                <th className="py-2 pr-3">Conta/e-mail</th>
                <th className="py-2 pr-3">Login</th>
                <th className="py-2 pr-3">Plano</th>
                <th className="py-2 pr-3">Custo</th>
                <th className="py-2 pr-3">Periodicidade</th>
                <th className="py-2 pr-3">Renovação</th>
                <th className="py-2 pr-3">Situação</th>
                <th className="py-2 pr-3">URL</th>
                <th className="py-2 pr-3">Credencial</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b last:border-0 align-top">
                  <td className="py-2 pr-3 font-medium">{a.platform}</td>
                  <td className="py-2 pr-3 break-all">{a.email || "—"}</td>
                  <td className="py-2 pr-3 break-all">{a.username || "—"}</td>
                  <td className="py-2 pr-3">{a.plan || "—"}</td>
                  <td className="py-2 pr-3">{money(a.amount, a.currency)}</td>
                  <td className="py-2 pr-3">{labelOf(recurrenceOptions, a.recurrence)}</td>
                  <td className="py-2 pr-3">{dd(a.renews_at)}</td>
                  <td className="py-2 pr-3">
                    <Badge variant={a.status === "active" ? "secondary" : "outline"}>{labelOf(statusOptions, a.status)}</Badge>
                  </td>
                  <td className="py-2 pr-3">
                    {a.url ? (
                      <a className="text-primary underline break-all" href={a.url} target="_blank" rel="noreferrer">
                        abrir
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-2 pr-3 text-xs text-muted-foreground">Não cadastrada / Cofre pendente</td>
                  <td className="py-2">
                    {canEdit && (
                      <div className="flex gap-1">
                        <Button size="icon" variant="ghost" aria-label={`Editar ${a.platform}`} onClick={() => startEdit(a)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" aria-label={`Remover ${a.platform}`} onClick={() => remove.mutate(a.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {accounts.map((a) => (
            <Card key={a.id} className="p-3 text-sm space-y-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-medium">{a.platform}</span>
                <div className="flex items-center gap-1">
                  <Badge variant={a.status === "active" ? "secondary" : "outline"}>{labelOf(statusOptions, a.status)}</Badge>
                  {canEdit && (
                    <>
                      <Button size="icon" variant="ghost" aria-label={`Editar ${a.platform}`} onClick={() => startEdit(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" aria-label={`Remover ${a.platform}`} onClick={() => remove.mutate(a.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1 text-xs">
                <div><span className="text-muted-foreground">Conta: </span><span className="break-all">{a.email || "—"}</span></div>
                <div><span className="text-muted-foreground">Login: </span><span className="break-all">{a.username || "—"}</span></div>
                <div><span className="text-muted-foreground">Plano: </span>{a.plan || "—"}</div>
                <div><span className="text-muted-foreground">Custo: </span>{money(a.amount, a.currency)}</div>
                <div><span className="text-muted-foreground">Periodicidade: </span>{labelOf(recurrenceOptions, a.recurrence)}</div>
                <div><span className="text-muted-foreground">Renovação: </span>{dd(a.renews_at)}</div>
                <div><span className="text-muted-foreground">Mensal equivalente: </span>{money(monthlyEquivalent(a))}</div>
                <div><span className="text-muted-foreground">Credencial: </span>Não cadastrada / Cofre pendente</div>
              </div>
              {a.url && (
                <a className="text-xs text-primary underline break-all inline-flex items-center gap-1" href={a.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3 w-3" /> {a.url}
                </a>
              )}
              {a.purpose && <p className="text-xs text-muted-foreground break-words">Finalidade: {a.purpose}</p>}
              {a.notes && <p className="text-xs text-muted-foreground break-words">{a.notes}</p>}
            </Card>
          ))}
        </div>
      )}

      {/* Lovable consolidado */}
      <Card className="p-3 text-sm space-y-1">
        <div className="font-medium">Lovable — detalhes do projeto</div>
        <div className="grid gap-1 sm:grid-cols-2 text-xs">
          <div><span className="text-muted-foreground">Conta/e-mail: </span>{String(lovable?.['account_email'] ?? lovableAccount?.email ?? "—")}</div>
          <div><span className="text-muted-foreground">Login: </span>{lovableAccount?.username || "—"}</div>
          <div><span className="text-muted-foreground">Workspace: </span>{String(lovable?.['workspace'] ?? "—")}</div>
          <div><span className="text-muted-foreground">Plano: </span>{lovableAccount?.plan || "—"}</div>
          <div><span className="text-muted-foreground">Custo: </span>{money(lovableAccount?.amount ?? null, lovableAccount?.currency ?? "BRL")}</div>
          <div><span className="text-muted-foreground">Periodicidade: </span>{labelOf(recurrenceOptions, lovableAccount?.recurrence)}</div>
          <div><span className="text-muted-foreground">Próxima renovação: </span>{dd(lovableAccount?.renews_at)}</div>
          <div><span className="text-muted-foreground">Créditos: </span>{money(creditTotal)}</div>
          <div><span className="text-muted-foreground">Situação: </span>{labelOf(statusOptions, lovableAccount?.status)}</div>
          <div><span className="text-muted-foreground">Credencial: </span>Não cadastrada / Cofre pendente</div>
        </div>
        <div className="flex flex-wrap gap-3">
          {lovable?.['project_url'] ? (
            <a className="text-xs text-primary underline break-all" href={String(lovable['project_url'])} target="_blank" rel="noreferrer">
              URL do projeto
            </a>
          ) : null}
          {lovable?.['public_url'] ? (
            <a className="text-xs text-primary underline break-all" href={String(lovable['public_url'])} target="_blank" rel="noreferrer">
              URL publicada
            </a>
          ) : null}
        </div>
        {canEdit && (
          <Button
            size="sm"
            variant="outline"
            className="mt-1"
            onClick={() => (lovableAccount ? startEdit(lovableAccount) : quickAdd("Lovable"))}
          >
            <Pencil className="h-4 w-4" /> Editar dados comerciais do Lovable
          </Button>
        )}
      </Card>

      {/* GitHub e infraestrutura */}
      <Card className="p-3 text-sm space-y-1">
        <div className="font-medium">GitHub e infraestrutura</div>
        {repos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhum repositório registrado. Cadastre na aba de repositórios do dossiê.</p>
        ) : (
          repos.map((g) => (
            <div key={String(g['id'])} className="grid gap-1 sm:grid-cols-2 text-xs">
              <div><span className="text-muted-foreground">Organização/conta: </span>{String(g['owner'] ?? "—")}</div>
              <div><span className="text-muted-foreground">Repositório: </span>{String(g['repo_name'] ?? "—")}</div>
              <div><span className="text-muted-foreground">Branch: </span>{String(g['default_branch'] ?? "—")}</div>
              <div><span className="text-muted-foreground">Situação: </span>{String(g['status'] ?? "—")}</div>
              {g['url'] ? (
                <a className="text-primary underline break-all sm:col-span-2" href={String(g['url'])} target="_blank" rel="noreferrer">
                  {String(g['url'])}
                </a>
              ) : null}
            </div>
          ))
        )}
        {accounts
          .filter((a) => ["supabase", "github"].includes(a.platform.toLowerCase()))
          .map((a) => (
            <p key={a.id} className="text-xs text-muted-foreground break-words">
              {a.platform}: {a.email || a.username || "conta não informada"}
              {a.plan ? ` · plano ${a.plan}` : ""}
              {a.url ? " · " : ""}
              {a.url ? (
                <a className="text-primary underline break-all" href={a.url} target="_blank" rel="noreferrer">
                  {a.url}
                </a>
              ) : null}
            </p>
          ))}
      </Card>

      <p className="text-xs text-muted-foreground">
        Senhas não são armazenadas no sistema. Registre apenas conta, login e finalidade; o cofre de credenciais está pendente.
      </p>

      <Dialog
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v) reset();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar" : "Nova"} plataforma/conta</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pa-plataforma">Plataforma *</Label>
                <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                  <SelectTrigger id="pa-plataforma"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {platformOptions.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pa-situacao">Situação</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger id="pa-situacao"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {statusOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pa-email">Conta/e-mail</Label>
                <Input id="pa-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pa-login">Login/usuário</Label>
                <Input id="pa-login" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label htmlFor="pa-plano">Plano</Label>
                <Input id="pa-plano" value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pa-custo">Custo</Label>
                <Input id="pa-custo" type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="pa-moeda">Moeda</Label>
                <Input id="pa-moeda" maxLength={3} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="pa-periodicidade">Periodicidade</Label>
                <Select value={form.recurrence} onValueChange={(v) => setForm({ ...form, recurrence: v })}>
                  <SelectTrigger id="pa-periodicidade"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {recurrenceOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="pa-renovacao">Próxima renovação</Label>
                <Input id="pa-renovacao" type="date" value={form.renews_at} onChange={(e) => setForm({ ...form, renews_at: e.target.value })} />
              </div>
            </div>
            <div>
              <Label htmlFor="pa-url">URL</Label>
              <Input id="pa-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="pa-finalidade">Finalidade</Label>
              <Input id="pa-finalidade" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="pa-obs">Observações</Label>
              <Textarea id="pa-obs" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Não registre senhas, tokens ou chaves de acesso.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
