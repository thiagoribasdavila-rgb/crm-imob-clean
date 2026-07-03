"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useParams } from "next/navigation"

export default function EditLeadPage() {
  const { id } = useParams()
  const [lead, setLead] = useState<any>(null)

  useEffect(() => {
    async function load() {
      if (!supabase) return

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
    <div>
      <h1>Editar Lead</h1>
      <p>{lead.name}</p>
    </div>
  )
}
