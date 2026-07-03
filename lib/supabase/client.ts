import { createClient } from "@supabase/supabase-js"

export function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // 🔥 proteção total SSR
  if (typeof window === "undefined") {
    return null
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("❌ Supabase ENV não carregado")
    return null
  }

  return createClient(supabaseUrl, supabaseAnonKey)
}
