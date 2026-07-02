"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"

export default function LeadEditClient() {
  const [leads, setLeads] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase.from("leads").select("*")

      if (!error) {
        setLeads(data || [])
      }
    }

    load()
  }, [])

  return (
    <div>
      <h1>Leads</h1>

      {leads.map((lead) => (
        <div key={lead.id}>
          {lead.name} - {lead.status}
        </div>
      ))}
    </div>
  )
}

