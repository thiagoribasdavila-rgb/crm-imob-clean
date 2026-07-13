import { createClient as createSupabaseClient } from "@/utils/supabase/client";

export function createClient() {
  return createSupabaseClient();
}

export const supabase = createClient();

export default supabase;
