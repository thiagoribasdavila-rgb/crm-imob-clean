import { createClient } from "@supabase/supabase-js"

let client: any = null

export function getSupabase() {
  if (typeof window === "undefined") return null

  if (client) return client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  client = createClient(url, key)

  return client
}
