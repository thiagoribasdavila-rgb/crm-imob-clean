"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { supabase } from "@/lib/supabase/client"
import { Lead } from "@/types/lead"

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([])

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .order("created_at", { ascending: false })

      setLeads(data || [])
    }

    load()
  }, [])

  return (
    <main style={{ padding: 40 }}>
      <h1>CRM Imobiliário</h1>

      <Link href="/crm/leads/new">+ Novo Lead</Link>

      <ul>
        {leads.map((lead) => (
          <li key={lead.id}>
            {lead.name} - {lead.status}{" "}
            <Link href={`/crm/leads/edit/${lead.id}`}>Editar</Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
