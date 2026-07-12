import { getAtlasSupabase } from "./supabase";
import type { AtlasDataContext, AtlasLeadInsight } from "./types";

export type LeadQueryInput = {
  query?: string;
  limit?: number;
  temperature?: string;
};

export async function queryAtlasLeads(
  context: AtlasDataContext,
  input: LeadQueryInput = {},
): Promise<AtlasLeadInsight[]> {
  const { supabase, organizationId } = await getAtlasSupabase(context);

  const limit = Math.min(Math.max(input.limit ?? 10, 1), 50);

  let query = supabase
    .from("leads")
    .select("id,name,email,phone,temperature,score,last_contact_at")
    .eq("organization_id", organizationId)
    .limit(limit);

  if (input.temperature) {
    query = query.eq("temperature", input.temperature);
  }

  if (input.query) {
    query = query.or(
      `name.ilike.%${input.query}%,email.ilike.%${input.query}%,phone.ilike.%${input.query}%`,
    );
  }

  const { data, error } = await query;

  if (error) {
    throw new Error("Atlas AI failed to query leads.");
  }

  return (data ?? []).map((lead) => ({
    id: lead.id,
    name: lead.name,
    email: lead.email ?? undefined,
    phone: lead.phone ?? undefined,
    priority: lead.temperature,
    score: lead.score ?? undefined,
    lastContactAt: lead.last_contact_at ?? null,
  }));
}
