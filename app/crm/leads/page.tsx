import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const supabase = createSupabaseServer();

  const { data: leads, error } = await supabase
    .from("leads")
    .select("*");

  if (error) {
    console.error(error);
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM Leads</h1>
      <h2>Total: {leads?.length ?? 0}</h2>

      {leads?.map((lead: any) => (
        <div key={lead.id}>
          {lead.name}
        </div>
      ))}
    </div>
  );
}
