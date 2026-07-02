"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import ProtectedRoute from "@/components/ui/ProtectedRoute"

export default function Dashboard() {
  const [total, setTotal] = useState(0)

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("leads").select("*")
      setTotal(data?.length || 0)
    }

    load()
  }, [])

  return (
    <ProtectedRoute>
      <div style={{ padding: 40 }}>
        <h1>Dashboard</h1>
        <h2>Total de Leads: {total}</h2>
      </div>
    </ProtectedRoute>
  )
}
