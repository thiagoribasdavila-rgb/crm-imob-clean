import { getAtlasSupabase } from "./supabase";
import type { AtlasDataContext } from "./types";

export async function getAtlasDashboardMetrics(context: AtlasDataContext) {
  const { supabase, organizationId } = await getAtlasSupabase(context);

  const [leadsResult, hotResult] = await Promise.all([
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("temperature", "hot"),
  ]);

  if (leadsResult.error || hotResult.error) {
    throw new Error("Atlas AI dashboard metrics unavailable.");
  }

  return {
    totalLeads: leadsResult.count ?? 0,
    hotLeads: hotResult.count ?? 0,
    pendingActions: 0,
    pipelineValue: 0,
  };
}
