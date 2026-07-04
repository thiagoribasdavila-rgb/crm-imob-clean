import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function getSupabase() {
  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("❌ Supabase env não configurado");
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey);
}
