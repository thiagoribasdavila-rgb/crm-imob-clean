"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"

export default function LeadEditClient({ id }: { id: string }) {
  const [lead, setLead] = useState<any>(null)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("leads")
        .select("*")
        .eq("id", id)
        .single()

      if (!error) setLead(data)
    }

    load()
  }, [id])

  if (!lead) return <p>Carregando...</p>

  return (
    <div>
      <h1>Editar Lead</h1>

      <pre>{JSON.stringify(lead, null, 2)}</pre>
    </div>
  )
}
