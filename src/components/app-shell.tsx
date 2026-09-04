import { useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Building2,
  FolderKanban,
  ListChecks,
  LogOut,
  Calendar,
  FileText,
  Users,
  UserPlus,
  ShieldCheck,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Menu,
  Wallet,
  Tags,
  Server,
} from "lucide-react";
import { useAuth, type AppModule } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import igaLogo from "@/assets/iga-logo.png.asset.json";

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; module?: AppModule; ownerOnly?: boolean; permission?: string };
type NavGroup = { id: string; label: string; items: NavItem[] };

const groups: NavGroup[] = [
  {
    id: "overview",
    label: "Visão geral",
    items: [{ to: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  },
  {
    id: "organization",
    label: "Organização",
    items: [
      { to: "/companies", label: "Empresas", icon: Building2, module: "companies" },
      { to: "/users", label: "Usuários", icon: Users, ownerOnly: true },
      { to: "/permissions", label: "Permissões", icon: ShieldCheck, ownerOnly: true },
    ],
  },
  {
    id: "projects",
    label: "Gestão de projetos",
    items: [
      { to: "/projects", label: "Projetos", icon: FolderKanban, module: "projects" },
      { to: "/tasks", label: "Tarefas", icon: ListChecks, module: "tasks" },
      { to: "/appointments", label: "Agendamentos", icon: Calendar, module: "appointments" },
    ],
  },
  {
    id: "governance",
    label: "Governança e controle",
    items: [
      { to: "/reports", label: "Relatórios", icon: FileText, module: "reports" },
      { to: "/finance/vendors", label: "Financeiro · Fornecedores", icon: Wallet, permission: "financial.view" },
      { to: "/finance/categories", label: "Financeiro · Categorias", icon: Tags, permission: "financial.view" },
      { to: "/finance/services", label: "Financeiro · Serviços", icon: Server, permission: "financial.view" },
    ],
  },
  {
    id: "stakeholders",
    label: "Partes interessadas",
    items: [{ to: "/externals", label: "Externos", icon: UserPlus }],
  },
];

function Brand({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <Link to="/dashboard" onClick={onNavigate} className="flex items-center gap-3 min-w-0">
      <img
        src={igaLogo.url}
        alt="IGA Tecnologia"
        className="h-10 w-10 rounded-lg object-cover shrink-0"
      />
      {!collapsed && (
        <div className="min-w-0">
          <div className="font-display font-semibold text-base leading-none truncate">IGA TECNOLOGIA</div>
          <div className="text-xs text-muted-foreground mt-1">Gestão de Projetos</div>
        </div>
      )}
    </Link>
  );
}

function SidebarNav({
  collapsed,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const { canAccess, isOwner, hasPermission } = useAuth();
  const location = useLocation();

  const visibleGroups = groups
    .map((g) => ({
      ...g,
      items: g.items.filter((i) =>
        i.ownerOnly
          ? isOwner
          : i.permission
            ? hasPermission(i.permission)
            : i.module
              ? canAccess(i.module)
              : true,
      ),
    }))
    .filter((g) => g.items.length > 0);

  const activeGroupId =
    visibleGroups.find((g) => g.items.some((i) => location.pathname.startsWith(i.to)))?.id ??
    visibleGroups[0]?.id;

  const [openGroup, setOpenGroup] = useState<string | undefined>(activeGroupId);

  if (collapsed) {
    return (
      <nav className="flex-1 px-2 py-4 space-y-1">
        {visibleGroups.flatMap((g) => g.items).map((item) => {
          const Icon = item.icon;
          const active = location.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              title={item.label}
              aria-label={item.label}
              className={`flex items-center justify-center h-10 rounded-md transition-colors ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {visibleGroups.map((group) => {
        const open = openGroup === group.id;
        return (
          <div key={group.id} className="pb-1">
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`nav-group-${group.id}`}
              onClick={() => setOpenGroup(open ? undefined : group.id)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="truncate">{group.label}</span>
              <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} />
            </button>
            {open && (
              <div id={`nav-group-${group.id}`} className="space-y-1 mt-1">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active = location.pathname.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`flex items-center gap-3 pl-3 pr-3 py-2 rounded-md text-sm font-medium border-l-2 transition-colors ${
                        active
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-transparent text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}

function UserFooter({ collapsed }: { collapsed?: boolean }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const initials = (user?.email ?? "?").slice(0, 2).toUpperCase();
  return (
    <div className="p-3 border-t border-sidebar-border">
      <div className={`flex items-center gap-3 px-1 py-1 ${collapsed ? "flex-col" : ""}`}>
        <Avatar className="h-9 w-9"><AvatarFallback>{initials}</AvatarFallback></Avatar>
        {!collapsed && (
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.email}</div>
          </div>
        )}
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
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={`hidden md:flex flex-col border-r bg-sidebar text-sidebar-foreground transition-all ${
          collapsed ? "w-20" : "w-64"
        }`}
      >
        <div className={`py-5 border-b border-sidebar-border ${collapsed ? "px-4" : "px-5"}`}>
          <Brand collapsed={collapsed} />
        </div>
        <SidebarNav collapsed={collapsed} />
        <div className="px-3 pb-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-muted-foreground"
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
            {!collapsed && <span>Recolher menu</span>}
          </Button>
        </div>
        <UserFooter collapsed={collapsed} />
      </aside>

      <main className="flex-1 min-w-0">
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b bg-card">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Abrir menu">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 flex flex-col bg-sidebar text-sidebar-foreground">
              <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
              <div className="px-5 py-5 border-b border-sidebar-border">
                <Brand onNavigate={() => setMobileOpen(false)} />
              </div>
              <SidebarNav onNavigate={() => setMobileOpen(false)} />
              <UserFooter />
            </SheetContent>
          </Sheet>
          <Link to="/dashboard" className="flex items-center gap-2 min-w-0">
            <img src={igaLogo.url} alt="IGA Tecnologia" className="h-8 w-8 rounded-md object-cover" />
            <span className="font-display font-semibold truncate">IGA TECNOLOGIA</span>
          </Link>
        </div>
        <div className="p-6 md:p-8 max-w-7xl mx-auto w-full">{children}</div>
      </main>
    </div>
  );
}
