"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { Loading } from "@/components/core/Loading"

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (!supabase) return

      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })

      if (!error) setLeads(data || [])

      setLoading(false)
    }

    load()
  }, [])

  if (loading) return <Loading />

  return (
    <div style={{ padding: 40 }}>
      <h1>Leads</h1>

      {leads.map((lead) => (
        <div
          key={lead.id}
          style={{
            padding: 10,
            borderBottom: "1px solid #ddd",
          }}
        >
          <strong>{lead.name}</strong> — {lead.status}
        </div>
      ))}
    </div>
  )
}
