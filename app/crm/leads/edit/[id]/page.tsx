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

  if (!lead) return <p>Lead não encontrado</p>

  return (
    <div style={{ padding: 40 }}>
      <h1>Editar Lead</h1>

      <p>{lead.name}</p>
      <p>{lead.phone}</p>
      <p>{lead.status}</p>
    </div>
  )
}
