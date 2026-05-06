import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Search, Building2, Trash2, Eye, FolderKanban, ListChecks, Calendar, ExternalLink, ChevronRight, Pencil } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/companies")({
  component: () => <RequireAuth><CompaniesPage /></RequireAuth>,
  head: () => ({ meta: [{ title: "Empresas — FlowDesk" }] }),
});

type CompanyForm = {
  name: string; cnpj: string; contact_name: string; contact_phone: string; contact_email: string;
  address: string; neighborhood: string; zip_code: string; city: string; state: string;
  status: "active" | "inactive";
};

const empty: CompanyForm = {
  name: "", cnpj: "", contact_name: "", contact_phone: "", contact_email: "",
  address: "", neighborhood: "", zip_code: "", city: "", state: "", status: "active",
};

function CompaniesPage() {
  const qc = useQueryClient();
  const { canEdit, isOwner } = useAuth();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [form, setForm] = useState<CompanyForm>(empty);

  const { data: companies = [], isLoading } = useQuery({
    queryKey: ["companies"],
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const saveMut = useMutation({
    mutationFn: async (payload: CompanyForm) => {
      const data = { ...payload, cnpj: payload.cnpj || null };
      if (editingId) {
        const { error } = await supabase.from("companies").update(data).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("companies").insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Empresa atualizada" : "Empresa cadastrada");
      qc.invalidateQueries({ queryKey: ["companies"] });
      qc.invalidateQueries({ queryKey: ["company-detail"] });
      setForm(empty); setOpen(false); setEditingId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (c: typeof companies[number]) => {
    setEditingId(c.id);
    setForm({
      name: c.name, cnpj: c.cnpj ?? "", contact_name: c.contact_name ?? "",
      contact_phone: c.contact_phone ?? "", contact_email: c.contact_email ?? "",
      address: c.address ?? "", neighborhood: c.neighborhood ?? "", zip_code: c.zip_code ?? "",
      city: c.city ?? "", state: c.state ?? "", status: c.status as "active" | "inactive",
    });
    setOpen(true);
  };

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("companies").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Empresa removida"); qc.invalidateQueries({ queryKey: ["companies"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const filtered = companies.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.contact_name ?? "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-display font-semibold">Empresas</h1>
          <p className="text-muted-foreground mt-1">Gerencie seus clientes</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setEditingId(null); setForm(empty); } }}>
            <DialogTrigger asChild><Button onClick={() => { setEditingId(null); setForm(empty); }}><Plus className="h-4 w-4 mr-1" />Nova empresa</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>{editingId ? "Editar empresa" : "Nova empresa"}</DialogTitle></DialogHeader>
              <form
                className="grid gap-4 sm:grid-cols-2"
                onSubmit={(e) => { e.preventDefault(); saveMut.mutate(form); }}
              >
                <Field label="Nome *" className="sm:col-span-2"><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
                <Field label="CNPJ"><Input value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} /></Field>
                <Field label="Status">
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as "active" | "inactive" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Ativa</SelectItem>
                      <SelectItem value="inactive">Inativa</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Contato"><Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} /></Field>
                <Field label="Telefone"><Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} placeholder="(00) 00000-0000" /></Field>
                <Field label="Email" className="sm:col-span-2"><Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} /></Field>
                <Field label="Endereço" className="sm:col-span-2"><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></Field>
                <Field label="Bairro"><Input value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} /></Field>
                <Field label="CEP"><Input value={form.zip_code} onChange={(e) => setForm({ ...form, zip_code: e.target.value })} /></Field>
                <Field label="Cidade"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
                <Field label="UF"><Input maxLength={2} value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })} /></Field>
                <DialogFooter className="sm:col-span-2">
                  <Button type="submit" disabled={saveMut.isPending}>{editingId ? "Salvar alterações" : "Salvar"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar empresas…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Carregando…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Building2 className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">Nenhuma empresa cadastrada ainda</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <Card key={c.id} className="p-5 group hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-display font-semibold truncate">{c.name}</h3>
                  <p className="text-sm text-muted-foreground truncate">{c.contact_name ?? "—"}</p>
                </div>
                <Badge variant={c.status === "active" ? "default" : "secondary"}>
                  {c.status === "active" ? "Ativa" : "Inativa"}
                </Badge>
              </div>
              <div className="text-xs text-muted-foreground mt-3 space-y-1">
                {c.contact_email && <div>{c.contact_email}</div>}
                {c.contact_phone && <div>{c.contact_phone}</div>}
                {(c.city || c.state) && <div>{[c.city, c.state].filter(Boolean).join(" / ")}</div>}
              </div>
              <div className="mt-4 flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button size="sm" variant="ghost" onClick={() => setViewId(c.id)}>
                  <Eye className="h-4 w-4 mr-1" />Detalhes
                </Button>
                {canEdit && (
                  <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                )}
                {isOwner && (
                  <Button size="sm" variant="ghost" onClick={() => { if (confirm("Excluir empresa?")) deleteMut.mutate(c.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <CompanyDetailDialog companyId={viewId} onClose={() => setViewId(null)} />
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`space-y-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function CompanyDetailDialog({ companyId, onClose }: { companyId: string | null; onClose: () => void }) {
  const { data: company } = useQuery({
    queryKey: ["company-detail", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("companies").select("*").eq("id", companyId!).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: projects = [] } = useQuery({
    queryKey: ["company-projects", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, status, start_date, end_date, tasks(id, name, status, due_date, priority)")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <Dialog open={!!companyId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            {company?.name ?? "Empresa"}
          </DialogTitle>
        </DialogHeader>
        {company && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              {company.cnpj && <Info label="CNPJ" value={company.cnpj} />}
              {company.contact_name && <Info label="Contato" value={company.contact_name} />}
              {company.contact_phone && <Info label="Telefone" value={company.contact_phone} />}
              {company.contact_email && <Info label="Email" value={company.contact_email} />}
              {(company.city || company.state) && <Info label="Localização" value={[company.city, company.state].filter(Boolean).join(" / ")} />}
              <Info label="Status" value={company.status === "active" ? "Ativa" : "Inativa"} />
            </div>

            <section className="border-t pt-4">
              <h3 className="text-sm font-medium mb-3 flex items-center gap-1.5">
                <FolderKanban className="h-4 w-4" />
                Projetos ({projects.length})
              </h3>
              {projects.length === 0 ? (
                <p className="text-xs text-muted-foreground">Nenhum projeto vinculado</p>
              ) : (
                <div className="space-y-3">
                  {projects.map((p) => {
                    const tasks = (p.tasks as Array<{ id: string; name: string; status: string; due_date: string | null; priority: string }> | null) ?? [];
                    return (
                      <div key={p.id} className="border rounded-md p-3 bg-muted/30">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{p.name}</div>
                            <div className="text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-[10px] mr-1.5">{p.status}</Badge>
                              {p.start_date && new Date(p.start_date).toLocaleDateString("pt-BR")}
                              {p.end_date && ` → ${new Date(p.end_date).toLocaleDateString("pt-BR")}`}
                            </div>
                          </div>
                          <Button size="sm" variant="ghost" asChild>
                            <Link to="/tasks" search={{ project: p.id }}>
                              Ver tarefas <ChevronRight className="h-3.5 w-3.5" />
                            </Link>
                          </Button>
                        </div>
                        {tasks.length > 0 && (
                          <ul className="mt-2 space-y-1 pl-2 border-l-2 border-border">
                            {tasks.slice(0, 5).map((t) => (
                              <li key={t.id} className="flex items-center justify-between gap-2 text-xs py-1">
                                <span className="flex items-center gap-1.5 truncate">
                                  <ListChecks className="h-3 w-3 shrink-0 text-muted-foreground" />
                                  <span className="truncate">{t.name}</span>
                                </span>
                                <span className="flex items-center gap-1.5 shrink-0 text-muted-foreground">
                                  <Badge variant="secondary" className="text-[10px] py-0 h-4">{t.status}</Badge>
                                  {t.due_date && <span>{new Date(t.due_date).toLocaleDateString("pt-BR")}</span>}
                                </span>
                              </li>
                            ))}
                            {tasks.length > 5 && (
                              <li className="text-[10px] text-muted-foreground pt-1">+ {tasks.length - 5} tarefas</li>
                            )}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="border-t pt-4">
              <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                <Calendar className="h-4 w-4" />
                Agendamentos
              </h3>
              <p className="text-xs text-muted-foreground">
                Módulo de agendamentos ainda não disponível. Solicite a criação para habilitar esta seção.
              </p>
            </section>

            <DialogFooter>
              <Button variant="outline" asChild>
                <Link to="/projects">
                  <ExternalLink className="h-4 w-4 mr-1" />Ver todos os projetos
                </Link>
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
