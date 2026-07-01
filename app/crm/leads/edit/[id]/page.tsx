export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createSupabaseServer } from "@/lib/supabase/server";

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
    .single();

  if (error || !lead) {
    return <div>Lead não encontrado</div>;
  }

  return (
    <div>
      <h1>Editar Lead</h1>
      <p>{lead.name}</p>
      <p>{lead.email}</p>
    </div>
  );
}
