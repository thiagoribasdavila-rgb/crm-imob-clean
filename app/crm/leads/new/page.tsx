"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

export default function NewLeadPage() {
  const router = useRouter()

  const [name, setName] = useState("")
  const [status, setStatus] = useState("novo")

  async function handleCreate() {
    if (!supabase) return

    const { error } = await supabase.from("leads").insert([
      { name, status },
    ])

    if (!error) {
      router.push("/crm/leads")
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Novo Lead</h1>

      <input
        placeholder="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <button onClick={handleCreate}>
        Criar
      </button>
    </div>
  )
}
