"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/client"
import { Lead } from "@/types/lead"
import StatusBadge from "@/components/crm/StatusBadge"

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])

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

  async function deleteLead(id: string) {
    await supabase.from("leads").delete().eq("id", id)
    load()
  }

  return (
    <main style={{ padding: 40 }}>
      <h1>CRM Imobiliário</h1>

      <Link href="/crm/leads/new">+ Novo Lead</Link>

      <div style={{ marginTop: 20 }}>
        {leads.map((lead) => (
          <div
            key={lead.id}
            style={{
              display: "flex",
              gap: 10,
              padding: 10,
              borderBottom: "1px solid #eee",
            }}
          >
            <strong>{lead.name}</strong>

            <StatusBadge status={lead.status} />

            <Link href={`/crm/leads/edit/${lead.id}`}>
              Editar
            </Link>

            <button onClick={() => deleteLead(lead.id)}>
              Remover
            </button>
          </div>
        ))}
      </div>
    </main>
  )
}
