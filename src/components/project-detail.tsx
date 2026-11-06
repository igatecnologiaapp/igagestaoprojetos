import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { AuditHistory } from "@/components/audit-history";
import { ProjectShares } from "@/components/task-collaboration";
import { RecordSection, ExternalUrl } from "@/components/project-records";
import { ProjectCustomFieldValues } from "@/components/project-custom-fields";
import { ProjectPromptsTimeline } from "@/components/project-prompts-timeline";
import { ProjectDevelopmentTimeline } from "@/components/project-development-timeline";
import { ProjectManagementSummary } from "@/components/project-management-summary";
import { useAuth } from "@/lib/auth-context";
import { Coins, Github, Sparkles, ListChecks, ArrowLeft, CalendarDays, Lock, FolderOpen } from "lucide-react";

const sb = supabase as unknown as { from: (t: string) => any };

export const promptTypes = [
  { value: "initial", label: "Inicial" },
  { value: "adjustment", label: "Ajuste" },
  { value: "fix", label: "Correção" },
  { value: "feature", label: "Funcionalidade" },
  { value: "security", label: "Segurança" },
  { value: "database", label: "Banco de dados" },
  { value: "ux", label: "UX/UI" },
  { value: "audit", label: "Auditoria" },
  { value: "tests", label: "Testes" },
  { value: "docs", label: "Documentação" },
  { value: "staging", label: "Homologação" },
  { value: "other", label: "Outro" },
];

// Bloco 2B: categorias úteis para o campo `category` já existente em project_links.
const linkCategories = [
  "Produção",
  "Homologação",
  "Desenvolvimento",
  "GitHub",
  "Lovable",
  "Banco de Dados",
  "Documentação",
  "Dashboard",
  "API",
  "Domínio",
  "Infraestrutura",
  "Design",
  "Planilha",
  "Outros",
].map((c) => ({ value: c, label: c }));

const fmtDate = (v: unknown) => (v ? new Date(String(v) + (String(v).length === 10 ? "T00:00:00" : "")).toLocaleDateString("pt-BR") : "—");
const str = (v: unknown) => (v == null || v === "" ? null : String(v));

// Bloco 3A — Governança do desenvolvimento
const devRecordTypes = [
  { value: "decision", label: "Decisão" },
  { value: "version", label: "Versão" },
  { value: "test", label: "Teste" },
  { value: "homologation", label: "Homologação" },
  { value: "deployment", label: "Implantação" },
];
const environments = [
  { value: "development", label: "Desenvolvimento" },
  { value: "preview", label: "Preview" },
  { value: "staging", label: "Homologação" },
  { value: "production", label: "Produção" },
];
const debtStatuses = [
  { value: "open", label: "Aberta" },
  { value: "analysis", label: "Em análise" },
  { value: "planned", label: "Planejada" },
  { value: "resolved", label: "Resolvida" },
  { value: "accepted", label: "Aceita" },
];
const debtPriorities = [
  { value: "low", label: "Baixa" },
  { value: "medium", label: "Média" },
  { value: "high", label: "Alta" },
  { value: "critical", label: "Crítica" },
];
const labelOf = (opts: { value: string; label: string }[], v: unknown) =>
  opts.find((o) => o.value === String(v))?.label ?? (str(v) ?? "—");

