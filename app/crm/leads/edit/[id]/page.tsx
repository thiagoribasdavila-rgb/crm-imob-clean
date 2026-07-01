import { supabaseServer } from "@/lib/supabase/server";

interface Props {
  params: {
    id: string;
  };
}

export default async function EditLeadPage({ params }: Props) {
  const id = params?.id;

  if (!id) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Lead não encontrado</h1>
      </div>
    );
  }

  const { data: lead, error } = await supabaseServer
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !lead) {
    console.error("Erro Supabase:", error);

    return (
      <div style={{ padding: 20 }}>
        <h1>Lead não encontrado</h1>
        <p>Verifique se o ID existe no banco.</p>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>

      <div
        style={{
          marginTop: 20,
          padding: 20,
          background: "#f5f5f5",
          borderRadius: 10,
        }}
      >
        <p><strong>Nome:</strong> {lead.name}</p>
        <p><strong>Email:</strong> {lead.email}</p>
        <p><strong>Status:</strong> {lead.status}</p>
      </div>
    </div>
  );
}
