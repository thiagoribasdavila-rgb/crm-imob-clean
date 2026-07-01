import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const { data: leads } = await supabase
    .from("leads")
    .select("*");

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM Leads</h1>
      <h2>Total: {leads?.length ?? 0}</h2>

      {leads?.map((lead: any) => (
        <div key={lead.id}>
          <p>{lead.name}</p>
        </div>
      ))}
    </div>
  );
}
