"use client"

import { useState } from "react"
import { useSupabase } from "@/lib/hooks/useSupabase"
import { useRouter } from "next/navigation"

export default function NewLead() {
  const supabase = useSupabase()
  const router = useRouter()

  const [name, setName] = useState("")
  const [status, setStatus] = useState("novo")

  async function createLead() {
    if (!supabase) return

    await supabase.from("leads").insert([
      { name, status }
    ])

    router.push("/crm/leads")
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Novo Lead</h1>

      <input placeholder="Nome" onChange={(e) => setName(e.target.value)} />
      
      <select onChange={(e) => setStatus(e.target.value)}>
        <option value="novo">Novo</option>
        <option value="contato">Contato</option>
        <option value="ganho">Ganho</option>
        <option value="perdido">Perdido</option>
      </select>

      <button onClick={createLead}>Salvar</button>
    </div>
  )
}
