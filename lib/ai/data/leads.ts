import type { AtlasDataContext } from "./types";
import { assertAtlasDataContext } from "./permissions";
import type { AtlasLeadInsight } from "./types";

export type LeadSearchInput = {
  query?: string;
  limit?: number;
};

export async function searchAtlasLeads(
  context: AtlasDataContext,
  input: LeadSearchInput = {},
): Promise<AtlasLeadInsight[]> {
  assertAtlasDataContext(context);

  // Data access boundary created for CRM integration.
  // The Supabase query will be connected here with organization isolation.
  void input;

  return [];
}

export async function getAttentionLeads(
  context: AtlasDataContext,
): Promise<AtlasLeadInsight[]> {
  assertAtlasDataContext(context);

  return [];
}
