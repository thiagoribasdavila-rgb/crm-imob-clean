import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// 🔥 NÃO deixa o app quebrar silenciosamente
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ ENV não carregado:", {
    supabaseUrl,
    supabaseAnonKey,
  })

  throw new Error("Supabase env não configurado")
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
