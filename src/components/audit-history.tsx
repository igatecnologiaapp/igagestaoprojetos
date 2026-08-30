import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { History, Filter } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

/**
 * Histórico visual (audit_history).
 * Apenas apresentação: nenhuma policy, função ou tabela é alterada.
 * A RLS existente continua determinando quais linhas o usuário enxerga.
 */

type Changes = Record<string, unknown> | null;

const entityLabels: Record<string, { label: string; noun: string }> = {
  company: { label: "Empresa", noun: "a empresa" },
  project: { label: "Projeto", noun: "o projeto" },
  task: { label: "Tarefa", noun: "a tarefa" },
  task_comment: { label: "Comentário", noun: "um comentário" },
  task_attachment: { label: "Anexo", noun: "um anexo" },
  appointment: { label: "Agendamento", noun: "um agendamento" },
  appointment_participant: { label: "Participante", noun: "um participante de agendamento" },
  project_share: { label: "Compart. de projeto", noun: "o compartilhamento do projeto" },
  task_share: { label: "Compart. de tarefa", noun: "o compartilhamento da tarefa" },
  external_collaborator: { label: "Colaborador externo", noun: "um colaborador externo" },
  project_links: { label: "Link", noun: "um link do projeto" },
  project_prompts: { label: "Prompt", noun: "um prompt" },
  project_emails: { label: "E-mail", noun: "um e-mail do projeto" },
  project_github_repos: { label: "GitHub", noun: "um repositório GitHub" },
  project_lovable: { label: "Lovable", noun: "um registro Lovable" },
  project_credits: { label: "Crédito", noun: "um lançamento de créditos" },
  project_accounts: { label: "Acesso", noun: "um acesso" },
  project_custom_field_values: { label: "Campo personalizado", noun: "um campo personalizado" },
  project_custom_field_definitions: { label: "Definição de campo", noun: "uma definição de campo" },
  // Bloco 3B — apenas rótulos de apresentação para as entidades de governança (Bloco 3A).
  project_development_records: { label: "Registro de desenvolvimento", noun: "um registro de desenvolvimento" },
  project_technical_debts: { label: "Dívida técnica", noun: "uma dívida técnica" },
};

const permissionLabels: Record<string, string> = {
  view: "visualização",
  comment: "comentário",
  edit: "edição",
};

const fieldLabels: Record<string, string> = {
  name: "nome",
  title: "título",
  status: "situação",
  priority: "prioridade",
  description: "descrição",
  due_date: "prazo",
  start_date: "início",
  end_date: "término",
  phase: "etapa",
  next_action: "próxima ação",
  assignee_id: "responsável",
  permission: "permissão",
  category: "categoria",
  url: "URL",
  value: "valor",
  amount: "quantidade",
  notes: "observações",
};

const actionVerb: Record<string, string> = { created: "criou", updated: "alterou", deleted: "removeu" };

const asRecord = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Valor "novo" de um campo, funcionando tanto para created/deleted (snapshot) quanto para updated (diff). */
function fieldValue(changes: Changes, key: string): string | null {
  const c = asRecord(changes);
  const raw = c[key];
  if (raw && typeof raw === "object" && "new" in (raw as Record<string, unknown>)) {
    const v = (raw as Record<string, unknown>)["new"];
    return v == null || v === "" ? null : String(v);
  }
  return raw == null || raw === "" ? null : String(raw);
}

