import { getAtlasSupabase } from "./supabase";
import type { AtlasDataContext, AtlasLeadInsight, LeadPriority } from "./types";

export type LeadQueryInput = {
  query?: string;
  limit?: number;
  temperature?: LeadPriority;
};

function sanitizeSearchTerm(value: string) {
  return value
    .trim()
    .slice(0, 120)
    .replace(/[(),.%]/g, " ")
    .replace(/\s+/g, " ");
}

export async function queryAtlasLeads(
  context: AtlasDataContext,
  input: LeadQueryInput = {},
): Promise<AtlasLeadInsight[]> {
  const { supabase, organizationId } = await getAtlasSupabase(context);
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? 10), 1), 50);

  let query = supabase
    .from("leads")
    .select("id,name,email,phone,temperature,score,last_interaction_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (input.temperature) {
    query = query.eq("temperature", input.temperature);
  }

  const searchTerm = input.query ? sanitizeSearchTerm(input.query) : "";
  if (searchTerm) {
    query = query.or(
      `name.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Atlas AI failed to query leads: ${error.message}`);
  }

  return (data ?? []).map((lead) => ({
    id: lead.id,
    name: lead.name,
    email: lead.email ?? undefined,
    phone: lead.phone ?? undefined,
    priority: lead.temperature ?? undefined,
    score: lead.score ?? undefined,
    lastContactAt: lead.last_interaction_at ?? null,
  }));
}
