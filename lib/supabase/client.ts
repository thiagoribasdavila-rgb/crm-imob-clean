import { createClient } from "@supabase/supabase-js";

console.log("ENV URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
console.log("ENV KEY:", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  throw new Error("ENV não carregada no Next.js");
}

export const supabase = createClient(url, key);
