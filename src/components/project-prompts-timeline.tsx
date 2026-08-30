import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { ExternalUrl } from "@/components/project-records";
import { MessageSquareCode } from "lucide-react";

const sb = supabase as unknown as { from: (t: string) => any };

const fmt = (v: unknown) =>
  v ? new Date(String(v) + (String(v).length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";
const str = (v: unknown) => (v == null || v === "" ? null : String(v));

/**
 * Timeline cronológica de project_prompts.
 * Somente apresentação — reutiliza a tabela existente, sem nova entidade.
 */
export function ProjectPromptsTimeline({
  projectId,
  typeLabels,
}: {
  projectId: string;
  typeLabels: { value: string; label: string }[];
}) {
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["project-records", "project_prompts", projectId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("project_prompts")
        .select("*")
        .eq("project_id", projectId)
        .order("prompt_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Record<string, unknown>[];
    },
  });

  const ordered = [...rows].sort(
    (a, b) => new Date(String(a['prompt_date'] ?? a['created_at'])).getTime() - new Date(String(b['prompt_date'] ?? b['created_at'])).getTime(),
  );

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (ordered.length === 0)
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Nenhum prompt registrado ainda — a linha do tempo aparece assim que o primeiro prompt for cadastrado.
      </div>
    );

  return (
    <ol className="relative space-y-4 border-l pl-5">
      {ordered.map((r) => (
        <li key={String(r['id'])} className="relative">
          <span className="absolute -left-[1.53rem] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
          <div className="rounded-md border bg-card p-3 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <MessageSquareCode className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="font-medium text-sm">{String(r['title'])}</span>
              <Badge variant="secondary" className="text-[10px]">
                {typeLabels.find((t) => t.value === r['prompt_type'])?.label ?? String(r['prompt_type'])}
              </Badge>
              <span className="text-xs text-muted-foreground ml-auto">{fmt(r['prompt_date'])}</span>
            </div>
            {str(r['purpose']) && <p className="text-sm text-muted-foreground">{String(r['purpose'])}</p>}
            {str(r['commit_ref']) && (
              <p className="text-xs text-muted-foreground font-mono break-all">commit: {String(r['commit_ref'])}</p>
            )}
            {str(r['sent_to_lovable_at']) && (
              <p className="text-xs text-muted-foreground">Enviado ao Lovable em {fmt(r['sent_to_lovable_at'])}</p>
            )}
            {str(r['url']) && <ExternalUrl url={String(r['url'])} label="Abrir conversa" />}
            {str(r['notes']) && <p className="text-xs text-muted-foreground">{String(r['notes'])}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
