import { getSupabase } from "./client"

export function useSafeSupabase() {
  const supabase = getSupabase()

  if (!supabase) {
    throw new Error("Supabase não inicializado no client")
  }

  return supabase
}
