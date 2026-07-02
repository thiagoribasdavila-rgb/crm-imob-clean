"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { supabase } from "@/lib/supabase/client"

export default function EditLeadPage() {
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

  async function updateLead() {
    await supabase
      .from("leads")
      .update({ status: lead.status })
      .eq("id", id)

    alert("Atualizado!")
  }

  if (!lead) return <p>Carregando...</p>

  return (
    <div style={{ padding: 40 }}>
      <h1>Editar Lead</h1>

      <p>{lead.name}</p>

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

      <button onClick={updateLead}>Salvar</button>
    </div>
  )
}
