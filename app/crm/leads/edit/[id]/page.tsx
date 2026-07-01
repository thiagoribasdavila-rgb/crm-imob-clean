import supabase from "@/lib/supabase"

type Props = {
  params: {
    id: string
  }
}

export default async function EditLead({ params }: Props) {
  const id = params?.id

  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !lead) {
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
