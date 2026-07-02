"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useUser } from "@/lib/auth/useUser"
import KanbanBoard from "@/components/crm/KanbanBoard"

export default function CRM() {
  const user = useUser()
  const [leads, setLeads] = useState<any[]>([])

  async function load() {
    if (!user) return

    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", user.id)

    setLeads(data || [])
  }

  useEffect(() => {
    load()
  }, [user])

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM Empresa</h1>

      <KanbanBoard leads={leads} refresh={load} />
    </div>
  )
}
