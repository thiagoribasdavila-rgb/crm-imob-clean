"use client";

import { supabase } from "@/lib/supabase/client";

export default function TestPage() {
  console.log("SUPABASE OK:", supabase);

  return (
    <div>
      <h1>Teste Supabase</h1>
    </div>
  );
}
