import Link from "next/link"
import { createSupabaseServer } from "@/lib/supabase/server"

export default async function LeadsPage() {
  const supabase = createSupabaseServer()

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false })

  return (
    <div style={{ padding: 40 }}>
      <h1>Leads</h1>

      <Link href="/crm/leads/new">+ Novo Lead</Link>

      <div style={{ marginTop: 20, display: "grid", gap: 10 }}>
        {leads?.map((lead) => (
          <div
            key={lead.id}
            style={{
              padding: 15,
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
          >
            <strong>{lead.name}</strong>
            <p>{lead.phone}</p>
            <small>Status: {lead.status}</small>

            <br />

            <Link href={`/crm/leads/edit/${lead.id}`}>
              Editar
            </Link>
          </div>
        ))}
      </div>
    </div>
  )
}
