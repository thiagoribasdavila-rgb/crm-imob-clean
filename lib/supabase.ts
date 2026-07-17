import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "@/utils/supabase/env";

let instance: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (instance) return instance;

  const { url, key } = getSupabasePublicConfig();

  // The SSR browser client persists the session in cookies. The proxy and
  // Server Components read those same cookies, preventing post-login loops.
  instance = createBrowserClient(url, key);

  return instance;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, property) {
    const client = getSupabase();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

export default supabase;
