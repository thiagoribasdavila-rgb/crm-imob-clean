export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createSupabaseServer } from "@/lib/supabase/server";

export default async function LeadsPage() {
  const supabase = createSupabaseServer();

  const { data: leads, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return <div>Erro</div>;

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
