import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// 🔥 validação forte (evita build quebrado silencioso)
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing Supabase environment variables (server)");
}

export const supabaseServer = createClient(
  supabaseUrl,
  supabaseAnonKey
);
