"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useParams, useRouter } from "next/navigation"

export default function EditLead() {
  const { id } = useParams()
  const router = useRouter()

  const [lead, setLead] = useState<any>(null)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    const { data } = await supabase
      .from("leads")
      .select("*")
      .eq("id", id)
      .single()

    setLead(data)
  }

  async function save() {
    await supabase
      .from("leads")
      .update({
        name: lead.name,
        status: lead.status,
      })
      .eq("id", id)

    router.push("/crm/leads")
  }

  if (!lead) return <p>Carregando...</p>

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>

      <input
        value={lead.name}
        onChange={(e) =>
          setLead({ ...lead, name: e.target.value })
        }
      />

      <select
        value={lead.status}
        onChange={(e) =>
          setLead({ ...lead, status: e.target.value })
        }
      >
        <option value="novo">Novo</option>
        <option value="contato">Contato</option>
        <option value="proposta">Proposta</option>
        <option value="fechado">Fechado</option>
      </select>

      <button onClick={save}>Salvar</button>
    </div>
  )
}
