import { createFileRoute, redirect } from "@tanstack/react-router";

// Endereço antigo (em inglês): redireciona para o novo, preservando os filtros da URL.
export const Route = createFileRoute("/finance/services")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/financeiro/assinaturas", search: search as never, replace: true });
  },
});
