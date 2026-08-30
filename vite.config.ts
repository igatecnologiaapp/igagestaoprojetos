// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Compatibilidade de ambiente (sem segredos no código):
// o build oficial injeta apenas variáveis com prefixo VITE_ lidas de .env/process.env.
// Em ambientes de publicação/CI onde apenas os nomes sem prefixo estão disponíveis
// (SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / SUPABASE_PROJECT_ID), replicamos os valores
// para os nomes VITE_ correspondentes. Nenhum valor real é escrito aqui.
const publicEnvAliases: Record<string, string> = {
  VITE_SUPABASE_URL: "SUPABASE_URL",
  VITE_SUPABASE_PUBLISHABLE_KEY: "SUPABASE_PUBLISHABLE_KEY",
  VITE_SUPABASE_PROJECT_ID: "SUPABASE_PROJECT_ID",
};

const define: Record<string, string> = {};
for (const [viteName, plainName] of Object.entries(publicEnvAliases)) {
  const value = process.env[viteName] ?? process.env[plainName];
  if (value) define[`import.meta.env.${viteName}`] = JSON.stringify(value);
}

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
// @cloudflare/vite-plugin builds from this — wrangler.jsonc main alone is insufficient.
export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: { define },
});
