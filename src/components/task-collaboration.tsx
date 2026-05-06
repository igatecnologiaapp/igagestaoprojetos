import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Share2, MessageSquare, X, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";

type Permission = "view" | "comment" | "edit";

const permLabels: Record<Permission, string> = {
  view: "Visualizador", comment: "Colaborador", edit: "Administrador",
};

export function TaskShares({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const { canEdit } = useAuth();
  const [target, setTarget] = useState(""); // "u:<id>" or "e:<id>"
  const [perm, setPerm] = useState<Permission>("view");

  const { data: shares = [] } = useQuery({
    queryKey: ["task-shares", taskId],
    queryFn: async () => (await supabase.from("task_shares").select("*").eq("task_id", taskId)).data ?? [],
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => (await supabase.from("profiles").select("id,full_name").order("full_name")).data ?? [],
  });

  const { data: externals = [] } = useQuery({
    queryKey: ["external-list"],
    queryFn: async () => (await supabase.from("external_collaborators").select("id,name,email").order("name")).data ?? [],
  });

  const addMut = useMutation({
    mutationFn: async () => {
      if (!target) return;
      const [kind, id] = target.split(":");
      const payload = kind === "u"
        ? { task_id: taskId, user_id: id, permission: perm }
        : { task_id: taskId, external_id: id, permission: perm };
      const { error } = await supabase.from("task_shares").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Compartilhado");
      qc.invalidateQueries({ queryKey: ["task-shares", taskId] });
      setTarget("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("task_shares").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-shares", taskId] }),
  });

  const nameOf = (s: { user_id: string | null; external_id: string | null }) => {
    if (s.user_id) return users.find((u) => u.id === s.user_id)?.full_name ?? s.user_id.slice(0, 8);
    if (s.external_id) {
      const e = externals.find((x) => x.id === s.external_id);
      return e ? `${e.name} (externo)` : "externo";
    }
    return "—";
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium flex items-center gap-1.5">
        <Share2 className="h-4 w-4" />
        Compartilhamento ({shares.length})
      </h3>
      {canEdit && (
        <div className="flex gap-2">
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Usuário ou externo…" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => <SelectItem key={`u-${u.id}`} value={`u:${u.id}`}>{u.full_name ?? u.id.slice(0, 8)}</SelectItem>)}
              {externals.map((e) => <SelectItem key={`e-${e.id}`} value={`e:${e.id}`}>{e.name} (externo)</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={perm} onValueChange={(v) => setPerm(v as Permission)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(permLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => addMut.mutate()} disabled={!target}>Add</Button>
        </div>
      )}
      {shares.length === 0 ? (
        <p className="text-xs text-muted-foreground">Não compartilhada</p>
      ) : (
        <ul className="space-y-1">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1.5">
              <span className="truncate">{nameOf(s)}</span>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[10px]">{permLabels[s.permission as Permission]}</Badge>
                {canEdit && (
                  <button onClick={() => removeMut.mutate(s.id)}><X className="h-3 w-3" /></button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProjectShares({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { canEdit } = useAuth();
  const [target, setTarget] = useState("");
  const [perm, setPerm] = useState<Permission>("view");

  const { data: shares = [] } = useQuery({
    queryKey: ["project-shares", projectId],
    queryFn: async () => (await supabase.from("project_shares").select("*").eq("project_id", projectId)).data ?? [],
  });
  const { data: users = [] } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => (await supabase.from("profiles").select("id,full_name").order("full_name")).data ?? [],
  });
  const { data: externals = [] } = useQuery({
    queryKey: ["external-list"],
    queryFn: async () => (await supabase.from("external_collaborators").select("id,name,email").order("name")).data ?? [],
  });

  const addMut = useMutation({
    mutationFn: async () => {
      if (!target) return;
      const [kind, id] = target.split(":");
      const payload = kind === "u"
        ? { project_id: projectId, user_id: id, permission: perm }
        : { project_id: projectId, external_id: id, permission: perm };
      const { error } = await supabase.from("project_shares").insert(payload);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Compartilhado");
      qc.invalidateQueries({ queryKey: ["project-shares", projectId] });
      setTarget("");
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const removeMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("project_shares").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-shares", projectId] }),
  });

  const nameOf = (s: { user_id: string | null; external_id: string | null }) => {
    if (s.user_id) return users.find((u) => u.id === s.user_id)?.full_name ?? s.user_id.slice(0, 8);
    if (s.external_id) {
      const e = externals.find((x) => x.id === s.external_id);
      return e ? `${e.name} (externo)` : "externo";
    }
    return "—";
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium flex items-center gap-1.5">
        <Share2 className="h-4 w-4" />
        Compartilhamento ({shares.length})
      </h3>
      {canEdit && (
        <div className="flex gap-2">
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="flex-1"><SelectValue placeholder="Usuário ou externo…" /></SelectTrigger>
            <SelectContent>
              {users.map((u) => <SelectItem key={`u-${u.id}`} value={`u:${u.id}`}>{u.full_name ?? u.id.slice(0, 8)}</SelectItem>)}
              {externals.map((e) => <SelectItem key={`e-${e.id}`} value={`e:${e.id}`}>{e.name} (externo)</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={perm} onValueChange={(v) => setPerm(v as Permission)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(permLabels).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => addMut.mutate()} disabled={!target}>Add</Button>
        </div>
      )}
      {shares.length === 0 ? (
        <p className="text-xs text-muted-foreground">Não compartilhado</p>
      ) : (
        <ul className="space-y-1">
          {shares.map((s) => (
            <li key={s.id} className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1.5">
              <span className="truncate">{nameOf(s)}</span>
              <div className="flex items-center gap-1">
                <Badge variant="outline" className="text-[10px]">{permLabels[s.permission as Permission]}</Badge>
                {canEdit && (
                  <button onClick={() => removeMut.mutate(s.id)}><X className="h-3 w-3" /></button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function TaskComments({ taskId }: { taskId: string }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [body, setBody] = useState("");

  const { data: comments = [] } = useQuery({
    queryKey: ["task-comments", taskId],
    queryFn: async () => (await supabase.from("task_comments").select("*").eq("task_id", taskId).order("created_at", { ascending: true })).data ?? [],
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["users-list"],
    queryFn: async () => (await supabase.from("profiles").select("id,full_name")).data ?? [],
  });

  const addMut = useMutation({
    mutationFn: async () => {
      if (!body.trim() || !user) return;
      const { error } = await supabase.from("task_comments").insert({ task_id: taskId, user_id: user.id, body: body.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["task-comments", taskId] });
      setBody("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nameOf = (uid: string) => profiles.find((p) => p.id === uid)?.full_name ?? uid.slice(0, 8);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium flex items-center gap-1.5">
        <MessageSquare className="h-4 w-4" />
        Comentários ({comments.length})
      </h3>
      {comments.length > 0 && (
        <ul className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {comments.map((c) => (
            <li key={c.id} className="text-xs bg-muted rounded px-2 py-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium">{nameOf(c.user_id)}</span>
                <span className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleString("pt-BR")}</span>
              </div>
              <div className="mt-1 whitespace-pre-wrap">{c.body}</div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2 items-end">
        <Textarea rows={2} placeholder="Escreva um comentário…" value={body} onChange={(e) => setBody(e.target.value)} />
        <Button size="icon" onClick={() => addMut.mutate()} disabled={!body.trim() || addMut.isPending}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
