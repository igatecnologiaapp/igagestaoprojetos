import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

// Generic Supabase accessor for the dynamic project child tables.
const sb = supabase as unknown as {
  from: (t: string) => {
    select: (s: string) => any;
    insert: (v: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
    update: (v: Record<string, unknown>) => any;
    delete: () => any;
  };
};

export type FieldType = "text" | "textarea" | "date" | "number" | "url" | "email" | "select";

export interface FieldDef {
  key: string;
  label: string;
  type?: FieldType;
  options?: { value: string; label: string }[];
  required?: boolean;
  full?: boolean;
}

export type RecordRow = Record<string, unknown> & { id: string };

interface RecordSectionProps {
  table: string;
  projectId: string;
  fields: FieldDef[];
  addLabel: string;
  emptyLabel: string;
  orderBy?: { column: string; ascending?: boolean };
  render: (row: RecordRow) => React.ReactNode;
  canManage?: boolean;
  /** Campo usado para filtrar/agrupar visualmente a lista (ex.: category). */
  filterKey?: string;
  filterLabel?: string;
}

export function ExternalUrl({ url, label }: { url?: string | null; label?: string }) {
  if (!url) return <span className="text-muted-foreground">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-primary hover:underline break-all"
    >
      {label ?? url}
      <ExternalLink className="h-3 w-3 shrink-0" />
    </a>
  );
}

export function RecordSection({
  table,
  projectId,
  fields,
  addLabel,
  emptyLabel,
  orderBy = { column: "created_at", ascending: false },
  render,
  canManage: canManageProp,
  filterKey,
  filterLabel = "Categoria",
}: RecordSectionProps) {
  const qc = useQueryClient();
  const { canEdit } = useAuth();
  const canManage = canManageProp ?? canEdit;
  const [filterValue, setFilterValue] = useState("__all");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const empty = Object.fromEntries(fields.map((f) => [f.key, ""])) as Record<string, string>;
  const [form, setForm] = useState<Record<string, string>>(empty);

  const queryKey = ["project-records", table, projectId];
  const { data: rows = [], isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await sb
        .from(table)
        .select("*")
        .eq("project_id", projectId)
        .order(orderBy.column, { ascending: orderBy.ascending ?? false });
      if (error) throw error;
      return (data ?? []) as RecordRow[];
    },
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey });
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["project-detail", projectId] });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = { project_id: projectId };
      for (const f of fields) {
        const v = form[f.key]?.trim() ?? "";
        payload[f.key] = v === "" ? null : f.type === "number" ? Number(v) : v;
      }
      if (editingId) {
        delete payload['project_id'];
        const { error } = await sb.from(table).update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        payload['created_by'] = u.user?.id ?? null;
        const { error } = await sb.from(table).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingId ? "Registro atualizado" : "Registro adicionado");
      invalidate();
      setOpen(false);
      setEditingId(null);
      setForm(empty);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Registro removido");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openEdit = (row: RecordRow) => {
    setEditingId(row.id);
    setForm(
      Object.fromEntries(
        fields.map((f) => [f.key, row[f.key] == null ? "" : String(row[f.key])]),
      ) as Record<string, string>,
    );
    setOpen(true);
  };

  const filterValues = filterKey
    ? Array.from(new Set(rows.map((r) => (r[filterKey] == null || r[filterKey] === "" ? "Outros" : String(r[filterKey]))))).sort((a, b) => a.localeCompare(b, "pt-BR"))
    : [];
  const visibleRows = filterKey && filterValue !== "__all"
    ? rows.filter((r) => (r[filterKey] == null || r[filterKey] === "" ? "Outros" : String(r[filterKey])) === filterValue)
    : rows;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
      {canManage && (
        <Dialog
          open={open}
          onOpenChange={(o) => {
            setOpen(o);
            if (!o) {
              setEditingId(null);
              setForm(empty);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setForm(empty); }}>
              <Plus className="h-4 w-4 mr-1" />
              {addLabel}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar registro" : addLabel}</DialogTitle>
            </DialogHeader>
            <form
              className="grid grid-cols-2 gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                saveMut.mutate();
              }}
            >
              {fields.map((f) => (
                <div key={f.key} className={`space-y-1.5 ${f.full || f.type === "textarea" ? "col-span-2" : ""}`}>
                  <Label className="text-xs">{f.label}{f.required ? " *" : ""}</Label>
                  {f.type === "textarea" ? (
                    <Textarea rows={3} required={f.required} value={form[f.key] ?? ""} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} />
                  ) : f.type === "select" ? (
                    <Select value={form[f.key] ?? ""} onValueChange={(v) => setForm({ ...form, [f.key]: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>
                        {(f.options ?? []).map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "email" ? "email" : "text"}
                      step={f.type === "number" ? "0.01" : undefined}
                      required={f.required}
                      value={form[f.key] ?? ""}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                    />
                  )}
                </div>
              ))}
              <DialogFooter className="col-span-2">
                <Button type="submit" disabled={saveMut.isPending}>{editingId ? "Salvar" : "Adicionar"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {filterKey && filterValues.length > 1 && (
        <Select value={filterValue} onValueChange={setFilterValue}>
          <SelectTrigger className="h-9 w-[190px]">
            <SelectValue placeholder={filterLabel} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todas as categorias</SelectItem>
            {filterValues.map((v) => (
              <SelectItem key={v} value={v}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      {filterKey && rows.length > 0 && (
        <span className="text-xs text-muted-foreground ml-auto">
          {visibleRows.length} de {rows.length}
        </span>
      )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{emptyLabel}</div>
      ) : visibleRows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum registro nesta categoria.</div>
      ) : (
        <ul className="space-y-2">
          {visibleRows.map((row) => (
            <li key={row.id} className="rounded-md border p-3 flex items-start justify-between gap-3">
              <div className="min-w-0 text-sm space-y-1">{render(row)}</div>
              {canManage && (
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => { if (confirm("Excluir registro?")) deleteMut.mutate(row.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
