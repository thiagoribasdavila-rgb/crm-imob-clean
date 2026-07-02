"use client"

import { supabase } from "@/lib/supabase/client"
import { useUser } from "@/lib/auth/useUser"

export default function LeadCard({ lead, refresh }: any) {
  const user = useUser()

  async function move(status: string) {
    await supabase
      .from("leads")
      .update({ status })
      .eq("id", lead.id)

    refresh()
  }

  async function remove() {
    await supabase
      .from("leads")
      .delete()
      .eq("id", lead.id)

    refresh()
  }

  return (
    <div style={{ border: "1px solid #ccc", padding: 10 }}>
      <strong>{lead.name}</strong>

      <div>
        <button onClick={() => move("novo")}>Novo</button>
        <button onClick={() => move("contato")}>Contato</button>
        <button onClick={() => move("proposta")}>Proposta</button>
        <button onClick={() => move("fechado")}>Fechado</button>
      </div>

      <button onClick={remove} style={{ color: "red" }}>
        Deletar
      </button>
    </div>
  )
}
