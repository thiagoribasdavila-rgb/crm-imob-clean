"use client"

import { useState } from "react"
import { createSupabaseBrowser } from "@/lib/supabase/client"

export default function NewLeadPage() {
  const supabase = createSupabaseBrowser()

  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")

  async function handleSubmit() {
    await supabase.from("leads").insert({
      name,
      phone,
    })

    alert("Lead criado!")
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Novo Lead</h1>

      <input
        placeholder="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <input
        placeholder="Telefone"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
      />

      <button onClick={handleSubmit}>Salvar</button>
    </div>
  )
}
