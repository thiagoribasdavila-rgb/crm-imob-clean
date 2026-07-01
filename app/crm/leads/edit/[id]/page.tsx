import { supabaseServer } from "@/lib/supabase/server"

type Props = {
  params: { id: string }
}

export default async function EditLead({ params }: Props) {
  const { data: lead } = await supabaseServer
    .from("leads")
    .select("*")
    .eq("id", params.id)
    .single()

  if (!lead) {
    return <div>Lead não encontrado</div>
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>
      <p>Nome: {lead.name}</p>
      <p>Telefone: {lead.phone}</p>
      <p>Status: {lead.status}</p>
    </div>
  )
}
