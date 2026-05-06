import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Building2, FolderKanban, ListChecks, LogOut, Sparkles, Calendar, FileText } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/companies", label: "Empresas", icon: Building2 },
  { to: "/projects", label: "Projetos", icon: FolderKanban },
  { to: "/tasks", label: "Tarefas", icon: ListChecks },
  { to: "/appointments", label: "Agendamentos", icon: Calendar },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex w-64 flex-col border-r bg-sidebar text-sidebar-foreground">
        <div className="px-6 py-6 border-b border-sidebar-border">
          <Link to="/dashboard" className="flex items-center gap-2">
            <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="font-display font-semibold text-base leading-none">FlowDesk</div>
              <div className="text-xs text-muted-foreground mt-1">Gestão de projetos</div>
            </div>
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="flex items-center gap-3 px-2 py-2">
            <Avatar className="h-9 w-9"><AvatarFallback>{initials}</AvatarFallback></Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.email}</div>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={async () => { await signOut(); navigate({ to: "/auth" }); }}
              aria-label="Sair"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="md:hidden flex items-center justify-between px-4 py-3 border-b bg-card">
          <Link to="/dashboard" className="font-display font-semibold">FlowDesk</Link>
          <nav className="flex gap-1">
            {nav.map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.to} to={item.to} className="p-2 rounded-md hover:bg-accent">
                  <Icon className="h-4 w-4" />
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">{children}</div>
      </main>
    </div>
  );
}
