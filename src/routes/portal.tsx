import { useEffect } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Download,
  FileText,
  LogOut,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import igaLogo from "@/assets/iga-logo-oficial.png";

/**
 * Fase 4 — Portal do Cliente (somente consulta).
 * Todo o conteúdo vem das funções client_portal_* do banco, que já filtram:
 * só projetos liberados da empresa do cliente, só tarefas/documentos marcados
 * e só os valores que ele já pagou. Nada de custos, ferramentas ou resultado.
 */
const searchSchema = z.object({ projeto: z.string().uuid().optional() });

export const Route = createFileRoute("/portal")({
  validateSearch: searchSchema,
  component: PortalPage,
  head: () => ({
    meta: [
      { title: "Portal do Cliente — IGA Tecnologia" },
      {
        name: "description",
        content:
          "Acompanhe o andamento, os prazos, os documentos e os pagamentos dos seus projetos com a IGA Tecnologia.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
});

const STATUS: Record<string, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  in_development: "Em desenvolvimento",
  testing: "Em testes",
  validation: "Em validação",
  homologation: "Em homologação",
  deployment: "Implantação",
  paused: "Pausado",
  awaiting_client: "Aguardando você",
  awaiting_info: "Aguardando informações",
  awaiting_credits: "Em andamento",
  completed: "Concluído",
  cancelled: "Cancelado",
};
const TASK_STATUS: Record<string, string> = {
  pending: "A fazer",
  started: "Iniciada",
  in_progress: "Em andamento",
  paused: "Pausada",
  completed: "Concluída",
};
const money = (v: number | string | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v ?? 0));
const dateBr = (d: string | null | undefined) =>
  d ? new Date(d.slice(0, 10) + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const pct = (done: number, total: number) => (total > 0 ? Math.round((done / total) * 100) : 0);
const sizeLabel = (b: number | null) =>
  !b
    ? ""
    : b > 1048576
      ? `${(b / 1048576).toFixed(1).replace(".", ",")} MB`
      : `${Math.max(1, Math.round(b / 1024))} KB`;

type Detail = {
  project: {
    id: string;
    name: string;
    company_name: string;
    status: string;
    phase: string | null;
    start_date: string | null;
    end_date: string | null;
    tasks_total: number;
    tasks_done: number;
  };
  tasks: {
    id: string;
    name: string;
    status: string;
    start_date: string | null;
    due_date: string | null;
  }[];
  documents: {
    id: string;
    file_name: string;
    description: string | null;
    size_bytes: number | null;
    created_at: string;
  }[];
  payments: {
    id: string;
    description: string;
    kind: string;
    number: number;
    received_at: string;
    received_amount: number;
    invoice_ref: string | null;
  }[];
};

function PortalPage() {
  const { user, loading, isClient, signOut } = useAuth();
  const navigate = useNavigate();
  const { projeto } = Route.useSearch();
  const mustChangePassword =
    (user?.app_metadata as { must_change_password?: boolean } | undefined)?.must_change_password ===
    true;

  useEffect(() => {
    if (loading) return;
    if (!user) navigate({ to: "/auth" });
    else if (mustChangePassword) navigate({ to: "/reset-password" });
    else if (!isClient) navigate({ to: "/painel" });
  }, [loading, user, isClient, mustChangePassword, navigate]);

  const name =
    (user?.user_metadata as { full_name?: string } | undefined)?.full_name ?? user?.email ?? "";

  if (loading || !user || !isClient || mustChangePassword) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">
        Carregando…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={igaLogo}
              alt="IGA Tecnologia"
              className="h-10 w-10 rounded-lg object-cover shrink-0"
            />
            <div className="min-w-0">
              <div className="font-display font-semibold leading-none">Portal do Cliente</div>
              <div className="text-xs text-muted-foreground mt-1 truncate">
                IGA Tecnologia · {name}
              </div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void signOut().then(() => navigate({ to: "/auth" }))}
          >
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {projeto ? <ProjectView id={projeto} /> : <ProjectList />}
      </main>
    </div>
  );
}

function ProjectList() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["portal-projects"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_portal_projects");
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando seus projetos…</p>;
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold">Seus projetos</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Acompanhe o andamento, os prazos, os documentos e os pagamentos.
        </p>
      </div>
      {data.length === 0 ? (
        <Card className="p-8 text-center space-y-2">
          <p className="font-medium">Nenhum projeto disponível ainda.</p>
          <p className="text-sm text-muted-foreground">
            Assim que a IGA Tecnologia liberar um projeto para você, ele aparecerá aqui.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.map((p) => {
            const progress = pct(p.tasks_done, p.tasks_total);
            return (
              <Link
                key={p.id}
                to="/portal"
                search={{ projeto: p.id }}
                className="block rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="p-5 space-y-3 h-full transition-colors hover:border-primary/50">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="font-display text-lg font-semibold truncate">{p.name}</h2>
                      <p className="text-xs text-muted-foreground">{p.company_name}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0">
                      {STATUS[p.status] ?? p.status}
                    </Badge>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span>Andamento</span>
                      <span className="font-medium">{progress}%</span>
                    </div>
                    <Progress value={progress} />
                  </div>
                  <dl className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Previsão de entrega</dt>
                      <dd className="font-medium">{dateBr(p.end_date)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Próxima entrega</dt>
                      <dd className="font-medium">{dateBr(p.next_due)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Total pago</dt>
                      <dd className="font-medium">{money(p.paid_total)}</dd>
                    </div>
                  </dl>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProjectView({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["portal-project", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("client_portal_project", { _project_id: id });
      if (error) throw error;
      return (data as unknown as Detail | null) ?? null;
    },
  });

  const download = async (fileId: string) => {
    const { data: path, error } = await supabase.rpc("client_portal_document_path", {
      _file_id: fileId,
    });
    if (error || !path) return toast.error("Documento indisponível.");
    const { data: signed, error: e2 } = await supabase.storage
      .from("project-files")
      .createSignedUrl(path, 60);
    if (e2 || !signed?.signedUrl) return toast.error("Não foi possível baixar o documento.");
    window.open(signed.signedUrl, "_blank", "noopener");
  };

  const back = (
    <Link
      to="/portal"
      className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
    >
      <ArrowLeft className="h-4 w-4" /> Todos os projetos
    </Link>
  );

  if (isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  if (!data) {
    return (
      <div className="space-y-4">
        {back}
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Projeto não disponível.
        </Card>
      </div>
    );
  }

  const { project: p, tasks, documents, payments } = data;
  const progress = pct(p.tasks_done, p.tasks_total);
  const paid = payments.reduce((s, x) => s + Number(x.received_amount), 0);
  const open = tasks.filter((t) => t.status !== "completed");
  const done = tasks.filter((t) => t.status === "completed");

  return (
    <div className="space-y-5">
      {back}
      <Card className="p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h1 className="font-display text-2xl font-semibold">{p.name}</h1>
            <p className="text-sm text-muted-foreground">{p.company_name}</p>
          </div>
          <Badge variant="secondary" className="text-sm">
            {STATUS[p.status] ?? p.status}
          </Badge>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>Andamento geral</span>
            <span className="font-medium">
              {progress}% · {p.tasks_done} de {p.tasks_total} etapas
            </span>
          </div>
          <Progress value={progress} />
        </div>
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-muted-foreground">Início</dt>
            <dd className="font-medium">{dateBr(p.start_date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Previsão de entrega</dt>
            <dd className="font-medium">{dateBr(p.end_date)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Total pago</dt>
            <dd className="font-medium">{money(paid)}</dd>
          </div>
        </dl>
      </Card>

      <Card className="p-5 space-y-3">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" /> Entregas e etapas
        </h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma etapa publicada ainda.</p>
        ) : (
          <ul className="divide-y text-sm">
            {[...open, ...done].map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 py-2">
                <span
                  className={`min-w-0 flex items-center gap-2 ${t.status === "completed" ? "text-muted-foreground" : "font-medium"}`}
                >
                  {t.status === "completed" && (
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                  )}
                  <span className="truncate">{t.name}</span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {t.due_date && (
                    <span className="text-xs text-muted-foreground">{dateBr(t.due_date)}</span>
                  )}
                  <Badge variant="outline">{TASK_STATUS[t.status] ?? t.status}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5 space-y-3">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" /> Documentos
          </h2>
          {documents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum documento compartilhado.</p>
          ) : (
            <ul className="divide-y text-sm">
              {documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{d.file_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {dateBr(d.created_at)}
                      {d.size_bytes ? ` · ${sizeLabel(d.size_bytes)}` : ""}
                      {d.description ? ` · ${d.description}` : ""}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => void download(d.id)}
                    aria-label={`Baixar ${d.file_name}`}
                  >
                    <Download className="h-4 w-4" /> Baixar
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5 space-y-3">
          <h2 className="font-display text-lg font-semibold flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" /> Pagamentos realizados
          </h2>
          {payments.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum pagamento registrado.</p>
          ) : (
            <>
              <ul className="divide-y text-sm">
                {payments.map((x) => (
                  <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {x.description}
                        {x.kind === "implementation" ? ` · parcela ${x.number}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pago em {dateBr(x.received_at)}
                        {x.invoice_ref ? ` · ${x.invoice_ref}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-medium">{money(x.received_amount)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t pt-2 text-sm font-semibold">
                <span>Total pago</span>
                <span>{money(paid)}</span>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
