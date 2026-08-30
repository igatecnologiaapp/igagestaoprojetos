// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Compatibilidade de ambiente (sem segredos no código):
// 1) build-time: se o ambiente de build expuser VITE_* / SUPABASE_* / PUBLIC_SUPABASE_*, o valor é embutido;
// 2) runtime: caso contrário, o valor é lido de window.__PUBLIC_ENV__, publicado pelo SSR (root route)
//    a partir das variáveis de ambiente do servidor. Somente dados públicos (URL, chave anon, project id).
// Nenhum valor real é escrito aqui.
const publicEnvAliases: Record<string, string[]> = {
  VITE_SUPABASE_URL: ["SUPABASE_URL", "PUBLIC_SUPABASE_URL"],
  VITE_SUPABASE_PUBLISHABLE_KEY: ["SUPABASE_PUBLISHABLE_KEY", "PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
  VITE_SUPABASE_PROJECT_ID: ["SUPABASE_PROJECT_ID", "PUBLIC_SUPABASE_PROJECT_ID"],
};

const define: Record<string, string> = {};
for (const [viteName, fallbacks] of Object.entries(publicEnvAliases)) {
  const value = [viteName, ...fallbacks].map((n) => process.env[n]).find(Boolean);
  define[`import.meta.env.${viteName}`] = value
    ? JSON.stringify(value)
    : `(typeof globalThis!=="undefined"&&globalThis.__PUBLIC_ENV__?globalThis.__PUBLIC_ENV__.${viteName}:undefined)`;
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: { define },
});
