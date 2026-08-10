"use client"

import { supabase } from "@/lib/supabase/client"

export default function StatusChanger({
  id,
  status,
  onChange,
}: any) {
  async function update(newStatus: string) {
    await supabase
      .from("leads")
      .update({ status: newStatus })
      .eq("id", id)

    onChange()
  }

  return (
    <select
      value={status}
      onChange={(e) => update(e.target.value)}
    >
      <option value="novo">Novo</option>
      <option value="contato">Contato</option>
      <option value="proposta">Proposta</option>
      <option value="fechado">Fechado</option>
    </select>
  )
}
