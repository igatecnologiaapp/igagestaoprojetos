import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalUrl } from "@/components/project-records";
import { ArrowDownUp, Filter, GitCommitHorizontal, MessageSquareCode, Link2 } from "lucide-react";

/**
 * Bloco 3B — Linha do tempo consolidada do desenvolvimento.
 * Somente composição em memória de dados já existentes:
 *  - project_prompts
 *  - project_development_records
 * Nenhuma tabela, enum, migration, FK ou persistência é criada.
 */

const sb = supabase as unknown as { from: (t: string) => any };

type Row = Record<string, unknown>;
type Opt = { value: string; label: string };

const str = (v: unknown) => (v == null || String(v).trim() === "" ? null : String(v));
const fmt = (v: unknown) =>
  v ? new Date(String(v) + (String(v).length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—";
const labelOf = (opts: Opt[], v: unknown) => opts.find((o) => o.value === String(v))?.label ?? (str(v) ?? "—");

/** Normalização de commit: sem espaços, minúsculo. */
const normCommit = (v: unknown) => {
  const s = str(v);
  return s ? s.trim().toLowerCase() : null;
};

/** Correlação segura: igualdade exata OU prefixo com no mínimo 7 caracteres (evita falso positivo). */
function commitsMatch(a: string, b: string) {
  if (a === b) return true;
  if (a.length < 7 || b.length < 7) return false;
  return a.startsWith(b) || b.startsWith(a);
}

type TimelineEvent = {
  id: string;
  kind: "prompt" | "record";
  type: string;
  typeLabel: string;
  date: string | null;
  title: string;
  commit: string | null;
  version: string | null;
  environment: string | null;
  result: string | null;
  responsible: string | null;
  purpose: string | null;
  url: string | null;
  sentToLovableAt: string | null;
  notes: string | null;
  group: number | null;
};

export function ProjectDevelopmentTimeline({
  projectId,
  promptTypes,
  devRecordTypes,
  environments,
  responsibleName,
}: {
  projectId: string;
  promptTypes: Opt[];
  devRecordTypes: Opt[];
  environments: Opt[];
  responsibleName: (uid: unknown) => string | null;
}) {
  // Reutiliza exatamente as queryKeys já usadas por RecordSection/timeline de prompts (cache compartilhado).
  const { data: prompts = [], isLoading: l1 } = useQuery({
    queryKey: ["project-records", "project_prompts", projectId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("project_prompts")
        .select("*")
        .eq("project_id", projectId)
        .order("prompt_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const { data: records = [], isLoading: l2 } = useQuery({
    queryKey: ["project-records", "project_development_records", projectId],
    queryFn: async () => {
      const { data, error } = await sb
        .from("project_development_records")
        .select("*")
        .eq("project_id", projectId)
        .order("event_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const [desc, setDesc] = useState(true);
  const [fPeriod, setFPeriod] = useState("__all");
  const [fType, setFType] = useState("__all");
  const [fResp, setFResp] = useState("__all");
  const [fEnv, setFEnv] = useState("__all");

  const events = useMemo<TimelineEvent[]>(() => {
    const base: TimelineEvent[] = [
      ...prompts.map((r) => ({
        id: `prompt-${String(r['id'])}`,
        kind: "prompt" as const,
        type: "prompt",
        typeLabel: `Prompt · ${labelOf(promptTypes, r['prompt_type'])}`,
        date: str(r['prompt_date']) ?? str(r['created_at']),
        title: String(r['title'] ?? ""),
        commit: normCommit(r['commit_ref']),
        version: null,
        environment: null,
        result: null,
        responsible: null,
        purpose: str(r['purpose']),
        url: str(r['url']),
        sentToLovableAt: str(r['sent_to_lovable_at']),
        notes: str(r['notes']),
        group: null,
      })),
      ...records.map((r) => ({
        id: `record-${String(r['id'])}`,
        kind: "record" as const,
        type: String(r['record_type']),
        typeLabel: labelOf(devRecordTypes, r['record_type']),
        date: str(r['event_date']) ?? str(r['created_at']),
        title: String(r['title'] ?? ""),
        commit: normCommit(r['commit_ref']),
        version: str(r['version_ref']),
        environment: str(r['environment']),
        result: str(r['result']),
        responsible: str(r['responsible_user_id']),
        purpose: str(r['description']),
        url: null,
        sentToLovableAt: null,
        notes: str(r['notes']),
        group: null,
      })),
    ];

    // Correlação por commit (somente visual, em memória).
    const groups: string[][] = [];
    for (const ev of base) {
      if (!ev.commit) continue;
      const g = groups.find((grp) => grp.some((c) => commitsMatch(c, ev.commit!)));
      if (g) g.push(ev.commit);
      else groups.push([ev.commit]);
    }
    for (const ev of base) {
      if (!ev.commit) continue;
      const idx = groups.findIndex((grp) => grp.some((c) => commitsMatch(c, ev.commit!)));
      const shared = idx >= 0 && base.filter((o) => o.commit && commitsMatch(o.commit, ev.commit!)).length > 1;
      ev.group = shared ? idx + 1 : null;
    }
    return base;
  }, [prompts, records, promptTypes, devRecordTypes]);

  const periodStart = (() => {
    const days = fPeriod === "7" ? 7 : fPeriod === "30" ? 30 : fPeriod === "90" ? 90 : null;
    return days ? Date.now() - days * 86400000 : null;
  })();

  const respPresent = Array.from(new Set(events.map((e) => e.responsible).filter(Boolean))) as string[];
  const envPresent = Array.from(new Set(events.map((e) => e.environment).filter(Boolean))) as string[];

  const filtered = events
    .filter((e) => {
      if (fType !== "__all" && e.type !== fType) return false;
      if (fResp !== "__all" && e.responsible !== fResp) return false;
      if (fEnv !== "__all" && e.environment !== fEnv) return false;
      if (periodStart && e.date && new Date(e.date + (e.date.length === 10 ? "T00:00:00" : "")).getTime() < periodStart)
        return false;
      return true;
    })
    .sort((a, b) => {
      const ta = a.date ? new Date(a.date + (a.date.length === 10 ? "T00:00:00" : "")).getTime() : 0;
      const tb = b.date ? new Date(b.date + (b.date.length === 10 ? "T00:00:00" : "")).getTime() : 0;
      return desc ? tb - ta : ta - tb;
    });

  if (l1 || l2) return <p className="text-sm text-muted-foreground">Carregando…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-3.5 w-3.5 text-muted-foreground" />
        <Select value={fPeriod} onValueChange={setFPeriod}>
          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Período" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todo o período</SelectItem>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
          </SelectContent>
        </Select>
        <Select value={fType} onValueChange={setFType}>
          <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Todos os tipos</SelectItem>
            <SelectItem value="prompt">Prompt</SelectItem>
            {devRecordTypes.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {respPresent.length > 0 && (
          <Select value={fResp} onValueChange={setFResp}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Responsável" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos os responsáveis</SelectItem>
              {respPresent.map((u) => (
                <SelectItem key={u} value={u}>{responsibleName(u) ?? u.slice(0, 8)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {envPresent.length > 0 && (
          <Select value={fEnv} onValueChange={setFEnv}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue placeholder="Ambiente" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos os ambientes</SelectItem>
              {envPresent.map((e) => (
                <SelectItem key={e} value={e}>{labelOf(environments, e)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setDesc((d) => !d)}>
          <ArrowDownUp className="h-3.5 w-3.5 mr-1" />
          {desc ? "Mais recentes primeiro" : "Mais antigos primeiro"}
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} de {events.length}</span>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {events.length === 0
            ? "Nenhum evento de desenvolvimento — a linha do tempo aparece assim que houver prompts ou registros de desenvolvimento."
            : "Nenhum evento para os filtros selecionados."}
        </div>
      ) : (
        <ol className="relative space-y-3 border-l pl-5">
          {filtered.map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute -left-[1.53rem] top-2 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
              <div className="rounded-md border bg-card px-3 py-2 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {e.kind === "prompt" ? (
                    <MessageSquareCode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <GitCommitHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <Badge variant={e.kind === "prompt" ? "outline" : "secondary"} className="text-[10px]">
                    {e.typeLabel}
                  </Badge>
                  <span className="font-medium text-sm">{e.title}</span>
                  {e.group != null && (
                    <Badge variant="outline" className="text-[10px] gap-1">
                      <Link2 className="h-3 w-3" /> Relacionado #{e.group}
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">{fmt(e.date)}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {[
                    e.version && `Versão ${e.version}`,
                    e.environment && labelOf(environments, e.environment),
                    e.result && `Resultado: ${e.result}`,
                    e.responsible && `Responsável: ${responsibleName(e.responsible) ?? "—"}`,
                    e.sentToLovableAt && `Enviado ao Lovable em ${fmt(e.sentToLovableAt)}`,
                  ].filter(Boolean).join(" · ") || null}
                </p>
                {e.purpose && <p className="text-xs text-muted-foreground">{e.purpose}</p>}
                {e.commit && (
                  <p className="text-[11px] text-muted-foreground font-mono break-all">commit: {e.commit}</p>
                )}
                {e.url && <ExternalUrl url={e.url} label="Abrir conversa" />}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
