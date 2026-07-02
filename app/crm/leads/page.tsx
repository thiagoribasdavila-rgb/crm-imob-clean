import { createSupabaseClient } from "@/lib/supabase/client"

export default async function LeadsPage() {
  const supabase = createSupabaseClient()

  const { data } = await supabase
    .from("leads")
    .select("*")

  return (
    <div>
      <h1>Leads</h1>

      {data?.map((lead) => (
        <div key={lead.id}>
          {lead.name}
        </div>
      ))}
    </div>
  )
}
