"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase/client"

export default function NewLeadPage() {
  const [name, setName] = useState("")

  async function createLead() {
    await supabase.from("leads").insert({
      name,
      status: "novo",
    })

    alert("Lead criado!")
    setName("")
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Novo Lead</h1>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome"
      />

      <button onClick={createLead}>Salvar</button>
    </div>
  )
}
