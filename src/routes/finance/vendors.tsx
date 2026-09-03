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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/finance/vendors")({
  component: () => (
    <RequireAuth>
      <VendorsPage />
    </RequireAuth>
  ),
  head: () => ({
    meta: [
      { title: "Fornecedores de tecnologia — IGA Tecnologia" },
      { name: "description", content: "Cadastro de fornecedores de serviços e recursos tecnológicos da IGA Tecnologia." },
      { property: "og:title", content: "Fornecedores de tecnologia — IGA Tecnologia" },
      { property: "og:description", content: "Cadastro de fornecedores de serviços e recursos tecnológicos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Status = "active" | "inactive";
const emptyForm = {
  name: "",
  legal_name: "",
  document: "",
  website: "",
  contact_name: "",
  contact_email: "",
  contact_phone: "",
  default_currency: "BRL",
  status: "active" as Status,
  notes: "",
};

function VendorsPage() {
  const { hasPermission, user } = useAuth();
  const canView = hasPermission("financial.view");
  const canEditFinance = hasPermission("financial.edit");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");

  const { data: list = [], isLoading } = useQuery({
    queryKey: ["finance_vendors"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("finance_vendors").select("*").order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(
    () => list.filter((v) => v.name.toLowerCase().includes(search.trim().toLowerCase())),
    [list, search],
  );

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        legal_name: form.legal_name || null,
        document: form.document || null,
        website: form.website || null,
        contact_name: form.contact_name || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        default_currency: form.default_currency.toUpperCase(),
        status: form.status,
        notes: form.notes || null,
      };
      if (editingId) {
        const { error } = await supabase.from("finance_vendors").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("finance_vendors").insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Fornecedor salvo");
      qc.invalidateQueries({ queryKey: ["finance_vendors"] });
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase.from("finance_vendors").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance_vendors"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canView) {
    return <p className="text-sm text-muted-foreground">Você não possui permissão para visualizar dados financeiros.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">Fornecedores de plataformas, infraestrutura e serviços técnicos.</p>
        </div>
        {canEditFinance && (
          <Button
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Novo fornecedor
          </Button>
        )}
      </div>

      <Input placeholder="Buscar fornecedor…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />

      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">Nenhum fornecedor cadastrado.</Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((v) => (
            <Card key={v.id} className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  {v.name}
                  <Badge variant={v.status === "active" ? "secondary" : "outline"}>
                    {v.status === "active" ? "Ativo" : "Inativo"}
                  </Badge>
                  <Badge variant="outline">{v.default_currency}</Badge>
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {[v.legal_name, v.document, v.contact_email, v.website].filter(Boolean).join(" · ") || "Sem dados adicionais"}
                </div>
              </div>
              {canEditFinance && (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => toggleMut.mutate({ id: v.id, status: v.status === "active" ? "inactive" : "active" })}
                  >
                    {v.status === "active" ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${v.name}`}
                    onClick={() => {
                      setEditingId(v.id);
                      setForm({
                        name: v.name,
                        legal_name: v.legal_name ?? "",
                        document: v.document ?? "",
                        website: v.website ?? "",
                        contact_name: v.contact_name ?? "",
                        contact_email: v.contact_email ?? "",
                        contact_phone: v.contact_phone ?? "",
                        default_currency: v.default_currency,
                        status: v.status as Status,
                        notes: v.notes ?? "",
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
            <DialogTitle>{editingId ? "Editar" : "Novo"} fornecedor</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Razão social</Label>
              <Input value={form.legal_name} onChange={(e) => setForm({ ...form, legal_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Documento</Label>
                <Input value={form.document} onChange={(e) => setForm({ ...form, document: e.target.value })} />
              </div>
              <div>
                <Label>Moeda padrão</Label>
                <Input maxLength={3} value={form.default_currency} onChange={(e) => setForm({ ...form, default_currency: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Site</Label>
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Contato</Label>
                <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={form.contact_phone} onChange={(e) => setForm({ ...form, contact_phone: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>E-mail</Label>
              <Input type="email" value={form.contact_email} onChange={(e) => setForm({ ...form, contact_email: e.target.value })} />
            </div>
            <div>
              <Label>Situação</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="inactive">Inativo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              <p className="text-xs text-muted-foreground mt-1">Não registre senhas, tokens ou chaves de acesso.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={!form.name.trim() || saveMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
