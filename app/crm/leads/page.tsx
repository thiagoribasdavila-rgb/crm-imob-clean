"use client"

import { useEffect, useState } from "react"
import { getSupabase } from "@/lib/supabase/client"

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([])

  useEffect(() => {
    async function load() {
      const supabase = getSupabase()

      const { data, error } = await supabase
        .from("leads")
        .select("*")

      if (!error) setLeads(data || [])
    }

    load()
  }, [])

  return (
    <div>
      <h1>Leads</h1>

      {leads.map((l) => (
        <div key={l.id}>
          {l.name} - {l.status}
        </div>
      ))}
    </div>
  )
}
