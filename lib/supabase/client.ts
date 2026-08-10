import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";

/**
 * Compatibility entry point for older client components.
 *
 * Keep the browser client lazy so importing a component during the production
 * build never tries to resolve runtime credentials. All callers still share
 * the cookie-aware singleton created by `lib/supabase.ts`.
 */
export function createClient(): SupabaseClient {
  return getSupabase();
}

export { supabase } from "@/lib/supabase";
