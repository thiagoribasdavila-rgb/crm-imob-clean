import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

console.log("ENV URL =>", url);
console.log("ENV KEY =>", key);

if (!url || !key) {
  throw new Error("ENV do Supabase NÃO carregou");
}

export const supabase = createClient(url, key);
