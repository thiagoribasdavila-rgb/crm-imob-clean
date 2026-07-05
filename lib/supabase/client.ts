import { createClient } from "@supabase/supabase-js";

export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 🔥 NÃO QUEBRAR O APP
  if (!url || !key) {
    console.error("ENV Supabase faltando");
    return null;
  }

  return createClient(url, key);
}
