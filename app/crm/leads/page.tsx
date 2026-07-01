import { supabaseServer } from "@/lib/supabase/server";

// 🔥 FORÇA RENDER DINÂMICO (ESSENCIAL)
export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const { data: leads, error } = await supabaseServer
    .from("leads")
    .select("*");

  if (error) {
    console.error("Erro Supabase:", error);
  }

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
    </div>
  );
}
