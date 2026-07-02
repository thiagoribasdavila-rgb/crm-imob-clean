"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import Link from "next/link"
import StatusChanger from "@/components/crm/StatusChanger"

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([])

  async function load() {
    const { data } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })

    setLeads(data || [])
  }

  useEffect(() => {
    load()
  }, [])

  async function remove(id: string) {
    await supabase.from("leads").delete().eq("id", id)
    load()
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM Leads</h1>

      <Link href="/crm/leads/new">➕ Novo Lead</Link>

      {leads.map((lead) => (
        <div
          key={lead.id}
          style={{
            border: "1px solid #ddd",
            padding: 10,
            marginTop: 10,
          }}
        >
          <strong>{lead.name}</strong>

          <div>
            <StatusChanger
              id={lead.id}
              status={lead.status}
              onChange={load}
            />
          </div>

          <div style={{ marginTop: 5 }}>
            <Link href={`/crm/leads/edit/${lead.id}`}>
              Editar
            </Link>

            <button onClick={() => remove(lead.id)}>
              Deletar
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
