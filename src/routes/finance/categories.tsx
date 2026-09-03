import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RequireAuth } from "@/components/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/finance/categories")({
  component: () => (
    <RequireAuth>
      <CategoriesPage />
    </RequireAuth>
  ),
  head: () => ({
    meta: [
      { title: "Categorias financeiras — IGA Tecnologia" },
      { name: "description", content: "Classificação dos custos tecnológicos por categoria na IGA Tecnologia." },
      { property: "og:title", content: "Categorias financeiras — IGA Tecnologia" },
      { property: "og:description", content: "Classificação dos custos tecnológicos por categoria." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const kinds = [
  { value: "infra", label: "Infraestrutura" },
  { value: "dev", label: "Desenvolvimento" },
  { value: "ai", label: "Inteligência artificial" },
  { value: "service", label: "Serviços" },
  { value: "other", label: "Outros" },
];

const slugify = (v: string) =>
  v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const emptyForm = { name: "", slug: "", parent_id: "none", kind: "other", position: "0", active: true };

function CategoriesPage() {
  const { hasPermission, user } = useAuth();
  const canView = hasPermission("financial.view");
  const canEditFinance = hasPermission("financial.edit");
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: list = [], isLoading } = useQuery({
    queryKey: ["finance_categories"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("finance_categories").select("*").order("position").order("name");
      if (error) throw error;
      return data;
    },
  });

  const reset = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        slug: (form.slug || slugify(form.name)).trim(),
        parent_id: form.parent_id === "none" ? null : form.parent_id,
        kind: form.kind,
        position: Number(form.position) || 0,
        active: form.active,
      };
      if (editingId) {
        const { error } = await supabase.from("finance_categories").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("finance_categories").insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Categoria salva");
      qc.invalidateQueries({ queryKey: ["finance_categories"] });
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from("finance_categories").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["finance_categories"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canView) {
    return <p className="text-sm text-muted-foreground">Você não possui permissão para visualizar dados financeiros.</p>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Categorias financeiras</h1>
          <p className="text-sm text-muted-foreground">Classificação dos custos tecnológicos.</p>
        </div>
        {canEditFinance && (
          <Button
            onClick={() => {
              reset();
              setOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> Nova categoria
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : list.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">Nenhuma categoria cadastrada.</Card>
      ) : (
        <div className="grid gap-3">
          {list.map((c) => (
            <Card key={c.id} className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2 flex-wrap">
                  {c.name}
                  <Badge variant={c.active ? "secondary" : "outline"}>{c.active ? "Ativa" : "Inativa"}</Badge>
                  <Badge variant="outline">{kinds.find((k) => k.value === c.kind)?.label ?? c.kind}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">
                  {c.slug}
                  {c.parent_id ? ` · sub de ${list.find((p) => p.id === c.parent_id)?.name ?? "—"}` : ""}
                </div>
              </div>
              {canEditFinance && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => toggleMut.mutate({ id: c.id, active: !c.active })}>
                    {c.active ? "Desativar" : "Ativar"}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Editar ${c.name}`}
                    onClick={() => {
                      setEditingId(c.id);
                      setForm({
                        name: c.name,
                        slug: c.slug,
                        parent_id: c.parent_id ?? "none",
                        kind: c.kind,
                        position: String(c.position),
                        active: c.active,
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
            <DialogTitle>{editingId ? "Editar" : "Nova"} categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Slug</Label>
              <Input
                placeholder={slugify(form.name) || "identificador-unico"}
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tipo</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {kinds.map((k) => (
                      <SelectItem key={k.value} value={k.value}>
                        {k.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Posição</Label>
                <Input type="number" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Categoria pai</Label>
              <Select value={form.parent_id} onValueChange={(v) => setForm({ ...form, parent_id: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {list
                    .filter((c) => c.id !== editingId)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
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
