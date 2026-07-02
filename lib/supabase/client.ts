import { createClient } from "@supabase/supabase-js"

export const createSupabaseClient = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

  if (!url || !key) {
    throw new Error("Supabase ENV missing")
  }

  return createClient(url, key)
}
