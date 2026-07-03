"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { getSupabase } from "@/lib/supabase/client"

export default function EditLeadPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = getSupabase()

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
  }, [id, supabase])

  async function updateLead() {
    if (!supabase) return

    await supabase
      .from("leads")
      .update(lead)
      .eq("id", id)

    router.push("/crm/leads")
  }

  if (!supabase) return <p>Carregando...</p>

  if (!lead) return <p>Carregando lead...</p>

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>

      <input
        value={lead.name}
        onChange={(e) =>
          setLead({ ...lead, name: e.target.value })
        }
      />

      <button onClick={updateLead}>
        Salvar
      </button>
    </div>
  )
}
