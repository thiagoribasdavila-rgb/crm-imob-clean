import supabase from "@/lib/supabase"

export default async function LeadsPage() {
  const { data: leads, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    return <div>Erro ao carregar leads</div>
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Leads</h1>

      {leads?.map((lead) => (
        <div key={lead.id} style={{ marginBottom: 10 }}>
          <p><strong>Nome:</strong> {lead.name}</p>
          <p><strong>Telefone:</strong> {lead.phone}</p>
          <p><strong>Status:</strong> {lead.status}</p>
        </div>
      ))}
    </div>
  )
}
