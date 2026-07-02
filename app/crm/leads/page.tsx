"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })

      if (!error) setLeads(data || [])
      setLoading(false)
    }

    load()
  }, [])

  if (loading) return <p>Carregando...</p>

  return (
    <div style={{ padding: 20 }}>
      <h1>Leads</h1>

      {leads.map((lead) => (
        <div key={lead.id}>
          <strong>{lead.name}</strong> - {lead.status}
        </div>
      ))}
    </div>
  )
}
