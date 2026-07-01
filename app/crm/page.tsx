import { supabase } from "@/lib/supabase";

export default async function Dashboard() {
  const { data: leads, error } = await supabase
    .from("leads")
    .select("*");

  const total = leads?.length ?? 0;

  return (
    <div style={{ padding: 20 }}>
      <h1>Dashboard CRM</h1>

      <div
        style={{
          padding: 20,
          background: "#f5f5f5",
          borderRadius: 10,
          marginTop: 20,
        }}
      >
        <h2>Total de Leads: {total}</h2>
      </div>

      <div style={{ marginTop: 20 }}>
        {leads?.map((lead: any) => (
          <div
            key={lead.id}
            style={{
              padding: 10,
              marginBottom: 10,
              border: "1px solid #ddd",
              borderRadius: 8,
            }}
          >
            <p><b>Nome:</b> {lead.name}</p>
            <p><b>Telefone:</b> {lead.phone}</p>
            <p><b>Status:</b> {lead.status}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
