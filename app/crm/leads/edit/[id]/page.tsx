import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Page({ params }: any) {
  const { id } = params;

  const { data: lead, error } = await supabaseServer
    .from("leads")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error(error);
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Editar Lead</h1>

      <pre>{JSON.stringify(lead, null, 2)}</pre>
    </div>
  );
}
