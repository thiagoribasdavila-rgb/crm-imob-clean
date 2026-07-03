"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { Loading } from "@/components/core/Loading"

export default function CRMPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<any>({})

  useEffect(() => {
    async function load() {
      if (!supabase) return

      const { data: leads } = await supabase
        .from("leads")
        .select("*")

      setStats({
        total: leads?.length || 0,
      })

      setLoading(false)
    }

    load()
  }, [])

  if (loading) return <Loading />

  return (
    <div style={{ padding: 40 }}>
      <h1>CRM Dashboard</h1>

      <div>
        <h2>Total de Leads: {stats.total}</h2>
      </div>
    </div>
  )
}
