"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"

export default function LeadsPage() {
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
  }, [])

  return (
    <div>
      <h1>Leads</h1>

      {leads.map((lead) => (
        <div key={lead.id} style={{
          padding: 10,
          border: "1px solid #ddd",
          marginBottom: 10
        }}>
          <strong>{lead.name}</strong>
          <p>{lead.status}</p>
        </div>
      ))}
    </div>
  )
}
