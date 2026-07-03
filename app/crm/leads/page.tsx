"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      // 🔥 PASSO 2: proteção obrigatória
      if (!supabase) return

      const { data, error } = await supabase
        .from("leads")
        .select("*")

      if (!error) {
        setLeads(data || [])
      }
    }

    load()
  }, [])

  return (
    <div style={{ padding: 40 }}>
      <h1>Leads</h1>

      {leads.map((lead) => (
        <div key={lead.id}>
          {lead.name} - {lead.status}
        </div>
      ))}
    </div>
  )
}
