"use client"

import { useState } from "react"
import supabase from "@/lib/supabase"

export default function NewLead() {
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")

  async function handleSubmit() {
    await supabase.from("leads").insert({
      name,
      phone,
      status: "novo"
    })

    alert("Lead criado!")
  }

  return (
    <div style={{ padding: 20 }}>
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

      <button onClick={handleSubmit}>
        Salvar
      </button>
    </div>
  )
}
