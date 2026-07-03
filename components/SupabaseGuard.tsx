"use client"

import { supabase } from "@/lib/supabase/client"

export function SupabaseGuard({
  children,
}: {
  children: React.ReactNode
}) {
  if (!supabase) {
    return <p>Erro: Supabase não configurado (.env)</p>
  }

  return children
}
