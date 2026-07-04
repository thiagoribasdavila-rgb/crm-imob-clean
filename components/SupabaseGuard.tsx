"use client"

import { supabase } from "@/lib/supabase/client"

export function SupabaseGuard({
  children,
}: {
  children: React.ReactNode
}) {
  let hasSupabase = true

  try {
    void supabase.auth
  } catch {
    hasSupabase = false
  }

  if (!hasSupabase) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          fontFamily: "system-ui",
        }}
      >
        <h2>CRM indisponível</h2>
        <p>Supabase não configurado corretamente (.env)</p>
      </div>
    )
  }

  return <>{children}</>
}
