import { createServerFn } from "@tanstack/react-start";

export type PublicEnv = {
  VITE_SUPABASE_URL: string;
  VITE_SUPABASE_PUBLISHABLE_KEY: string;
  VITE_SUPABASE_PROJECT_ID: string;
};

// Somente valores públicos por natureza (URL do projeto, chave publishable/anon e project id).
// Nenhum segredo (service role, tokens, senhas) é lido ou exposto aqui.
export const getPublicEnv = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicEnv> => {
    const pick = (...names: string[]) => {
      for (const name of names) {
        const value = process.env[name];
        if (value) return value;
      }
      return "";
    };

    return {
      VITE_SUPABASE_URL: pick("VITE_SUPABASE_URL", "SUPABASE_URL", "PUBLIC_SUPABASE_URL"),
      VITE_SUPABASE_PUBLISHABLE_KEY: pick(
        "VITE_SUPABASE_PUBLISHABLE_KEY",
        "SUPABASE_PUBLISHABLE_KEY",
        "PUBLIC_SUPABASE_PUBLISHABLE_KEY",
      ),
      VITE_SUPABASE_PROJECT_ID: pick(
        "VITE_SUPABASE_PROJECT_ID",
        "SUPABASE_PROJECT_ID",
        "PUBLIC_SUPABASE_PROJECT_ID",
      ),
    };
  },
);
