export const dynamic = "force-dynamic";

import { supabaseServer } from "@/lib/supabase/server";

export default async function EditLeadPage({
  params
}: {
  params: { id: string };
}) {
  const { data: lead, error } = await supabaseServer
    .from("leads")
    .select("*")
    .eq("id", params.id)
    .single();

  if (error) {
    console.error(error);
  }

  if (!lead) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Lead não encontrado</h1>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>

      <div style={{
        marginTop: 20,
        padding: 20,
        background: "#f5f5f5",
        borderRadius: 10
      }}>
        <p><b>ID:</b> {lead.id}</p>
        <p><b>Nome:</b> {lead.name}</p>
        <p><b>Email:</b> {lead.email}</p>
        <p><b>Status:</b> {lead.status}</p>
      </div>
    </div>
  );
}
