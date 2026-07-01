import { createSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function EditLeadPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServer();

  const { data: lead, error } = await supabase
    .from("leads")
    .select("*")
    .eq("id", params.id)
    .maybeSingle(); // 🔥 IMPORTANTE

  if (!lead || error) {
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
