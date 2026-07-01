export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createSupabaseServer } from "@/lib/supabase/server";

export default async function Page({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createSupabaseServer();

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!lead) {
    return <div>Lead não encontrado</div>;
  }

  return (
    <div>
      <h1>Editar</h1>
      <p>{lead.name}</p>
      <p>{lead.email}</p>
    </div>
  );
}
