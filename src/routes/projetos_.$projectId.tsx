import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { RequireAuth } from "@/components/require-auth";
import { ProjectFolder, folderSections, type FolderSection } from "@/components/project-detail";

const sectionIds = folderSections.map((s) => s.id) as [FolderSection, ...FolderSection[]];
const searchSchema = z.object({ secao: z.enum(sectionIds).optional() });

export const Route = createFileRoute("/projetos_/$projectId")({
  validateSearch: searchSchema,
  component: ProjectFolderPage,
  head: () => ({
    meta: [
      { title: "Pasta do projeto — IGA Tecnologia" },
      { name: "description", content: "Pasta digital do projeto: visão geral, tarefas, financeiro, ferramentas, documentos, histórico e equipe." },
      { property: "og:title", content: "Pasta do projeto — IGA Tecnologia" },
      { property: "og:description", content: "Pasta digital do projeto: visão geral, tarefas, financeiro, ferramentas, documentos, histórico e equipe." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ProjectFolderPage() {
  const { projectId } = Route.useParams();
  const { secao } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <RequireAuth module="projects">
      <ProjectFolder
        projectId={projectId}
        section={secao ?? "visao-geral"}
        onSectionChange={(s) =>
          navigate({ search: { secao: s === "visao-geral" ? undefined : s }, replace: true, resetScroll: false })
        }
      />
    </RequireAuth>
  );
}
