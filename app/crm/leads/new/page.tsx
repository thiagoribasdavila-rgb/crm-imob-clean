"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

export default function NewLead() {
  const [name, setName] = useState("")
  const router = useRouter()

  async function create() {
    await supabase.from("leads").insert({
      name,
      status: "novo",
    })

    router.push("/crm/leads")
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Novo Lead</h1>

      <input
        placeholder="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <button onClick={create}>Salvar</button>
    </div>
  )
}
