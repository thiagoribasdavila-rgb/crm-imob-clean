"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase/client"

export default function NewLead() {
  const [name, setName] = useState("")

  async function createLead() {
    await supabase.from("leads").insert({
      name,
      status: "novo",
    })

    alert("Lead criado!")
  }

  return (
    <div>
      <h1>Novo Lead</h1>

      <input
        placeholder="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <button onClick={createLead}>Salvar</button>
    </div>
  )
}
