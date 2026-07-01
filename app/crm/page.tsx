import { supabase } from "@/lib/supabase";

export default async function Dashboard() {
  const { data: leads, error } = await supabase
    .from("leads")
    .select("*");

  if (error) {
    console.error("Erro Supabase:", error);
  }

  const total = leads?.length || 0;

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

      {/* LISTA DE LEADS */}
      <div style={{ marginTop: 20 }}>
        {leads && leads.length > 0 ? (
          leads.map((lead: any) => (
            <div
              key={lead.id}
              style={{
                padding: 10,
                marginBottom: 10,
                background: "white",
                borderRadius: 8,
                border: "1px solid #ddd",
              }}
            >
              <p><strong>Nome:</strong> {lead.nome || "Sem nome"}</p>
              <p><strong>Email:</strong> {lead.email || "Sem email"}</p>
              <p><strong>Status:</strong> {lead.status || "Novo"}</p>
            </div>
          ))
        ) : (
          <p>Nenhum lead encontrado</p>
        )}
      </div>
    </div>
  );
}
