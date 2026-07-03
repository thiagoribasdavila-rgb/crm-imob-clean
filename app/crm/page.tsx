"use client"

import { useEffect, useState } from "react"
import { getSupabase } from "@/lib/supabase/client"

export default function CRMPage() {
  const supabase = getSupabase()
  const [leads, setLeads] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      if (!supabase) return

      const { data } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })

      setLeads(data || [])
    }

    load()
  }, [supabase])

  if (!supabase) {
    return <p>Carregando CRM...</p>
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM Dashboard</h1>

      <p>Total de leads: {leads.length}</p>

      <ul>
        {leads.map((lead) => (
          <li key={lead.id}>
            {lead.name} - {lead.status}
          </li>
        ))}
      </ul>
    </div>
  )
}
