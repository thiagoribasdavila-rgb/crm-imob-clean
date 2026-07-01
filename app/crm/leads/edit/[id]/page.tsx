import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditLeadPage({ params }: any) {
  const supabase = createSupabaseServer();

  const id = String(params.id);

  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !lead) {
    return (
      <div style={{ padding: 20 }}>
        <h1>Lead não encontrado</h1>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>

      <p>Nome: {lead.name}</p>
      <p>Email: {lead.email}</p>
    </div>
  );
}
