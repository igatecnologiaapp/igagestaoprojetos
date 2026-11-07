import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, ShieldCheck, UserRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/**
 * Fase 4 — Portal do Cliente na pasta do projeto.
 * O gestor libera o projeto para os usuários Cliente da empresa e vê, em um só lugar,
 * o que o cliente enxerga (tarefas e documentos marcados) e o que nunca enxerga.
 */
export function ProjectClientAccess({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { canEdit, isOwner } = useAuth();
  const key = ["project-client-access", projectId];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const [project, contacts, tasks, files] = await Promise.all([
        supabase
          .from("projects")
          .select("id,client_portal,company_id,companies(name)")
          .eq("id", projectId)
          .maybeSingle(),
        supabase.rpc("client_portal_contacts", { _project_id: projectId }),
        supabase
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("client_visible", true),
        supabase
          .from("project_files")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("client_visible", true),
      ]);
      return {
        project: project.data,
        contacts: contacts.data ?? [],
        tasks: tasks.count ?? 0,
        files: files.count ?? 0,
      };
    },
  });

  const toggle = async (v: boolean) => {
    const { error } = await supabase
      .from("projects")
      .update({ client_portal: v })
      .eq("id", projectId);
    if (error) return toast.error(error.message);
    toast.success(
      v ? "Projeto liberado no Portal do Cliente." : "Projeto retirado do Portal do Cliente.",
    );
    void qc.invalidateQueries({ queryKey: key });
  };

  if (isLoading) return <Card className="p-4 text-sm text-muted-foreground">Carregando…</Card>;
  const p = data?.project;
  const company = (p?.companies as { name?: string } | null)?.name ?? "empresa do projeto";
  const on = !!p?.client_portal;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold">Portal do Cliente</h3>
          <p className="text-sm text-muted-foreground">
            Acesso somente para consulta, para os usuários Cliente de {company}.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Switch
            id="client-portal"
            checked={on}
            disabled={!canEdit}
            onCheckedChange={(v) => void toggle(v)}
          />
          <Label htmlFor="client-portal" className="text-sm">
            {on ? "Liberado" : "Fechado"}
          </Label>
        </div>
      </div>

      <div className="rounded-md border p-3 space-y-1.5 text-sm">
        <p className="font-medium flex items-center gap-1.5">
          <Eye className="h-4 w-4 text-primary" /> O cliente vê
        </p>
        <ul className="list-disc pl-5 text-muted-foreground space-y-0.5">
          <li>Situação, andamento (%) e prazos do projeto</li>
          <li>
            {data?.tasks ?? 0} tarefa(s) marcada(s) como "Cliente vê" — marque na seção{" "}
            <Link
              to="/projetos/$projectId"
              params={{ projectId }}
              search={{ secao: "tarefas" }}
              className="text-primary hover:underline"
            >
              Tarefas
            </Link>
          </li>
          <li>
            {data?.files ?? 0} documento(s) compartilhado(s) — marque na seção{" "}
            <Link
              to="/projetos/$projectId"
              params={{ projectId }}
              search={{ secao: "documentos" }}
              className="text-primary hover:underline"
            >
              Documentos
            </Link>
          </li>
          <li>Os valores que ele já pagou (parcelas recebidas)</li>
        </ul>
        <p className="font-medium flex items-center gap-1.5 pt-1">
          <ShieldCheck className="h-4 w-4 text-success" /> Nunca vê
        </p>
        <p className="text-muted-foreground">
          Custos, ferramentas, rateio, resultado, senhas, prompts, comentários e tarefas internas.
        </p>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">Quem acessa</p>
        {(data?.contacts ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum usuário Cliente cadastrado para {company}.{" "}
            {isOwner ? (
              <>
                Cadastre em{" "}
                <Link to="/usuarios" className="text-primary hover:underline">
                  Usuários
                </Link>
                , com o perfil Cliente.
              </>
            ) : (
              "Peça ao Administrador para cadastrar."
            )}
          </p>
        ) : (
          <ul className="space-y-1">
            {data!.contacts.map((c) => (
              <li
                key={c.user_id}
                className="flex items-center gap-2 rounded bg-muted px-2 py-1.5 text-sm"
              >
                <UserRound className="h-4 w-4 text-muted-foreground" /> {c.full_name ?? "Cliente"}
              </li>
            ))}
          </ul>
        )}
        {on && (data?.contacts ?? []).length > 0 && (
          <p className="text-xs text-muted-foreground">
            Eles entram pelo mesmo endereço de login e caem direto no Portal.
          </p>
        )}
      </div>
    </Card>
  );
}
