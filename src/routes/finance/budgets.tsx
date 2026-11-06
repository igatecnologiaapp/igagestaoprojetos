import { createFileRoute, redirect } from "@tanstack/react-router";

// Endereço antigo (em inglês): redireciona para o novo, preservando os filtros da URL.
export const Route = createFileRoute("/finance/budgets")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/financeiro/orcamentos", search: search as never, replace: true });
  },
});
