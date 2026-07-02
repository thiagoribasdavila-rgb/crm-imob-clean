"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

export default function NewLeadPage() {
  const [name, setName] = useState("")
  const router = useRouter()

  async function createLead() {
    const { error } = await supabase.from("leads").insert({
      name,
      status: "novo",
    })

    if (!error) {
      router.push("/crm/leads")
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Novo Lead</h1>

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Nome do lead"
      />

      <button onClick={createLead}>Salvar</button>
    </div>
  )
}
