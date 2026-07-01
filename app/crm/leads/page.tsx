export const dynamic = "force-dynamic";

import { createSupabaseServer } from "@/lib/supabase/server";

export default async function LeadsPage() {
  const supabase = createSupabaseServer();

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1>Leads</h1>

      {leads?.map((lead) => (
        <div key={lead.id}>
          {lead.name} - {lead.email}
        </div>
      ))}
    </div>
  );
}
