"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

export default function LeadEditClient() {
  const { id } = useParams()
  const [lead, setLead] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("id", id)
        .single()

      setLead(data)
    }

    load()
  }, [id])

  if (!lead) return <p>Carregando...</p>

  return (
    <div style={{ padding: 40 }}>
      <h1>Editar Lead</h1>

      <p>Nome: {lead.name}</p>
      <p>Status: {lead.status}</p>
    </div>
  )
}
