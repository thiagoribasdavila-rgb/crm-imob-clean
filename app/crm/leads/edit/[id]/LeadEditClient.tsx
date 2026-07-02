"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"

export default function LeadEditClient({ id }: { id: string }) {
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
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>

      <input value={lead.name || ""} readOnly />
      <input value={lead.status || ""} readOnly />
    </div>
  )
}
