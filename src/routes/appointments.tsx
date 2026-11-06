import { createFileRoute, redirect } from "@tanstack/react-router";

// Endereço antigo (em inglês): redireciona para o novo, preservando os filtros da URL.
export const Route = createFileRoute("/appointments")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/agenda", search: search as never, replace: true });
  },
});
