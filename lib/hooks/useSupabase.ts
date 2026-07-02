import { useMemo } from "react"
import { getSupabase } from "@/lib/supabase/client"

export function useSupabase() {
  return useMemo(() => getSupabase(), [])
}
