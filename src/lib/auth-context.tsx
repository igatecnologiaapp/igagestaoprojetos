import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AppRole = "owner" | "collaborator" | "viewer";
export type AppModule = "companies" | "projects" | "tasks" | "appointments" | "reports";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  modules: AppModule[]; // empty = all allowed (legacy/default)
  permissions: string[];
  loading: boolean;
  signOut: () => Promise<void>;
  canEdit: boolean;
  isOwner: boolean;
  canAccess: (m: AppModule) => boolean;
  hasPermission: (key: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [modules, setModules] = useState<AppModule[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const loadAccess = (uid: string) => {
    supabase.from("user_roles").select("role").eq("user_id", uid)
      .then(({ data }) => {
        const userRoles = (data ?? []).map((r) => r.role as AppRole);
        setRoles(userRoles);
        if (userRoles.length > 0) {
          supabase.from("role_permissions").select("permission_key").in("role", userRoles)
            .then(({ data: rp }) => setPermissions((rp ?? []).map((r) => r.permission_key)));
        } else {
          setPermissions([]);
        }
      });
    supabase.from("user_module_access").select("module").eq("user_id", uid)
      .then(({ data }) => setModules((data ?? []).map((r) => r.module as AppModule)));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        setTimeout(() => loadAccess(s.user.id), 0);
      } else {
        setRoles([]);
        setModules([]);
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) loadAccess(s.user.id);
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const isOwner = roles.includes("owner");

  const value: AuthContextValue = {
    user,
    session,
    roles,
    modules,
    loading,
    signOut: async () => {
      await supabase.auth.signOut();
    },
    canEdit: isOwner || roles.includes("collaborator"),
    isOwner,
    canAccess: (m) => isOwner || modules.length === 0 || modules.includes(m),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
