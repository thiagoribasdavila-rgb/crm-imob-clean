import supabase from "@/lib/supabase"

export default async function LeadsPage() {
  const { data: leads, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        Erro ao carregar leads
      </div>
    )
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM - Leads</h1>

      <div style={{ marginTop: 20 }}>
        {leads?.map((lead) => (
          <div key={lead.id} style={{
            padding: 12,
            border: "1px solid #ddd",
            marginBottom: 10,
            borderRadius: 8
          }}>
            <h3>{lead.name}</h3>
            <p>{lead.phone}</p>
            <p>Status: {lead.status}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
