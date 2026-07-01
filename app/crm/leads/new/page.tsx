"use client"

import { useState } from "react"
import { createSupabaseClient } from "@/lib/supabase/client"

export default function NewLead() {
  const supabase = createSupabaseClient()

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")

  async function handleSubmit() {
    const { error } = await supabase.from("leads").insert({
      name,
      phone,
      status: "novo",
    })

    if (error) {
      alert("Erro ao salvar")
      return
    }

    alert("Lead criado!")
    window.location.href = "/crm/leads"
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Novo Lead</h1>

      <input
        placeholder="Nome"
        onChange={(e) => setName(e.target.value)}
      />

      <br />

      <input
        placeholder="Telefone"
        onChange={(e) => setPhone(e.target.value)}
      />

      <br />

      <button onClick={handleSubmit}>
        Salvar
      </button>
    </div>
  )
}
