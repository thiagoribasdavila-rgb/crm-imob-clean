export const dynamic = "force-dynamic";

import { supabaseServer } from "@/lib/supabase/server";

export default async function CRMPage() {
  const { data: leads, error } = await supabaseServer
    .from("leads")
    .select("*");

  const total = leads?.length ?? 0;

  return (
    <div style={{ padding: 20 }}>
      <h1>CRM Dashboard</h1>

      <div style={{
        marginTop: 20,
        padding: 20,
        background: "#f5f5f5",
        borderRadius: 10
      }}>
        <h2>Total de Leads: {total}</h2>
      </div>
    </div>
  );
}
