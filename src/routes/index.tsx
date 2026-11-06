import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Gestão de Projetos — IGA Tecnologia" },
      { name: "description", content: "Sistema de gestão de projetos, tarefas e clientes da IGA Tecnologia." },
      { property: "og:title", content: "Gestão de Projetos — IGA Tecnologia" },
      { property: "og:description", content: "Sistema de gestão de projetos, tarefas e clientes da IGA Tecnologia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: () => {
    throw redirect({ to: "/painel" });
  },
});
