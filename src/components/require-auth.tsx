import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth, type AppModule } from "@/lib/auth-context";
import { AppShell } from "./app-shell";
import { Card } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

export function RequireAuth({ children, module }: { children: ReactNode; module?: AppModule }) {
  const { user, loading, canAccess } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [loading, user, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center text-muted-foreground text-sm">
        Carregando…
      </div>
    );
  }
  if (!user) return null;

  if (module && !canAccess(module)) {
    return (
      <AppShell>
        <Card className="p-8 text-center">
          <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
          <h2 className="mt-4 font-semibold">Módulo não liberado</h2>
          <p className="text-sm text-muted-foreground mt-1">Solicite acesso ao Administrador.</p>
        </Card>
      </AppShell>
    );
  }
  return <AppShell>{children}</AppShell>;
}
