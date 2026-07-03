"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useUser } from "@/lib/auth/useUser"

export default function DashboardPage() {
  const user = useUser()
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!user) return

    async function load() {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("user_id", user.id)

      if (!error) {
        setTotal(data?.length || 0)
      }
    }

    load()
  }, [user])

  return (
    <div style={{ padding: 40 }}>
      <h1>📊 Dashboard CRM</h1>

      <div style={{
        marginTop: 20,
        padding: 20,
        border: "1px solid #ddd",
        borderRadius: 8
      }}>
        <h2>Total de Leads</h2>
        <p style={{ fontSize: 24 }}>{total}</p>
      </div>
    </div>
  )
}
