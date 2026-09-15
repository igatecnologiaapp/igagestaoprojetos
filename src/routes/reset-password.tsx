import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import igaLogo from "@/assets/iga-logo-oficial.png.asset.json";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Definir senha — IGA Tecnologia" },
      { name: "description", content: "Defina uma nova senha de acesso ao sistema de gestão de projetos da IGA Tecnologia." },
      { property: "og:title", content: "Definir senha — IGA Tecnologia" },
      { property: "og:description", content: "Defina uma nova senha de acesso ao sistema de gestão de projetos da IGA Tecnologia." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("As senhas não conferem.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        toast.error("Não foi possível definir a senha. Solicite um novo link de acesso.");
        return;
      }
      toast.success("Senha definida com sucesso.");
      navigate({ to: "/dashboard" });
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
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nova senha</Label>
              <Input id="new-password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirmar senha</Label>
              <Input id="confirm-password" type="password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? "Salvando…" : "Definir senha"}</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
