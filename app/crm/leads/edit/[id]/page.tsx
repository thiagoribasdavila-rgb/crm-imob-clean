"use client"

import { useEffect, useState } from "react"
import { useSupabase } from "@/lib/hooks/useSupabase"
import { useRouter, useParams } from "next/navigation"

export default function EditLead() {
  const supabase = useSupabase()
  const router = useRouter()
  const params = useParams()

  const [lead, setLead] = useState<any>(null)

  useEffect(() => {
    async function load() {
      if (!supabase) return

      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("id", params.id)
        .single()

      setLead(data)
    }

    load()
  }, [supabase])

  async function updateLead() {
    await supabase
      .from("leads")
      .update({
        name: lead.name,
        status: lead.status
      })
      .eq("id", params.id)

    router.push("/crm/leads")
  }

  if (!lead) return <p>Carregando...</p>

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>

      <input
        value={lead.name}
        onChange={(e) => setLead({ ...lead, name: e.target.value })}
      />

      <select
        value={lead.status}
        onChange={(e) => setLead({ ...lead, status: e.target.value })}
      >
        <option value="novo">Novo</option>
        <option value="contato">Contato</option>
        <option value="ganho">Ganho</option>
        <option value="perdido">Perdido</option>
      </select>

      <button onClick={updateLead}>Salvar alterações</button>
    </div>
  )
}
