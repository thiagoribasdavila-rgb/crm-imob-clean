"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabase } from "@/lib/supabase/client"

export default function NewLeadPage() {
  const supabase = getSupabase()
  const router = useRouter()

  const [name, setName] = useState("")
  const [status, setStatus] = useState("novo")

  async function handleCreate() {
    if (!supabase) return

    const { error } = await supabase.from("leads").insert([
      { name, status }
    ])

    if (!error) {
      router.push("/crm/leads")
    }
  }

  if (!supabase) return <p>Carregando...</p>

  return (
    <div style={{ padding: 20 }}>
      <h1>Novo Lead</h1>

      <input
        placeholder="Nome"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />

      <button onClick={handleCreate}>
        Criar Lead
      </button>
    </div>
  )
}
