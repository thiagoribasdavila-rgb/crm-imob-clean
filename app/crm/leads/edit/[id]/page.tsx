import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditLeadPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServer();

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

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
