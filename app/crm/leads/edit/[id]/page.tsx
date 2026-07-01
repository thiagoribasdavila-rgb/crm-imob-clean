import supabase from "@/lib/supabase"

type Props = {
  params: {
    id: string
  }
}

export default async function EditLead({ params }: Props) {
  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", params.id)
    .single()

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>

      <p>Nome: {lead?.name}</p>
      <p>Telefone: {lead?.phone}</p>
      <p>Status: {lead?.status}</p>
    </div>
  )
}