function describe(entityType: string, action: string, changes: Changes): string {
  const meta = entityLabels[entityType];
  const noun = meta?.noun ?? "um registro";
  const verb = actionVerb[action] ?? action;

  if (entityType === "task_share" || entityType === "project_share") {
    const perm = permissionLabels[fieldValue(changes, "permission") ?? ""] ?? fieldValue(changes, "permission");
    const alvo = entityType === "task_share" ? "a tarefa" : "o projeto";
    if (action === "created") return `compartilhou ${alvo}${perm ? ` — permissão: ${perm}` : ""}`;
    if (action === "deleted") return `revogou o compartilhamento de ${alvo}`;
    return `alterou o compartilhamento de ${alvo}${perm ? ` — permissão: ${perm}` : ""}`;
  }

  if (action === "created") {
    const title = fieldValue(changes, "title") ?? fieldValue(changes, "name") ?? fieldValue(changes, "platform") ?? fieldValue(changes, "email");
    return `adicionou ${noun}${title ? ` “${title}”` : ""}`;
  }
  if (action === "deleted") {
    const title = fieldValue(changes, "title") ?? fieldValue(changes, "name");
    return `removeu ${noun}${title ? ` “${title}”` : ""}`;
  }
  const keys = Object.keys(asRecord(changes)).map((k) => fieldLabels[k] ?? k);
  return `${verb} ${noun}${keys.length ? ` (${keys.slice(0, 4).join(", ")}${keys.length > 4 ? "…" : ""})` : ""}`;
}

export interface AuditScope {
  /** Tipos + ids adicionais a incluir no histórico (ex.: tarefas, comentários, anexos do projeto). */
  entityIds: string[];
}

export function AuditHistory({
  entityType,
  entityId,
  extraIds = [],
  title = "Histórico",
}: {
  entityType: "company" | "project" | "task";
  entityId: string;
  extraIds?: string[];
  title?: string;
}) {
  const ids = useMemo(() => Array.from(new Set([entityId, ...extraIds])), [entityId, extraIds]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["audit", entityType, entityId, ids.length],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_history")
        .select("*")
        .in("entity_id", ids)
        .order("changed_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
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

  const [fUser, setFUser] = useState("__all");
  const [fType, setFType] = useState("__all");
  const [fAction, setFAction] = useState("__all");
  const [fPeriod, setFPeriod] = useState("__all");

  const typesPresent = Array.from(new Set(items.map((i) => i.entity_type)));

  const periodStart = (() => {
    const days = fPeriod === "7" ? 7 : fPeriod === "30" ? 30 : fPeriod === "90" ? 90 : null;
    return days ? Date.now() - days * 86400000 : null;
  })();

  const filtered = items.filter((i) => {
    if (fUser !== "__all" && i.changed_by !== fUser) return false;
    if (fType !== "__all" && i.entity_type !== fType) return false;
    if (fAction !== "__all" && i.action !== fAction) return false;
    if (periodStart && new Date(i.changed_at).getTime() < periodStart) return false;
    return true;
  });

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium flex items-center gap-1.5">
        <History className="h-4 w-4" />
        {title} ({filtered.length})
      </h3>

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          <Select value={fPeriod} onValueChange={setFPeriod}>
            <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Período" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todo o período</SelectItem>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
          <Select value={fType} onValueChange={setFType}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos os tipos</SelectItem>
              {typesPresent.map((t) => (
                <SelectItem key={t} value={t}>{entityLabels[t]?.label ?? t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={fAction} onValueChange={setFAction}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue placeholder="Evento" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Todos os eventos</SelectItem>
              <SelectItem value="created">Criação</SelectItem>
              <SelectItem value="updated">Alteração</SelectItem>
              <SelectItem value="deleted">Exclusão</SelectItem>
            </SelectContent>
          </Select>
          {userIds.length > 0 && (
            <Select value={fUser} onValueChange={setFUser}>
              <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue placeholder="Usuário" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Todos os usuários</SelectItem>
                {userIds.map((u) => (
                  <SelectItem key={u} value={u}>{nameOf(u)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Carregando…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          {items.length === 0 ? "Nenhuma alteração registrada." : "Nenhum evento para os filtros selecionados."}
        </div>
      ) : (
        <ul className="space-y-2 max-h-[26rem] overflow-y-auto pr-1">
          {filtered.map((it) => (
            <li key={it.id} className="relative rounded-md border bg-card px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{entityLabels[it.entity_type]?.label ?? it.entity_type}</Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(it.changed_at).toLocaleString("pt-BR")}
                </span>
              </div>
              <p className="mt-1 leading-snug">
                <span className="font-medium">{nameOf(it.changed_by)}</span>{" "}
                <span className="text-muted-foreground">{describe(it.entity_type, it.action, it.changes as Changes)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
