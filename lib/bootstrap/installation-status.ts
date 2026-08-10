import "server-only";

import { bootstrapState } from "@/lib/bootstrap/policy";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type BootstrapInstallationStatus =
  | { state: "available"; profiles: 0 }
  | { state: "complete"; profiles: number };

/**
 * The presence of any profile closes the one-time bootstrap.
 *
 * A clean installation has no profiles. The first successful bootstrap creates
 * the administrative profile atomically with the Auth user. Refusing to reopen
 * when a non-admin profile exists is intentional: it prevents a partially
 * provisioned environment from being taken over through the public setup page.
 */
export async function readBootstrapInstallationStatus(): Promise<BootstrapInstallationStatus> {
  const admin = getSupabaseAdmin();
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true });

  if (error) throw error;
  const profiles = count ?? 0;
  return bootstrapState(profiles) === "available"
    ? { state: "available", profiles: 0 }
    : { state: "complete", profiles };
}
