"use client"

import { supabase } from "@/lib/supabase/client"

export default function SupabaseGuard({
  children,
}: {
  children: React.ReactNode
}) {
  if (!supabase) {
    return (
      <div style={{
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        fontFamily: "sans-serif"
      }}>
        <h2>CRM offline</h2>
        <p>Configurar .env do Supabase</p>
      </div>
    )
  }

  return <>{children}</>
}
