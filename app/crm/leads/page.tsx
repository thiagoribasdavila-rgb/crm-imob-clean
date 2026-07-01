import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function LeadsPage() {
  const { data: leads, error } = await supabaseServer
    .from("leads")
    .select("*");

  if (error) {
    console.error("Erro Supabase:", error);
    return (
      <div style={{ padding: 20 }}>
        <h1>Erro ao carregar leads</h1>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Dashboard CRM</h1>

      <h2>Total: {leads?.length ?? 0}</h2>

      <div
        style={{
          marginTop: 20,
          padding: 20,
          background: "#f5f5f5",
          borderRadius: 10,
        }}
      >
        {leads?.map((lead) => (
          <div key={lead.id} style={{ padding: 10, borderBottom: "1px solid #ddd" }}>
            <p><b>Nome:</b> {lead.name}</p>
            <p><b>Email:</b> {lead.email}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
