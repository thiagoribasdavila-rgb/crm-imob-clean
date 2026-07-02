"use client"

import { useEffect, useState } from "react"
import { useSupabase } from "@/lib/hooks/useSupabase"

export default function LeadsPage() {
  const supabase = useSupabase()
  const [leads, setLeads] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) return

    async function load() {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })

      if (!error) setLeads(data || [])
      setLoading(false)
    }

    load()
  }, [supabase])

  if (loading) return <p>Carregando...</p>

  return (
    <div style={{ padding: 20 }}>
      <h1>Leads</h1>

      {leads.map((lead) => (
        <div key={lead.id}>
          {lead.name} - {lead.status}
        </div>
      ))}
    </div>
  )
}
