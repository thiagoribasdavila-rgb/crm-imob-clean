"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import KanbanBoard from "@/components/crm/KanbanBoard"

export default function CRM() {
  const [leads, setLeads] = useState<any[]>([])

  async function load() {
    const { data } = await supabase.from("leads").select("*")
    setLeads(data || [])
  }

  useEffect(() => {
    load()
  }, [])

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM SaaS</h1>

      <KanbanBoard leads={leads} onMove={load} />
    </div>
  )
}
