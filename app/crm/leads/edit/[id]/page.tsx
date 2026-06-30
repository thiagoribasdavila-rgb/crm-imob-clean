"use client"

import { useEffect, useState } from "react"
import supabase from "@/lib/supabase"

export default function EditLead({ params }) {
  const [lead, setLead] = useState(null)

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .eq("id", params.id)
        .single()

      setLead(data)
    }

    load()
  }, [])

  async function updateLead() {
    await supabase
      .from("leads")
      .update(lead)
      .eq("id", params.id)

    alert("Atualizado!")
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

      <input
        value={lead.phone}
        onChange={(e) =>
          setLead({ ...lead, phone: e.target.value })
        }
      />

      <button onClick={updateLead}>
        Atualizar
      </button>
    </div>
  )
}
