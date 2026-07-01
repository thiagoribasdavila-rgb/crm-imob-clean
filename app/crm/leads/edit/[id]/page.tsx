import supabase from "@/lib/supabase"

type PageProps = {
  params: {
    id: string
  }
}

export default async function EditLead({ params }: PageProps) {
  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", params.id)
    .single()

  if (!lead || error) {
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
