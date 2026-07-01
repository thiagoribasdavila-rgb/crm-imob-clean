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

      <ul>
        {leads?.map((lead) => (
          <li key={lead.id}>
            {lead.name} - {lead.email}
          </li>
        ))}
      </ul>
    </div>
  )
}
