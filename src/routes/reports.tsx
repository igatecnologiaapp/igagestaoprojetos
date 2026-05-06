import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { RequireAuth } from "@/components/require-auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, FileText } from "lucide-react";

export const Route = createFileRoute("/reports")({
  component: () => <RequireAuth><ReportsPage /></RequireAuth>,
  head: () => ({ meta: [{ title: "Relatórios — FlowDesk" }] }),
});

const statusLabels: Record<string, string> = {
  planning: "Planejamento", in_progress: "Em andamento", paused: "Pausado",
  completed: "Concluído", cancelled: "Cancelado",
  pending: "Pendente", started: "Iniciada",
  scheduled: "Agendado", to_schedule: "Agendar", done: "Realizado", cancelled_app: "Cancelado",
};
const priorityLabels: Record<string, string> = { low: "Baixa", medium: "Média", high: "Alta", urgent: "Urgente" };

function ReportsPage() {
  const [projectId, setProjectId] = useState<string>("");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects-report-select"],
    queryFn: async () => {
      const { data } = await supabase.from("projects").select("id,name,companies(name)").order("name");
      return data ?? [];
    },
  });

  const { data: report } = useQuery({
    queryKey: ["report", projectId],
    enabled: !!projectId,
    queryFn: async () => {
      const [{ data: project }, { data: tasks }, { data: appointments }] = await Promise.all([
        supabase.from("projects").select("*, companies(name, contact_name, contact_email, contact_phone)").eq("id", projectId).single(),
        supabase.from("tasks").select("*").eq("project_id", projectId).order("created_at"),
        supabase.from("appointments").select("*").eq("project_id", projectId).order("start_at"),
      ]);
      return { project, tasks: tasks ?? [], appointments: appointments ?? [] };
    },
  });

  const exportPdf = () => {
    if (!report?.project) return;
    const p = report.project as { name: string; description: string | null; status: string; start_date: string | null; end_date: string | null; value: number | null; companies: { name: string } | null };
    const doc = new jsPDF();
    let y = 15;
    doc.setFontSize(16); doc.text("Relatório de Projeto", 14, y); y += 8;
    doc.setFontSize(11);
    doc.text(`Projeto: ${p.name}`, 14, y); y += 6;
    doc.text(`Empresa: ${p.companies?.name ?? "-"}`, 14, y); y += 6;
    doc.text(`Status: ${statusLabels[p.status] ?? p.status}`, 14, y); y += 6;
    if (p.start_date) { doc.text(`Início: ${new Date(p.start_date).toLocaleDateString("pt-BR")}`, 14, y); y += 6; }
    if (p.end_date) { doc.text(`Prazo: ${new Date(p.end_date).toLocaleDateString("pt-BR")}`, 14, y); y += 6; }
    if (p.value != null) { doc.text(`Valor: R$ ${Number(p.value).toFixed(2)}`, 14, y); y += 6; }
    if (p.description) {
      const lines = doc.splitTextToSize(`Descrição: ${p.description}`, 180);
      doc.text(lines, 14, y); y += lines.length * 5 + 2;
    }

    autoTable(doc, {
      startY: y + 4,
      head: [["Tarefa", "Status", "Prioridade", "Prazo"]],
      body: report.tasks.map((t) => [
        t.name,
        statusLabels[t.status] ?? t.status,
        priorityLabels[t.priority] ?? t.priority,
        t.due_date ? new Date(t.due_date).toLocaleDateString("pt-BR") : "-",
      ]),
      headStyles: { fillColor: [59, 130, 246] },
      didDrawPage: (d) => { y = d.cursor?.y ?? y; },
    });

    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8,
      head: [["Agendamento", "Status", "Início", "Local"]],
      body: report.appointments.map((a) => [
        a.title,
        statusLabels[a.status] ?? a.status,
        new Date(a.start_at).toLocaleString("pt-BR"),
        a.location ?? "-",
      ]),
      headStyles: { fillColor: [34, 197, 94] },
    });

    doc.save(`relatorio-${p.name.replace(/\s+/g, "-").toLowerCase()}.pdf`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-display font-semibold">Relatórios</h1>
        <p className="text-muted-foreground mt-1">Projeto, tarefas e agendamentos relacionados</p>
      </div>

      <Card className="p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5 flex-1 min-w-[240px]">
            <Label className="text-xs">Projeto</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger><SelectValue placeholder="Selecione um projeto" /></SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} {(p.companies as { name: string } | null)?.name ? `· ${(p.companies as { name: string }).name}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={exportPdf} disabled={!report?.project}>
            <Download className="h-4 w-4 mr-1" />Exportar PDF
          </Button>
        </div>
      </Card>

      {report?.project && (
        <div className="space-y-6">
          <Card className="p-5">
            <h2 className="font-display font-semibold text-lg">{(report.project as { name: string }).name}</h2>
            <p className="text-sm text-muted-foreground mt-1">
              {(report.project as { companies: { name: string } | null }).companies?.name ?? "—"}
            </p>
            {(report.project as { description: string | null }).description && (
              <p className="text-sm mt-3 whitespace-pre-wrap">{(report.project as { description: string }).description}</p>
            )}
            <div className="flex gap-2 mt-3 flex-wrap">
              <Badge variant="secondary">{statusLabels[(report.project as { status: string }).status]}</Badge>
              {(report.project as { end_date: string | null }).end_date && (
                <Badge variant="outline">Prazo: {new Date((report.project as { end_date: string }).end_date).toLocaleDateString("pt-BR")}</Badge>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h3 className="font-medium mb-3">Tarefas ({report.tasks.length})</h3>
            {report.tasks.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma tarefa</p>
            ) : (
              <ul className="divide-y">
                {report.tasks.map((t) => (
                  <li key={t.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate">{t.name}</span>
                    <div className="flex gap-1.5 shrink-0">
                      <Badge variant="outline" className="text-xs">{priorityLabels[t.priority]}</Badge>
                      <Badge variant="secondary" className="text-xs">{statusLabels[t.status]}</Badge>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h3 className="font-medium mb-3">Agendamentos ({report.appointments.length})</h3>
            {report.appointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum agendamento</p>
            ) : (
              <ul className="divide-y">
                {report.appointments.map((a) => (
                  <li key={a.id} className="py-2 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate">{a.title}</div>
                      <div className="text-xs text-muted-foreground">{new Date(a.start_at).toLocaleString("pt-BR")}</div>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0">{statusLabels[a.status]}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {!projectId && (
        <Card className="p-12 text-center">
          <FileText className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="mt-3 text-muted-foreground">Selecione um projeto para gerar o relatório</p>
        </Card>
      )}
    </div>
  );
}
