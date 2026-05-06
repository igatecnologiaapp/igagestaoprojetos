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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/externals")({
  component: () => <RequireAuth><ExternalsPage /></RequireAuth>,
  head: () => ({ meta: [{ title: "Colaboradores externos — FlowDesk" }] }),
});

type Role = "owner" | "collaborator" | "viewer";
const roleLabels: Record<Role, string> = { owner: "Administrador", collaborator: "Colaborador", viewer: "Visualizador" };

function ExternalsPage() {
  const { canEdit, isOwner } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "viewer" as Role });

  const { data: list = [], isLoading } = useQuery({
    queryKey: ["externals"],
    queryFn: async () => (await supabase.from("external_collaborators").select("*").order("name")).data ?? [],
  });

  const reset = () => { setForm({ name: "", email: "", phone: "", role: "viewer" }); setEditingId(null); };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (editingId) {
        const { error } = await supabase.from("external_collaborators").update(form).eq("id", editingId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("external_collaborators").insert(form);
        if (error) throw error;
      }
    },
    onSuccess: () => { toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["externals"] }); setOpen(false); reset(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("external_collaborators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["externals"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Colaboradores externos</h1>
          <p className="text-sm text-muted-foreground">Pessoas sem acesso ao sistema disponíveis para compartilhamento.</p>
        </div>
        {canEdit && (
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button onClick={reset}><Plus className="h-4 w-4" /> Novo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editingId ? "Editar" : "Novo"} externo</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>E-mail</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
                <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div>
                  <Label>Papel</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as Role })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.entries(roleLabels) as [Role, string][]).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button onClick={() => saveMut.mutate()} disabled={!form.name || !form.email || saveMut.isPending}>Salvar</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {isLoading ? <p className="text-muted-foreground">Carregando…</p> : (
        <div className="grid gap-3">
          {list.length === 0 && <p className="text-sm text-muted-foreground">Nenhum colaborador externo.</p>}
          {list.map((e) => (
            <Card key={e.id} className="p-4 flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-medium">{e.name}</div>
                <div className="text-xs text-muted-foreground">{e.email}{e.phone ? ` · ${e.phone}` : ""}</div>
                <Badge variant="secondary" className="mt-1">{roleLabels[e.role as Role]}</Badge>
              </div>
              {canEdit && (
                <div className="flex gap-1">
                  <Button size="icon" variant="ghost" onClick={() => {
                    setEditingId(e.id);
                    setForm({ name: e.name, email: e.email, phone: e.phone ?? "", role: e.role as Role });
                    setOpen(true);
                  }}><Pencil className="h-4 w-4" /></Button>
                  {isOwner && (
                    <Button size="icon" variant="ghost" onClick={() => { if (confirm("Remover?")) deleteMut.mutate(e.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
