import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import igaLogo from "@/assets/iga-logo-oficial.png.asset.json";

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Entrar — IGA Tecnologia" },
      { name: "description", content: "Acesse o sistema de gestão de projetos da IGA Tecnologia." },
      { property: "og:title", content: "Entrar — IGA Tecnologia" },
      { property: "og:description", content: "Acesse o sistema de gestão de projetos da IGA Tecnologia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function authErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  if (message.includes("invalid login credentials")) return "E-mail ou senha inválidos.";
  if (message.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (message.includes("failed to fetch") || message.includes("network") || message.includes("fetch")) {
    return "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.";
  }
  if (message.includes("rate limit")) return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";

  return "Não foi possível entrar agora. Tente novamente em instantes.";
}

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard" });
  }, [loading, user, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        toast.error(authErrorMessage(error));
        return;
      }
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(authErrorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      toast.success("Se o e-mail estiver cadastrado, você receberá as instruções de acesso.");
      setMode("signin");
    } catch {
      toast.error("Não foi possível enviar agora. Tente novamente em instantes.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: "var(--gradient-subtle)" }}>
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-6">
          <img src={igaLogo.url} alt="IGA Tecnologia" className="h-12 w-12 rounded-lg object-cover" />
          <div>
            <h1 className="text-xl font-display font-semibold leading-none">IGA TECNOLOGIA</h1>
            <p className="text-xs text-muted-foreground mt-1">Gestão de Projetos</p>
          </div>
        </div>
        <Card className="p-6 shadow-lg">
          {mode === "signin" ? (
            <form onSubmit={handleSignIn} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</Button>
              <Button type="button" variant="link" className="w-full" onClick={() => setMode("forgot")}>
                Esqueci minha senha
              </Button>
            </form>
          ) : (
            <form onSubmit={handleForgot} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email-reset">E-mail</Label>
                <Input id="email-reset" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>{busy ? "Enviando…" : "Enviar instruções"}</Button>
              <Button type="button" variant="link" className="w-full" onClick={() => setMode("signin")}>
                Voltar para o acesso
              </Button>
            </form>
          )}
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-4">
          O acesso é concedido exclusivamente por um Administrador do sistema. Não há autocadastro.
        </p>
      </div>
    </div>
  );
}
