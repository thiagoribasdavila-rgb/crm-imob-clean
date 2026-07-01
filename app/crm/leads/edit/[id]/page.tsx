import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

export default async function Page({ params }: any) {
  const id = params.id;

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

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
      <p>{lead.name}</p>
      <p>{lead.email}</p>
    </div>
  );
}
