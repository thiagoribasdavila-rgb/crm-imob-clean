import { createClient } from "@supabase/supabase-js";

let supabaseInstance: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (supabaseInstance) return supabaseInstance;

  if (typeof window === "undefined") {
    throw new Error("Supabase client usado no server errado");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("ENV do Supabase não carregado");
  }

  supabaseInstance = createClient(url, key);

  return supabaseInstance;
}
