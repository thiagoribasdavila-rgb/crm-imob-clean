import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CRMPage() {
  const supabase = createSupabaseServer();

  const { data: leads, error } = await supabase
    .from("leads")
    .select("*");

  if (error) {
    console.error("Supabase error:", error);
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM Dashboard</h1>

      <h2>Total leads: {leads?.length ?? 0}</h2>

      <ul>
        {leads?.map((lead: any) => (
          <li key={lead.id}>
            {lead.name} - {lead.email}
          </li>
        ))}
      </ul>
    </div>
  );
}
