export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createSupabaseServer } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = createSupabaseServer();

  const { data: leads, error } = await supabase
    .from("leads")
    .select("*");

  if (error) {
    return <div>Erro CRM</div>;
  }

  return (
    <div>
      <h1>CRM</h1>
      <p>Total: {leads?.length ?? 0}</p>
    </div>
  );
}
