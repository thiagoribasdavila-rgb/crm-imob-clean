import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const supabase = createSupabaseServer();

  const { data } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  const leads = data ?? [];

  return (
    <div style={{ padding: 20 }}>
      <h1>Leads</h1>

      {leads.length === 0 ? (
        <p>Nenhum lead encontrado</p>
      ) : (
        leads.map((lead: any) => (
          <div key={lead.id}>
            {lead.name} - {lead.email}
          </div>
        ))
      )}
    </div>
  );
}
