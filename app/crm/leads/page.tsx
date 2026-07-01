export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createSupabaseServer } from "@/lib/supabase/server";

async function getLeads() {
  const supabase = createSupabaseServer();

  return supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });
}

export default async function LeadsPage() {
  const { data: leads } = await getLeads();

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
