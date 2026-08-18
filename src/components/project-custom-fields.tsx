import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

const sb = supabase as unknown as { from: (t: string) => any };

const fieldTypes = [
  { value: "text", label: "Texto" },
  { value: "textarea", label: "Texto longo" },
  { value: "number", label: "Número" },
  { value: "currency", label: "Moeda" },
  { value: "date", label: "Data" },
  { value: "datetime", label: "Data e hora" },
  { value: "boolean", label: "Sim/Não" },
  { value: "select", label: "Lista (opção única)" },
  { value: "url", label: "URL" },
  { value: "email", label: "E-mail" },
] as const;

interface Definition {
  id: string;
  name: string;
  field_type: string;
  required: boolean;
  active: boolean;
  position: number;
  options: string[] | null;
}

export function useCustomFieldDefinitions() {
  return useQuery({
    queryKey: ["project-field-defs"],
    queryFn: async () => {
      const { data, error } = await sb
        .from("project_custom_field_definitions")
        .select("*")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Definition[];
    },
  });
}

export function CustomFieldDefinitions() {
  const qc = useQueryClient();
  const { isOwner } = useAuth();
  const { data: defs = [] } = useCustomFieldDefinitions();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", field_type: "text", required: false, options: "" });

  const saveMut = useMutation({
    mutationFn: async () => {
      const { error } = await sb.from("project_custom_field_definitions").insert({
        name: form.name,
        field_type: form.field_type,
        required: form.required,
        position: defs.length,
        options: form.field_type === "select" ? form.options.split(",").map((s) => s.trim()).filter(Boolean) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campo criado");
      qc.invalidateQueries({ queryKey: ["project-field-defs"] });
      setOpen(false);
      setForm({ name: "", field_type: "text", required: false, options: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleMut = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await sb.from("project_custom_field_definitions").update({ active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-field-defs"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from("project_custom_field_definitions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Campo removido");
      qc.invalidateQueries({ queryKey: ["project-field-defs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!isOwner) return <p className="text-sm text-muted-foreground">Somente administradores podem configurar campos personalizados.</p>;

  return (
    <div className="space-y-3">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline"><Plus className="h-4 w-4 mr-1" />Novo campo</Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Novo campo personalizado</DialogTitle></DialogHeader>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveMut.mutate(); }}>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Tipo</Label>
              <Select value={form.field_type} onValueChange={(v) => setForm({ ...form, field_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {fieldTypes.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {form.field_type === "select" && (
              <div className="space-y-1.5">
                <Label className="text-xs">Opções (separadas por vírgula)</Label>
                <Textarea rows={2} value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Switch checked={form.required} onCheckedChange={(v) => setForm({ ...form, required: v })} />
              <Label className="text-xs">Obrigatório</Label>
            </div>
            <DialogFooter><Button type="submit" disabled={saveMut.isPending}>Criar campo</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {defs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum campo personalizado criado.</p>
      ) : (
        <ul className="space-y-2">
          {defs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
              <div>
                <span className="font-medium">{d.name}</span>
                <span className="text-muted-foreground"> · {fieldTypes.find((t) => t.value === d.field_type)?.label ?? d.field_type}{d.required ? " · obrigatório" : ""}</span>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={d.active} onCheckedChange={(v) => toggleMut.mutate({ id: d.id, active: v })} />
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { if (confirm("Excluir campo e todos os valores?")) delMut.mutate(d.id); }}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProjectCustomFieldValues({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { canEdit } = useAuth();
  const { data: defs = [] } = useCustomFieldDefinitions();
  const active = defs.filter((d) => d.active);

  const { data: values = [] } = useQuery({
    queryKey: ["project-field-values", projectId],
    queryFn: async () => {
      const { data, error } = await sb.from("project_custom_field_values").select("*").eq("project_id", projectId);
      if (error) throw error;
      return (data ?? []) as { id: string; field_definition_id: string; value: string | null }[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async ({ defId, value }: { defId: string; value: string }) => {
      const { error } = await sb
        .from("project_custom_field_values")
        .upsert({ project_id: projectId, field_definition_id: defId, value: value || null }, { onConflict: "project_id,field_definition_id" });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-field-values", projectId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (active.length === 0) {
    return (
      <p className="text-sm text-muted-foreground flex items-center gap-1.5">
        <Settings2 className="h-4 w-4" />Nenhum campo personalizado ativo.
      </p>
    );
  }

  const valueOf = (defId: string) => values.find((v) => v.field_definition_id === defId)?.value ?? "";

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {active.map((d) => (
        <CustomFieldInput
          key={d.id}
          def={d}
          value={valueOf(d.id)}
          disabled={!canEdit}
          onCommit={(v) => saveMut.mutate({ defId: d.id, value: v })}
        />
      ))}
    </div>
  );
}

function CustomFieldInput({
  def,
  value,
  disabled,
  onCommit,
}: {
  def: Definition;
  value: string;
  disabled: boolean;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const commit = () => { if (local !== value) onCommit(local); };

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{def.name}{def.required ? " *" : ""}</Label>
      {def.field_type === "textarea" ? (
        <Textarea rows={2} disabled={disabled} value={local} onChange={(e) => setLocal(e.target.value)} onBlur={commit} />
      ) : def.field_type === "boolean" ? (
        <div className="h-9 flex items-center">
          <Switch disabled={disabled} checked={local === "true"} onCheckedChange={(v) => { setLocal(String(v)); onCommit(String(v)); }} />
        </div>
      ) : def.field_type === "select" ? (
        <Select disabled={disabled} value={local} onValueChange={(v) => { setLocal(v); onCommit(v); }}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {(def.options ?? []).map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
          </SelectContent>
        </Select>
      ) : (
        <Input
          disabled={disabled}
          type={
            def.field_type === "number" || def.field_type === "currency" ? "number"
            : def.field_type === "date" ? "date"
            : def.field_type === "datetime" ? "datetime-local"
            : def.field_type === "email" ? "email" : "text"
          }
          step={def.field_type === "currency" ? "0.01" : undefined}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
        />
      )}
    </div>
  );
}
