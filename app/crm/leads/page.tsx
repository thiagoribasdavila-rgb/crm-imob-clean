export const dynamic = "force-dynamic";

import { supabaseServer } from "@/lib/supabase/server";

export default async function LeadsPage() {
  const { data: leads, error } = await supabaseServer
    .from("leads")
    .select("*");

  if (error) {
    console.error(error);
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Leads</h1>

      {leads?.map((lead) => (
        <div key={lead.id} style={{
          padding: 10,
          borderBottom: "1px solid #ddd"
        }}>
          <p><b>Nome:</b> {lead.name}</p>
          <p><b>Email:</b> {lead.email}</p>
        </div>
      ))}
    </div>
  );
}
