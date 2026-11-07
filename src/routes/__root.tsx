import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/lib/auth-context";
import { getPublicEnv, type PublicEnv } from "@/lib/public-env.functions";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-4 text-muted-foreground">Página não encontrada</p>
        <Link to="/" className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
          Voltar
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();
  const message = error instanceof Error ? error.message : "Não foi possível carregar esta página.";
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold text-foreground">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  loader: async (): Promise<{ publicEnv: PublicEnv }> => {
    if (typeof window !== "undefined") {
      const cached = (window as unknown as { __PUBLIC_ENV__?: PublicEnv }).__PUBLIC_ENV__;
      if (cached) return { publicEnv: cached };
    }
    return { publicEnv: await getPublicEnv() };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "IGA Tecnologia — Gestão de Projetos" },
      { name: "description", content: "Gestão de Projetos e Tarefas" },
      { property: "og:title", content: "IGA Tecnologia — Gestão de Projetos" },
      { name: "twitter:title", content: "IGA Tecnologia — Gestão de Projetos" },
      { property: "og:description", content: "Gestão de Projetos e Tarefas" },
      { name: "twitter:description", content: "Gestão de Projetos e Tarefas" },
      { property: "og:image", content: "/iga-logo.png" },
      { name: "twitter:image", content: "/iga-logo.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Figtree:wght@400;500;600&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head><HeadContent /></head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { publicEnv } = Route.useLoaderData();
  return (
    <QueryClientProvider client={queryClient}>
      {/* Configuração pública do backend injetada pelo servidor (apenas URL/chave anon/project id). */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(e){window.__PUBLIC_ENV__=e;for(var k in e){if(e[k])window["__PUBLIC_ENV_"+k+"__"]=e[k];}})(${JSON.stringify(publicEnv).replace(/</g, "\\u003c")});`,
        }}
      />
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  );
}
