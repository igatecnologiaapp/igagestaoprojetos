// Configuração do Vite independente do Lovable.
// Reproduz o que @lovable.dev/vite-tanstack-config fazia fora do sandbox do Lovable:
// tailwind, aliases do tsconfig, TanStack Start (entrada SSR em src/server.ts), Nitro no build,
// React, alias "@", dedupe do React/React Query e injeção das variáveis VITE_*.
//
// Destino da publicação: o Nitro detecta a plataforma automaticamente (Vercel, Netlify,
// Cloudflare…). Fora delas gera um servidor Node em .output/ (node .output/server/index.mjs).
// Para forçar um destino: NITRO_PRESET=vercel | node-server | cloudflare-module.
import { defineConfig, loadEnv } from "vite";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import viteReact from "@vitejs/plugin-react";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";

// Variáveis públicas do Supabase (URL, chave anon/publishable, id do projeto).
// Aceita os nomes VITE_* ou os equivalentes sem prefixo, para o mesmo .env servir ao
// navegador e ao servidor. Somente dados públicos; segredos nunca entram aqui.
const publicEnvAliases: Record<string, string[]> = {
  VITE_SUPABASE_URL: ["SUPABASE_URL", "PUBLIC_SUPABASE_URL"],
  VITE_SUPABASE_PUBLISHABLE_KEY: ["SUPABASE_PUBLISHABLE_KEY", "PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  VITE_SUPABASE_PROJECT_ID: ["SUPABASE_PROJECT_ID", "PUBLIC_SUPABASE_PROJECT_ID"],
};

export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };

  const define: Record<string, string> = {};
  for (const [key, value] of Object.entries(loadEnv(mode, process.cwd(), "VITE_"))) {
    define[`import.meta.env.${key}`] = JSON.stringify(value);
  }
  for (const [viteName, fallbacks] of Object.entries(publicEnvAliases)) {
    const value = [viteName, ...fallbacks].map((n) => env[n]).find(Boolean);
    // Sem valor no build: lê em tempo de execução o que o SSR publica em window.__PUBLIC_ENV_<NOME>__
    // (src/routes/__root.tsx). Assim o mesmo build serve a homologação e a produção.
    define[`import.meta.env.${viteName}`] = value ? JSON.stringify(value) : `globalThis.__PUBLIC_ENV_${viteName}__`;
  }

  return {
    define,
    css: { transformer: "lightningcss" },
    resolve: {
      alias: { "@": `${process.cwd()}/src` },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
    optimizeDeps: {
      include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime"],
    },
    server: { port: 8080 },
    plugins: [
      tailwindcss(),
      tsConfigPaths({ projects: ["./tsconfig.json"] }),
      tanstackStart({
        server: { entry: "server" },
        // Código em **/server/** ou "server-only" nunca vai para o navegador.
        importProtection: { behavior: "error", client: { files: ["**/server/**"], specifiers: ["server-only"] } },
      }),
      ...(command === "build" ? [nitro()] : []),
      viteReact(),
    ],
  };
});
