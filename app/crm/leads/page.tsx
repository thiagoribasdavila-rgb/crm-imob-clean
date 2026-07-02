"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })

      if (!error) setLeads(data || [])
    }

    load()
  }, [])

  return (
    <div style={{ padding: 20 }}>
      <h1>Leads</h1>

      {leads.map((lead) => (
        <div key={lead.id} style={{ padding: 10, borderBottom: "1px solid #ddd" }}>
          <strong>{lead.name}</strong>
          <div>{lead.status}</div>
        </div>
      ))}
    </div>
  )
}
