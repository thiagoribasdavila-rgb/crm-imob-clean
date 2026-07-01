export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createSupabaseServer } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = createSupabaseServer();

  const { data: leads } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div>
      <h1>Leads</h1>

      {leads?.map((l) => (
        <div key={l.id}>
          {l.name} - {l.email}
        </div>
      ))}
    </div>
  );
}
