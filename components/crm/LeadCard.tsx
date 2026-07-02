"use client"

import { supabase } from "@/lib/supabase/client"

export default function LeadCard({ lead, onMove }: any) {
  async function move(status: string) {
    await supabase
      .from("leads")
      .update({ status })
      .eq("id", lead.id)

    onMove()
  }

  return (
    <div style={{ padding: 10, border: "1px solid #ccc" }}>
      <strong>{lead.name}</strong>

      <div>
        <button onClick={() => move("novo")}>Novo</button>
        <button onClick={() => move("contato")}>Contato</button>
        <button onClick={() => move("proposta")}>Proposta</button>
        <button onClick={() => move("fechado")}>Fechado</button>
      </div>
    </div>
  )
}
