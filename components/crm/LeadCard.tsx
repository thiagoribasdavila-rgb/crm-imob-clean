"use client"

import { supabase } from "@/lib/supabase/client"

export default function LeadCard({ lead, refresh }: any) {
  async function move(status: string) {
    await supabase
      .from("leads")
      .update({ status })
      .eq("id", lead.id)

    refresh()
  }

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("leadId", lead.id)
      }}
      style={{
        padding: 10,
        background: "#fff",
        border: "1px solid #ddd",
        marginBottom: 10,
        cursor: "grab",
      }}
    >
      <strong>{lead.name}</strong>

      <div style={{ marginTop: 8 }}>
        <button onClick={() => move("novo")}>Novo</button>
        <button onClick={() => move("contato")}>Contato</button>
        <button onClick={() => move("proposta")}>Proposta</button>
        <button onClick={() => move("fechado")}>Fechado</button>
      </div>
    </div>
  )
}
