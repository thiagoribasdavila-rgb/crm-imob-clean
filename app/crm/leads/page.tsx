import { supabase } from "@/lib/supabase/client";

export default async function LeadsPage() {
  const { data: leads, error } = await supabase
    .from("leads")
    .select("*");

  if (error) {
    console.error(error);
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>Dashboard CRM</h1>
      <h2>Total: {leads?.length ?? 0}</h2>
    </div>
  );
}
