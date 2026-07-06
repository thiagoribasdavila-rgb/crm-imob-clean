"use client";

import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function TestDB() {
  const [result, setResult] = useState<any>(null);

  const test = async () => {
    const { data, error } = await supabase.from("leads").select("*");

    setResult({ data, error });
  };

  return (
    <div style={{ padding: 40 }}>
      <h1>🔥 CRM TESTE SUPABASE</h1>

      <button onClick={test} style={{ padding: 10 }}>
        Testar Leads
      </button>

      <pre style={{ marginTop: 20 }}>
        {JSON.stringify(result, null, 2)}
      </pre>
    </div>
  );
}
