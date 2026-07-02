"use client"

import { useEffect, useState } from "react"
import { useSupabase } from "@/lib/hooks/useSupabase"
import Link from "next/link"

export default function LeadsPage() {
  const supabase = useSupabase()
  const [leads, setLeads] = useState<any[]>([])
  const [filter, setFilter] = useState("todos")

  async function load() {
    if (!supabase) return

    let query = supabase.from("leads").select("*")

    if (filter !== "todos") {
      query = query.eq("status", filter)
    }

    const { data } = await query.order("created_at", { ascending: false })

    setLeads(data || [])
  }

  useEffect(() => {
    load()
  }, [supabase, filter])

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM Leads</h1>

      <Link href="/crm/leads/new">+ Novo Lead</Link>

      <div style={{ marginTop: 10 }}>
        <button onClick={() => setFilter("todos")}>Todos</button>
        <button onClick={() => setFilter("novo")}>Novo</button>
        <button onClick={() => setFilter("contato")}>Contato</button>
        <button onClick={() => setFilter("ganho")}>Ganho</button>
      </div>

      <div style={{ marginTop: 20 }}>
        {leads.map((lead) => (
          <div key={lead.id} style={{ padding: 10, borderBottom: "1px solid #ddd" }}>
            <strong>{lead.name}</strong> - {lead.status}

            <div>
              <Link href={`/crm/leads/edit/${lead.id}`}>Editar</Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
