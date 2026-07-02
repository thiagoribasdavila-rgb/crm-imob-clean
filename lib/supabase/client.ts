import { createClient } from "@supabase/supabase-js"

let supabaseInstance: any = null

export function getSupabase() {
  if (typeof window === "undefined") {
    // SSR safety: nunca inicializa no server
    return null
  }

  if (supabaseInstance) return supabaseInstance

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error("Supabase env não configurado")
  }

  supabaseInstance = createClient(url, key)

  return supabaseInstance
}
