"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import Link from "next/link"

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false })

    setLeads(data || [])
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Leads</h1>

      <Link href="/crm/leads/new">
        ➕ Novo Lead
      </Link>

      <ul>
        {leads.map((lead) => (
          <li key={lead.id}>
            {lead.name} - {lead.status}

            <Link href={`/crm/leads/edit/${lead.id}`}>
              Editar
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
