import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function LeadsPage() {
  const supabase = createSupabaseServer();

  const { data } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  const leads = data ?? []; // 🔥 nunca quebra

  return (
    <div style={{ padding: 20 }}>
      <h1>Leads</h1>

      {leads.map((lead: any) => (
        <div key={lead.id}>
          {lead.name} - {lead.email}
        </div>
      ))}
    </div>
  );
}
