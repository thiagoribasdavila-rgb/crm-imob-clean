import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const { data: leads, error } = await supabaseServer
    .from("leads")
    .select("*")
    .limit(100);

  if (error) {
    console.error(error);
    return (
      <div style={{ padding: 20 }}>
        <h1>Erro ao carregar leads</h1>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM Leads</h1>
      <h2>Total: {leads?.length ?? 0}</h2>

      {leads?.map((lead) => (
        <div key={lead.id}>
          <p>{lead.name}</p>
        </div>
      ))}
    </div>
  );
}
