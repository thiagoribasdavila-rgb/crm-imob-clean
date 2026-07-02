"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      const { data } = await supabase.from("leads").select("*")
      setLeads(data || [])
    }

    load()
  }, [])

  return (
    <div style={{ padding: 20 }}>
      <h1>Leads</h1>

      {leads.map((l) => (
        <div key={l.id}>
          {l.name} - {l.status}
        </div>
      ))}
    </div>
  )
}
