import { createSupabaseServer } from "@/lib/supabase/server"

export default async function EditLeadPage({
  params,
}: {
  params: { id: string }
}) {
  const supabase = createSupabaseServer()

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", params.id)
    .single()

  if (!lead) {
    return (
      <div style={{ padding: 40 }}>
        Lead não encontrado
      </div>
    )
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Editar Lead</h1>

      <p>Nome: {lead.name}</p>
      <p>Email: {lead.email}</p>
      <p>Status: {lead.status}</p>
    </div>
  )
}
