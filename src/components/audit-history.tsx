import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { History } from "lucide-react";

export function AuditHistory({ entityType, entityId }: { entityType: "company" | "project" | "task"; entityId: string }) {
  const { data: items = [] } = useQuery({
    queryKey: ["audit", entityType, entityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_history")
        .select("*")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("changed_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  const userIds = Array.from(new Set(items.map((i) => i.changed_by).filter(Boolean) as string[]));
  const { data: profiles = [] } = useQuery({
    queryKey: ["audit-profiles", userIds.join(",")],
    enabled: userIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id,full_name").in("id", userIds);
      return data ?? [];
    },
  });

  const nameOf = (uid: string | null) => profiles.find((p) => p.id === uid)?.full_name ?? (uid ? uid.slice(0, 8) : "Sistema");

  const actionLabel: Record<string, string> = { created: "criou", updated: "alterou", deleted: "excluiu" };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium flex items-center gap-1.5">
        <History className="h-4 w-4" />
        Histórico ({items.length})
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma alteração registrada</p>
      ) : (
        <ul className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {items.map((it) => {
            const changes = it.changes as Record<string, { old: unknown; new: unknown }> | null;
            const fields = it.action === "updated" && changes ? Object.keys(changes).join(", ") : null;
            return (
              <li key={it.id} className="text-xs bg-muted rounded px-2 py-1.5">
                <div>
                  <span className="font-medium">{nameOf(it.changed_by)}</span>{" "}
                  <span className="text-muted-foreground">{actionLabel[it.action] ?? it.action}</span>
                  {fields && <span className="text-muted-foreground"> ({fields})</span>}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {new Date(it.changed_at).toLocaleString("pt-BR")}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
