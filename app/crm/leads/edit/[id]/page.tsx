import { createClient } from "@supabase/supabase-js"

type Props = {
  params: {
    id: string
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export default async function EditLead({ params }: Props) {
  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", params.id)
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
