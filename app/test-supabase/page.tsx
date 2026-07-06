import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default async function TestSupabase() {
  const { data, error } = await supabase.from("test").select("*");

  return (
    <div style={{ padding: 24 }}>
      <h1>🧪 Supabase Test</h1>

      <pre>{JSON.stringify({ data, error }, null, 2)}</pre>
    </div>
  );
}
