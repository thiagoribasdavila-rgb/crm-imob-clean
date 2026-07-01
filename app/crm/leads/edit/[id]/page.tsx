import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Page({ params }: any) {
  const supabase = createSupabaseServer();

  const id = params.id;

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (!lead) {
    return <div>Lead não encontrado</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>
      <p>{lead.name}</p>
      <p>{lead.email}</p>
    </div>
  );
}
