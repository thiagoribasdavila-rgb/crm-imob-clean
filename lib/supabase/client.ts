import { createClient, SupabaseClient } from "@supabase/supabase-js";

let supabaseInstance: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!supabaseInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!url || !key) {
      throw new Error(
        "Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)"
      );
    }

    supabaseInstance = createClient(url, key);
  }
  return supabaseInstance;
}

// Uso recomendado (lazy, explícito):
export function getSupabase(): SupabaseClient {
  return getClient();
}

// Compatibilidade com código existente que faz `import { supabase } from "..."`.
// Só inicializa de verdade quando alguma propriedade é acessada.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    return Reflect.get(client as object, prop, receiver);
  },
});
