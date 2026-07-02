"use client"

import { useEffect, useState } from "react"
import { useSupabase } from "@/lib/hooks/useSupabase"
import { useRouter, useParams } from "next/navigation"

export default function EditLeadPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const params = useParams()

  const [lead, setLead] = useState<any>(null)

  // 🔵 CARREGAR LEAD
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
  }, [supabase, params.id])

  // 🟢 UPDATE LEAD
  async function updateLead() {
    if (!supabase) return

    await supabase
      .from("leads")
      .update({
        name: lead.name,
        status: lead.status,
      })
      .eq("id", params.id)

    router.push("/crm/leads")
  }

  // 🔴 DELETE LEAD (SEU ITEM 6)
  async function deleteLead() {
    if (!supabase) return

    const confirmDelete = confirm("Tem certeza que quer deletar esse lead?")

    if (!confirmDelete) return

    await supabase
      .from("leads")
      .delete()
      .eq("id", params.id)

    router.push("/crm/leads")
  }

  if (!lead) return <p>Carregando...</p>

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>

      <input
        value={lead.name || ""}
        onChange={(e) =>
          setLead({ ...lead, name: e.target.value })
        }
      />

      <select
        value={lead.status || "novo"}
        onChange={(e) =>
          setLead({ ...lead, status: e.target.value })
        }
      >
        <option value="novo">Novo</option>
        <option value="contato">Contato</option>
        <option value="ganho">Ganho</option>
        <option value="perdido">Perdido</option>
      </select>

      <div style={{ marginTop: 20 }}>
        <button onClick={updateLead}>
          Salvar
        </button>

        {/* 🔴 DELETE BUTTON */}
        <button
          onClick={deleteLead}
          style={{
            marginLeft: 10,
            background: "red",
            color: "white",
          }}
        >
          Deletar
        </button>
      </div>
    </div>
  )
}
