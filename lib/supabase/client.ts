import { createClient } from "@supabase/supabase-js"

let supabaseInstance: any = null

export function getSupabase() {
  if (supabaseInstance) return supabaseInstance

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    throw new Error("Supabase ENV não carregada")
  }

  supabaseInstance = createClient(url, key)
  return supabaseInstance
}
