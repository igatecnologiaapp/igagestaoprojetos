import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Building2, FolderKanban, ListChecks, LogOut, Sparkles, Calendar, FileText, Users, UserPlus, ShieldCheck } from "lucide-react";
import { useAuth, type AppModule } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; module?: AppModule; ownerOnly?: boolean };

const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/companies", label: "Empresas", icon: Building2, module: "companies" },
  { to: "/projects", label: "Projetos", icon: FolderKanban, module: "projects" },
  { to: "/tasks", label: "Tarefas", icon: ListChecks, module: "tasks" },
  { to: "/appointments", label: "Agendamentos", icon: Calendar, module: "appointments" },
  { to: "/reports", label: "Relatórios", icon: FileText, module: "reports" },
  { to: "/externals", label: "Externos", icon: UserPlus },
  { to: "/users", label: "Usuários", icon: Users, ownerOnly: true },
  { to: "/permissions", label: "Permissões", icon: ShieldCheck, ownerOnly: true },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, signOut, canAccess, isOwner } = useAuth();
  const visibleNav = nav.filter((i) => (i.ownerOnly ? isOwner : i.module ? canAccess(i.module) : true));
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
          {visibleNav.map((item) => {
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
        <div className="md:hidden flex items-center gap-2 px-4 py-3 border-b bg-card">
          <Link to="/dashboard" className="font-display font-semibold shrink-0">FlowDesk</Link>
          <nav className="flex gap-1 ml-auto min-w-0 overflow-x-auto">
            {visibleNav.map((item) => {
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
