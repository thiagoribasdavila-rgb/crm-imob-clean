import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

type LeadEventInput = {
  organizationId: string;
  leadId: string;
  actorId: string;
  type: string;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
};

export async function recordLiveLeadEvent(admin: SupabaseClient, input: LeadEventInput) {
  const description = [input.title.trim(), input.description?.trim()].filter(Boolean).join(" — ").slice(0, 4000);
  const { data, error } = await admin
    .from("lead_events")
    .insert({
      organization_id: input.organizationId,
      lead_id: input.leadId,
      created_by: input.actorId,
      event_type: input.type,
      type: input.type,
      description,
      metadata: { title: input.title.trim(), ...(input.metadata ?? {}) },
    })
    .select("id,lead_id,event_type,type,description,metadata,created_by,created_at")
    .single();
  return { data, error };
}

export function mapLiveLeadEvent(row: Record<string, unknown>) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, unknown> : {};
  return {
    id: row.id,
    user_id: row.created_by ?? null,
    title: typeof metadata.title === "string" ? metadata.title : row.event_type ?? row.type ?? "Atividade",
    description: row.description ?? null,
    type: row.event_type ?? row.type ?? "note",
    metadata,
    occurred_at: row.created_at ?? null,
  };
}

export function liveLeadUpdatePayload(body: Record<string, unknown>, currentStatus: unknown) {
  const budgetMin = body.budget_min === null || body.budget_min === "" ? null : Number(body.budget_min);
  const budgetMax = body.budget_max === null || body.budget_max === "" ? null : Number(body.budget_max);
  const bedrooms = body.bedrooms === null || body.bedrooms === "" ? null : Number(body.bedrooms);
  const preferredNeighborhoods = Array.isArray(body.preferred_regions)
    ? body.preferred_regions.map((value) => String(value).trim()).filter(Boolean).slice(0, 20)
    : [];
  const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
  const notes = typeof body.notes === "string"
    ? body.notes.replace(/^Objetivo declarado:\s*(moradia|investimento|loca[cç][aã]o)\.?\s*/i, "").trim()
    : "";
  const enrichedNotes = [purpose ? `Objetivo declarado: ${purpose}.` : "", notes].filter(Boolean).join("\n").slice(0, 5000) || null;

  return {
    name: typeof body.name === "string" ? body.name.trim() : null,
    email: typeof body.email === "string" && body.email.trim() ? body.email.trim().toLowerCase() : null,
    phone: typeof body.phone === "string" && body.phone.trim() ? body.phone.replace(/\D/g, "") : null,
    source: typeof body.source === "string" && body.source.trim() ? body.source.trim() : null,
    status: typeof body.status === "string" && body.status.trim() ? body.status.trim().toLowerCase() : String(currentStatus || "novo").toLowerCase(),
    temperature: typeof body.temperature === "string" && body.temperature.trim() ? body.temperature.trim().toLowerCase() : "frio",
    score_ia: Number.isFinite(Number(body.score)) ? Math.min(100, Math.max(0, Math.round(Number(body.score)))) : 0,
    budget_min: Number.isFinite(budgetMin) ? budgetMin : null,
    budget_max: Number.isFinite(budgetMax) ? budgetMax : null,
    preferred_bedrooms: Number.isFinite(bedrooms) ? bedrooms : null,
    preferred_neighborhoods: preferredNeighborhoods,
    notes: enrichedNotes,
  };
}
