export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createSupabaseServer } from "@/lib/supabase/server";

export default async function CRMPage() {
  const supabase = createSupabaseServer();

  const { data: leads, error } = await supabase
    .from("leads")
    .select("*");

  if (error) {
    return (
      <div>
        <h1>Erro ao carregar CRM</h1>
      </div>
    );
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Dashboard CRM</h1>
      <h2>Total de leads: {leads?.length ?? 0}</h2>
    </div>
  );
}