export function useProjectCredits(projectId: string | null) {
  return useQuery({
    queryKey: ["project-records", "project_credits", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await sb.from("project_credits").select("*").eq("project_id", projectId).order("entry_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as { id: string; amount: number }[];
    },
  });
}

/** As 7 seções da pasta digital do projeto (Fase 1 da proposta de unificação). */
export const folderSections = [
  { id: "visao-geral", label: "Visão geral" },
  { id: "tarefas", label: "Estrutura e tarefas" },
  { id: "financeiro", label: "Financeiro" },
  { id: "ferramentas", label: "Ferramentas e acessos" },
  { id: "documentos", label: "Documentos e links" },
  { id: "historico", label: "Histórico" },
  { id: "equipe", label: "Equipe" },
] as const;
export type FolderSection = (typeof folderSections)[number]["id"];

const statusLabels: Record<string, string> = {
  planning: "Planejamento",
  in_progress: "Em andamento",
  paused: "Pausado",
  completed: "Concluído",
  cancelled: "Cancelado",
};

/**
 * Pasta digital do projeto: página própria (/projetos/:id) com 7 seções.
 * Reúne, sem alterar regras de acesso, o conteúdo das 12 abas da antiga janela do projeto.
 * A RLS do banco continua sendo a única fonte de autorização; a tela só esconde
 * o que o usuário já não poderia ver.
 */
export function ProjectFolder({
  projectId,
  section,
  onSectionChange,
}: {
  projectId: string;
  section: FolderSection;
  onSectionChange: (s: FolderSection) => void;
}) {
  const { isOwner, hasPermission, loading: authLoading } = useAuth();
  const canViewFinance = hasPermission("financial.view");
  const [promptView, setPromptView] = useState("timeline");

  const { data: project, isLoading: projectLoading } = useQuery({
    queryKey: ["project-detail", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("*, companies(name)")
        .eq("id", projectId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["project-detail-tasks", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const { data } = await supabase.from("tasks").select("id,name,status,priority,due_date").eq("project_id", projectId!).order("position");
      return data ?? [];
    },
  });

  // Escopo do histórico visual: ids relacionados ao projeto cujos eventos já são auditados.
  // A RLS de audit_history continua sendo a única fonte de autorização.
  const taskIds = tasks.map((t) => t.id);
  const { data: auditScope = [] } = useQuery({
    queryKey: ["project-audit-scope", projectId, taskIds.join(",")],
    enabled: !!projectId,
    queryFn: async () => {
      const childTables = [
        "project_links", "project_prompts", "project_emails", "project_github_repos",
        "project_lovable", "project_credits", "project_custom_field_values", "project_shares",
        "project_development_records", "project_technical_debts",
      ];
      const results = await Promise.all([
        ...childTables.map((t) => sb.from(t).select("id").eq("project_id", projectId!)),
        sb.from("appointments").select("id").eq("project_id", projectId!),
        taskIds.length ? sb.from("task_comments").select("id").in("task_id", taskIds) : Promise.resolve({ data: [] }),
        taskIds.length ? sb.from("task_attachments").select("id").in("task_id", taskIds) : Promise.resolve({ data: [] }),
        taskIds.length ? sb.from("task_shares").select("id").in("task_id", taskIds) : Promise.resolve({ data: [] }),
      ]);
      const ids = results.flatMap((r: { data?: { id: string }[] | null }) => (r?.data ?? []).map((row) => row.id));
      return ids as string[];
    },
  });

  // Bloco 3A.1 — reutiliza a lista de perfis já existente no sistema para o campo Responsável.
  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-select"],
    queryFn: async () => (await supabase.from("profiles").select("id,full_name").order("full_name")).data ?? [],
  });
  const responsibleOptions = profiles.map((p) => ({ value: p.id, label: p.full_name ?? p.id.slice(0, 8) }));
  const responsibleName = (uid: unknown) =>
    uid ? (profiles.find((p) => p.id === String(uid))?.full_name ?? String(uid).slice(0, 8)) : null;

  const { data: credits = [] } = useProjectCredits(projectId);

  const totalCredits = credits.reduce((s, c) => s + Number(c.amount ?? 0), 0);
  const done = tasks.filter((t) => t.status === "completed").length;
  const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;


  const visibleSections = folderSections.filter((s) => s.id !== "financeiro" || canViewFinance);
  const current: FolderSection = visibleSections.some((s) => s.id === section) ? section : "visao-geral";
  const company = (project?.companies as { name: string } | null)?.name ?? "—";

  if (projectLoading || authLoading) {
    return <p className="text-sm text-muted-foreground">Carregando pasta do projeto…</p>;
  }
  if (!project) {
    return (
      <Card className="p-8 text-center space-y-3">
        <Lock className="h-10 w-10 mx-auto text-muted-foreground" />
        <h1 className="font-semibold">Projeto não encontrado</h1>
        <p className="text-sm text-muted-foreground">O projeto não existe ou não foi compartilhado com você.</p>
        <Button asChild variant="outline"><Link to="/projects">Voltar para Projetos</Link></Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground w-fit">
          <ArrowLeft className="h-4 w-4" /> Projetos
        </Link>
      </div>

      <Card className="p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <FolderOpen className="h-4 w-4" /> Pasta do projeto
          </div>
          <h1 className="font-display text-2xl font-semibold break-words">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{company}</p>
        </div>
        <div className="flex flex-wrap items-center gap-5">
          <Badge variant="secondary">{statusLabels[String(project.status)] ?? String(project.status ?? "—")}</Badge>
          <div className="min-w-[160px] space-y-1">
            <div className="text-xs text-muted-foreground">{progress}% das tarefas concluídas</div>
            <Progress value={progress} />
          </div>
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <CalendarDays className="h-4 w-4 mt-0.5" />
            <div>
              <div>Início {fmtDate(project.start_date)}</div>
              <div>Conclusão {fmtDate(project.end_date)}</div>
            </div>
          </div>
        </div>
      </Card>

      <nav aria-label="Seções da pasta" className="-mx-1 overflow-x-auto">
        <div role="tablist" className="flex gap-1.5 px-1 pb-1 w-max">
          {visibleSections.map((s, i) => {
            const active = s.id === current;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSectionChange(s.id)}
                className={`min-h-11 whitespace-nowrap rounded-md border px-4 text-sm transition-colors ${
                  active
                    ? "border-primary bg-primary text-primary-foreground font-medium"
                    : "bg-card hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {i + 1} · {s.label}
              </button>
            );
          })}
        </div>
      </nav>

      <section aria-label={visibleSections.find((s) => s.id === current)?.label}>
        {current === "visao-geral" && (
          <div className="space-y-6">
            <ProjectManagementSummary projectId={projectId} responsibleName={responsibleName} />
            <Card className="p-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><ListChecks className="h-4 w-4" />Progresso</div>
                  <p className="text-2xl font-semibold mt-1">{progress}%</p>
                  <Progress value={progress} className="mt-2" />
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground"><Coins className="h-4 w-4" />Créditos Lovable</div>
                  <p className="text-2xl font-semibold mt-1">{totalCredits.toLocaleString("pt-BR")}</p>
                  <p className="text-xs text-muted-foreground mt-1">{credits.length} lançamentos</p>
                </Card>
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Última atualização</div>
                  <p className="text-sm font-medium mt-1">
                    {project?.last_activity_at ? new Date(project.last_activity_at).toLocaleString("pt-BR") : "—"}
                  </p>
                </Card>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div><span className="text-muted-foreground">Etapa atual: </span>{str(project?.phase) ?? "—"}</div>
                <div><span className="text-muted-foreground">Próxima ação: </span>{str(project?.next_action) ?? "—"}</div>
                <div><span className="text-muted-foreground">Início: </span>{fmtDate(project?.start_date)}</div>
                <div><span className="text-muted-foreground">Prazo: </span>{fmtDate(project?.end_date)}</div>
              </div>

              {project?.description && <p className="text-sm text-muted-foreground">{project.description}</p>}

              <div className="border-t pt-4">
                <h3 className="text-sm font-medium mb-2">Campos personalizados</h3>
                <ProjectCustomFieldValues projectId={projectId} />
              </div>
            </Card>
          </div>
        )}

        {current === "tarefas" && (
          <div className="space-y-3">
            <Button asChild size="sm" variant="outline">
              <Link to="/tasks" search={{ project: projectId }}>Abrir Kanban do projeto</Link>
            </Button>
            {tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma tarefa neste projeto.</p>
            ) : (
              <ul className="space-y-2">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                    <span className="truncate">{t.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge variant="outline">{t.priority}</Badge>
                      <Badge variant={t.status === "completed" ? "default" : "secondary"}>{t.status}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {current === "financeiro" && canViewFinance && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              O resumo financeiro, os custos realizados e o orçamento do projeto estão na Visão geral (Ficha Gerencial).
              O rateio por consumo das contas de ferramentas, as receitas e o resultado (Superávit ou Déficit) chegam na Fase 2.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline"><Link to="/finance/costs">Custos e rateios</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/finance/budgets">Orçamentos</Link></Button>
              <Button asChild size="sm" variant="outline"><Link to="/finance/services">Assinaturas e serviços</Link></Button>
            </div>
            <div className="border-t pt-4">
                <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5">
                  <Coins className="h-4 w-4" />Créditos — total: {totalCredits.toLocaleString("pt-BR")}
                </h3>
                <RecordSection
                  table="project_credits"
                  projectId={projectId}
                  addLabel="Novo lançamento"
                  emptyLabel="Nenhum crédito lançado."
                  orderBy={{ column: "entry_date", ascending: false }}
                  fields={[
                    { key: "entry_date", label: "Data", type: "date", required: true },
                    { key: "amount", label: "Quantidade", type: "number", required: true },
                    { key: "description", label: "Descrição", full: true },
                    { key: "notes", label: "Observações", type: "textarea" },
                  ]}
                  render={(r) => (
                    <>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{Number(r['amount']).toLocaleString("pt-BR")}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(r['entry_date'])}</span>
                      </div>
                      {str(r['description']) && <p className="text-muted-foreground">{String(r['description'])}</p>}
                      {str(r['notes']) && <p className="text-xs text-muted-foreground">{String(r['notes'])}</p>}
                    </>
                  )}
                />
            </div>
          </div>
        )}

        {current === "ferramentas" && (
          <Tabs defaultValue="github">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="github">GitHub</TabsTrigger>
              <TabsTrigger value="lovable">Lovable</TabsTrigger>
              <TabsTrigger value="emails">E-mails</TabsTrigger>
              {isOwner && <TabsTrigger value="accounts">Contas e credenciais</TabsTrigger>}
            </TabsList>
            <TabsContent value="github" className="pt-4">
              <RecordSection
                table="project_github_repos"
                projectId={projectId}
                addLabel="Novo repositório"
                emptyLabel="Nenhum repositório vinculado."
                fields={[
                  { key: "url", label: "URL do repositório", type: "url", required: true, full: true },
                  { key: "owner", label: "Organização / dono" },
                  { key: "repo_name", label: "Nome do repositório" },
                  { key: "default_branch", label: "Branch principal" },
                  { key: "status", label: "Situação" },
                  { key: "notes", label: "Observações", type: "textarea" },
                ]}
                render={(r) => (
                  <>
                    <div className="flex items-center gap-2 font-medium">
                      <Github className="h-4 w-4" />
                      {str(r['repo_name']) ?? String(r['url'])}
                    </div>
                    <ExternalUrl url={String(r['url'])} />
                    <p className="text-xs text-muted-foreground">
                      {[str(r['owner']), str(r['default_branch']), str(r['status'])].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {str(r['notes']) && <p className="text-xs text-muted-foreground">{String(r['notes'])}</p>}
                  </>
                )}
              />
            </TabsContent>
            <TabsContent value="lovable" className="pt-4">
              <div>
                <h3 className="text-sm font-medium mb-2 flex items-center gap-1.5"><Sparkles className="h-4 w-4" />Projeto Lovable</h3>
                <RecordSection
                  table="project_lovable"
                  projectId={projectId}
                  addLabel="Vincular Lovable"
                  emptyLabel="Nenhum projeto Lovable vinculado."
                  fields={[
                    { key: "account_email", label: "Conta (e-mail)", type: "email", full: true },
                    { key: "project_url", label: "URL do projeto", type: "url", full: true },
                    { key: "public_url", label: "URL pública", type: "url", full: true },
                    { key: "workspace", label: "Workspace" },
                    { key: "notes", label: "Observações", type: "textarea" },
                  ]}
                  render={(r) => (
                    <>
                      <p className="font-medium">{str(r['account_email']) ?? "Conta não informada"}</p>
                      {str(r['workspace']) && <p className="text-xs text-muted-foreground">Workspace: {String(r['workspace'])}</p>}
                      {str(r['project_url']) && <ExternalUrl url={String(r['project_url'])} label="Abrir projeto" />}
                      {str(r['public_url']) && <div><ExternalUrl url={String(r['public_url'])} label="Abrir site publicado" /></div>}
                      {str(r['notes']) && <p className="text-xs text-muted-foreground">{String(r['notes'])}</p>}
                    </>
                  )}
                />
              </div>
            </TabsContent>
            <TabsContent value="emails" className="pt-4">
              <RecordSection
                table="project_emails"
                projectId={projectId}
                addLabel="Novo e-mail"
                emptyLabel="Nenhum e-mail cadastrado."
                fields={[
                  { key: "email", label: "E-mail", type: "email", required: true, full: true },
                  { key: "provider", label: "Provedor" },
                  { key: "purpose", label: "Finalidade" },
                  { key: "notes", label: "Observações", type: "textarea" },
                ]}
                render={(r) => (
                  <>
                    <p className="font-medium break-all">{String(r['email'])}</p>
                    <p className="text-xs text-muted-foreground">
                      {[str(r['provider']), str(r['purpose'])].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {str(r['notes']) && <p className="text-xs text-muted-foreground">{String(r['notes'])}</p>}
                  </>
                )}
              />
            </TabsContent>
            {isOwner && (
              <TabsContent value="accounts" className="space-y-3 pt-4">
                <p className="text-xs text-muted-foreground">
                  Por segurança, senhas não são armazenadas no sistema. Registre apenas plataforma, usuário e onde a senha está guardada (gerenciador de senhas).
                </p>
                <RecordSection
                  table="project_accounts"
                  projectId={projectId}
                  canManage={isOwner}
                  addLabel="Novo acesso"
                  emptyLabel="Nenhum acesso cadastrado."
                  fields={[
                    { key: "platform", label: "Plataforma", required: true },
                    { key: "username", label: "Usuário" },
                    { key: "email", label: "E-mail", type: "email" },
                    { key: "url", label: "URL de acesso", type: "url", full: true },
                    { key: "notes", label: "Observações (não inclua senhas)", type: "textarea" },
                  ]}
                  render={(r) => (
                    <>
                      <p className="font-medium">{String(r['platform'])}</p>
                      <p className="text-xs text-muted-foreground">
                        {[str(r['username']), str(r['email'])].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {str(r['url']) && <ExternalUrl url={String(r['url'])} />}
                      {str(r['notes']) && <p className="text-xs text-muted-foreground">{String(r['notes'])}</p>}
                    </>
                  )}
                />
              </TabsContent>
            )}
          </Tabs>
        )}

        {current === "documentos" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Links do projeto (contratos, briefing, layouts, entregas). O envio de arquivos em pastas chega no próximo bloco.
            </p>
            <RecordSection
              table="project_links"
              projectId={projectId}
              addLabel="Novo link"
              emptyLabel="Nenhum link cadastrado."
              fields={[
                { key: "name", label: "Nome", required: true },
                { key: "category", label: "Categoria", type: "select", options: linkCategories },
                { key: "url", label: "URL", type: "url", required: true, full: true },
                { key: "description", label: "Descrição", type: "textarea" },
              ]}
              filterKey="category"
              render={(r) => (
                <>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{String(r['name'])}</span>
                    <Badge variant="secondary">{str(r['category']) ?? "Outro"}</Badge>
                  </div>
                  <ExternalUrl url={String(r['url'])} />
                  {str(r['description']) && <p className="text-xs text-muted-foreground">{String(r['description'])}</p>}
                </>
              )}
            />
          </div>
        )}

        {current === "historico" && (
          <Tabs defaultValue="desenvolvimento">
            <TabsList className="flex flex-wrap h-auto">
              <TabsTrigger value="desenvolvimento">Desenvolvimento</TabsTrigger>
              <TabsTrigger value="prompts">Prompts</TabsTrigger>
              <TabsTrigger value="auditoria">Auditoria</TabsTrigger>
            </TabsList>
            <TabsContent value="desenvolvimento" className="space-y-6 pt-4">
              <div>
                <h4 className="text-sm font-semibold mb-2">Linha do tempo do desenvolvimento</h4>
                <ProjectDevelopmentTimeline
                  projectId={projectId}
                  promptTypes={promptTypes}
                  devRecordTypes={devRecordTypes}
                  environments={environments}
                  responsibleName={responsibleName}
                />
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Registros de desenvolvimento</h4>
                <RecordSection
                  table="project_development_records"
                  projectId={projectId}
                  addLabel="Novo registro"
                  emptyLabel="Nenhum registro de desenvolvimento."
                  orderBy={{ column: "event_date", ascending: false }}
                  fields={[
                    { key: "record_type", label: "Tipo", type: "select", options: devRecordTypes, required: true },
                    { key: "event_date", label: "Data do evento", type: "date", required: true },
                    { key: "title", label: "Título", required: true, full: true },
                    { key: "commit_ref", label: "Commit (SHA)" },
                    { key: "version_ref", label: "Versão" },
                    { key: "environment", label: "Ambiente", type: "select", options: environments },
                    { key: "result", label: "Resultado / status" },
                    { key: "responsible_user_id", label: "Responsável", type: "select", options: responsibleOptions },
                    { key: "description", label: "Descrição", type: "textarea" },
                    { key: "notes", label: "Observações (não inclua senhas ou tokens)", type: "textarea" },

                  ]}
                  filterKey="record_type"
                  filterLabel="Tipo"
                  render={(r) => (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="secondary">{labelOf(devRecordTypes, r['record_type'])}</Badge>
                        <span className="font-medium">{String(r['title'])}</span>
                        <span className="text-xs text-muted-foreground">{fmtDate(r['event_date'])}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[
                          str(r['version_ref']) && `Versão ${String(r['version_ref'])}`,
                          str(r['commit_ref']) && `Commit ${String(r['commit_ref'])}`,
                          str(r['environment']) && labelOf(environments, r['environment']),
                          responsibleName(r['responsible_user_id']) && `Responsável: ${responsibleName(r['responsible_user_id'])}`,
                          str(r['result']) && `Resultado: ${String(r['result'])}`,

                        ].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {str(r['description']) && <p className="text-xs text-muted-foreground">{String(r['description'])}</p>}
                      {str(r['notes']) && <p className="text-xs text-muted-foreground">{String(r['notes'])}</p>}
                    </>
                  )}
                />
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">Dívidas técnicas</h4>
                <RecordSection
                  table="project_technical_debts"
                  projectId={projectId}
                  addLabel="Nova dívida técnica"
                  emptyLabel="Nenhuma dívida técnica registrada."
                  orderBy={{ column: "identified_at", ascending: false }}
                  fields={[
                    { key: "code", label: "Código (ex.: DT-01)" },
                    { key: "title", label: "Título", required: true },
                    { key: "status", label: "Situação", type: "select", options: debtStatuses, required: true },
                    { key: "priority", label: "Prioridade", type: "select", options: debtPriorities, required: true },
                    { key: "identified_at", label: "Identificada em", type: "date", required: true },
                    { key: "resolved_at", label: "Resolvida em", type: "date" },
                    { key: "origin", label: "Origem" },
                    { key: "impact", label: "Impacto" },
                    { key: "responsible_user_id", label: "Responsável", type: "select", options: responsibleOptions },

                    { key: "description", label: "Descrição", type: "textarea" },
                    { key: "resolution", label: "Resolução", type: "textarea" },
                  ]}
                  filterKey="status"
                  filterLabel="Situação"
                  render={(r) => (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        {str(r['code']) && <Badge variant="outline">{String(r['code'])}</Badge>}
                        <span className="font-medium">{String(r['title'])}</span>
                        <Badge variant="secondary">{labelOf(debtStatuses, r['status'])}</Badge>
                        <Badge variant="outline">{labelOf(debtPriorities, r['priority'])}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {[
                          `Identificada em ${fmtDate(r['identified_at'])}`,
                          str(r['resolved_at']) && `Resolvida em ${fmtDate(r['resolved_at'])}`,
                          str(r['origin']) && `Origem: ${String(r['origin'])}`,
                          str(r['impact']) && `Impacto: ${String(r['impact'])}`,
                          responsibleName(r['responsible_user_id']) && `Responsável: ${responsibleName(r['responsible_user_id'])}`,

                        ].filter(Boolean).join(" · ")}
                      </p>
                      {str(r['description']) && <p className="text-xs text-muted-foreground">{String(r['description'])}</p>}
                      {str(r['resolution']) && <p className="text-xs text-muted-foreground">Resolução: {String(r['resolution'])}</p>}
                    </>
                  )}
                />
              </div>
            </TabsContent>
            <TabsContent value="prompts" className="space-y-4 pt-4">
              <Tabs value={promptView} onValueChange={setPromptView}>
                <TabsList className="h-8">
                  <TabsTrigger value="timeline" className="text-xs">Linha do tempo</TabsTrigger>
                  <TabsTrigger value="list" className="text-xs">Lista</TabsTrigger>
                </TabsList>
              </Tabs>
              <RecordSection
                hideList={promptView === "timeline"}
                table="project_prompts"
                projectId={projectId}
                addLabel="Novo prompt"
                emptyLabel="Nenhum prompt registrado."
                orderBy={{ column: "prompt_date", ascending: false }}
                fields={[
                  { key: "title", label: "Título", required: true, full: true },
                  { key: "url", label: "Link do chat", type: "url", full: true },
                  { key: "prompt_type", label: "Tipo", type: "select", options: promptTypes },
                  { key: "prompt_date", label: "Data do prompt", type: "date" },
                  { key: "sent_to_lovable_at", label: "Enviado ao Lovable em", type: "date" },
                  { key: "purpose", label: "Finalidade" },
                  { key: "commit_ref", label: "Referência de commit" },
                  { key: "notes", label: "Observações", type: "textarea" },
                ]}
                render={(r) => (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{String(r['title'])}</span>
                      <Badge variant="secondary">{promptTypes.find((p) => p.value === r['prompt_type'])?.label ?? String(r['prompt_type'])}</Badge>
                      <span className="text-xs text-muted-foreground">{fmtDate(r['prompt_date'])}</span>
                    </div>
                    {str(r['purpose']) && <p className="text-muted-foreground">{String(r['purpose'])}</p>}
                    {str(r['url']) && <ExternalUrl url={String(r['url'])} label="Abrir conversa" />}
                    {str(r['sent_to_lovable_at']) && (
                      <p className="text-xs text-muted-foreground">Enviado ao Lovable em {fmtDate(r['sent_to_lovable_at'])}</p>
                    )}
                    {str(r['commit_ref']) && (
                      <p className="text-xs text-muted-foreground font-mono break-all">commit: {String(r['commit_ref'])}</p>
                    )}
                    {str(r['notes']) && <p className="text-xs text-muted-foreground">{String(r['notes'])}</p>}
                  </>
                )}
              />
              {promptView === "timeline" && (
                <ProjectPromptsTimeline projectId={projectId} typeLabels={promptTypes} />
              )}
            </TabsContent>
            <TabsContent value="auditoria" className="pt-4">
              <AuditHistory entityType="project" entityId={projectId} extraIds={[...taskIds, ...auditScope]} />
            </TabsContent>
          </Tabs>
        )}

        {current === "equipe" && (
          <ProjectShares projectId={projectId} />
        )}
      </section>
    </div>
  );
}
