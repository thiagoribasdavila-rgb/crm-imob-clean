import { createClient } from "@supabase/supabase-js";

let instance: ReturnType<typeof createClient> | null = null;

export function getSupabase() {
  if (instance) return instance;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error("ENV Supabase não carregada");
  }

  instance = createClient(url, key);
  return instance;
}
