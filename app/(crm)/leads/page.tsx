import { supabase } from "@/lib/supabase"

export default async function Leads() {
  const { data: leads, error } = await supabase
    .from("leads")
    .select("*")

  if (error) {
    return <p>Erro ao carregar leads</p>
  }

  return (
    <div style={{ padding: 30 }}>
      <h1>Leads</h1>

      {leads?.length === 0 ? (
        <p>Nenhum lead encontrado</p>
      ) : (
        <ul>
          {leads?.map((lead: any) => (
            <li key={lead.id}>
              {lead.nome} - {lead.telefone}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
