export const dynamic = "force-dynamic";

import { createSupabaseServer } from "@/lib/supabase/server";

export default async function CRMPage() {
  const supabase = createSupabaseServer();

  const { data: leads } = await supabase
    .from("leads")
    .select("*");

  return (
    <div>
      <h1>CRM</h1>
      <p>Total: {leads?.length ?? 0}</p>
    </div>
  );
}
