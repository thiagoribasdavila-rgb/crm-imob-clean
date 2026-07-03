"use client"

import { useEffect, useState } from "react"
import { getSupabase } from "@/lib/supabase/client"

export default function LeadsPage() {
  const supabase = getSupabase()
  const [leads, setLeads] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      if (!supabase) return

      const { data } = await supabase.from("leads").select("*")
      setLeads(data || [])
    }

    load()
  }, [supabase])

  if (!supabase) return <p>Carregando leads...</p>

  return (
    <div style={{ padding: 20 }}>
      <h1>Leads</h1>

      {leads.map((lead) => (
        <div key={lead.id} style={{ borderBottom: "1px solid #ddd" }}>
          <p><b>{lead.name}</b></p>
          <p>Status: {lead.status}</p>
        </div>
      ))}
    </div>
  )
}
