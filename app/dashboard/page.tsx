"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useUser } from "@/lib/auth/useUser"

export default function Dashboard() {
  const user = useUser()
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!user) return

    async function load() {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("user_id", user.id)

      setTotal(data?.length || 0)
    }

    load()
  }, [user])

  return (
    <div style={{ padding: 40 }}>
      <h1>Dashboard Empresa</h1>

      <h2>Total de Leads: {total}</h2>
    </div>
  )
}
