/**
 * Propostas de campanha Meta — a ponta de ENTRADA da cadeia governada
 * proposta → aprovação → execução. A liderança registra uma proposta pendente
 * em approval_requests (entity_type "meta_campaign"); a decisão vive na Caixa
 * de Aprovações e a execução real na rota /api/v1/marketing/execute — nada aqui
 * cria/pausa nada na Meta.
 *
 * - POST cria a proposta pendente (nunca aprovada; validada por kind antes do
 *   insert). Sem a tabela → 503 honesto (proposta não registrável).
 * - GET lista as propostas meta_campaign da organização com status.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  buildCampaignProposal,
  validateProposal,
  CAMPAIGN_PROPOSAL_ENTITY_TYPE,
  type CampaignProposalInput,
  type CampaignProposalKind,
} from "@/lib/marketing/campaign-proposals";

export const dynamic = "force-dynamic";

function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}
const isLeadership = (role: string) => ["director", "superintendent", "manager"].includes(role);

const KINDS: CampaignProposalKind[] = ["create", "pause", "activate", "set_daily_budget"];

type Body = {
  kind?: CampaignProposalKind;
  title?: string;
  payload?: CampaignProposalInput["payload"];
  projection?: CampaignProposalInput["projection"];
  expiresInHours?: number;
};

// POST — registra proposta de campanha pendente. Liderança comercial.
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 20, scope: "marketing-proposals" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isLeadership(roleOf(identity.access))) {
    return apiError("FORBIDDEN", "Propor campanha é decisão da liderança comercial.", identity.meta, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const kind = body?.kind;
  if (!kind || !KINDS.includes(kind)) {
    return apiError("KIND_INVALID", "Informe kind: create | pause | activate | set_daily_budget.", identity.meta, { status: 422 });
  }
  if (!body?.payload) {
    return apiError("PAYLOAD_REQUIRED", "Informe o payload (plano de publicação ou passo de controle).", identity.meta, { status: 422 });
  }

  const input: CampaignProposalInput = {
    organizationId: identity.access.organization.id,
    requestedBy: identity.access.profile.id,
    kind,
    title: String(body.title ?? "").trim(),
    payload: body.payload,
    projection: body.projection ?? null,
    expiresInHours: body.expiresInHours,
  };

  const problems = validateProposal(input);
  if (problems.length) {
    return apiError("PROPOSAL_INVALID", `Proposta recusada: ${problems.join("; ")}`, identity.meta, { status: 422 });
  }

  const row = buildCampaignProposal(input);
  const admin = getSupabaseAdmin();
  const { data: created, error } = await admin
    .from("approval_requests")
    .insert(row)
    .select("id,status,expires_at")
    .single();
  if (error || !created) {
    return apiError(
      "PROPOSAL_UNAVAILABLE",
      "Proposta não registrável até a ativação do banco (approval_requests).",
      identity.meta,
      { status: 503 },
    );
  }

  return apiSuccess(
    { id: created.id, status: created.status, kind, expiresAt: created.expires_at },
    identity.meta,
    { headers: limited.headers },
  );
}

// GET — lista as propostas de campanha da organização com status. Liderança.
export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 60, scope: "marketing-proposals-list" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isLeadership(roleOf(identity.access))) {
    return apiError("FORBIDDEN", "Propostas de campanha pertencem à liderança comercial.", identity.meta, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("approval_requests")
    .select("id,request_type,entity_type,status,decision_reason,expires_at,decided_at,created_at,payload")
    .eq("organization_id", identity.access.organization.id)
    .eq("entity_type", CAMPAIGN_PROPOSAL_ENTITY_TYPE)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    return apiError(
      "PROPOSALS_UNAVAILABLE",
      "Propostas não consultáveis até a ativação do banco (approval_requests).",
      identity.meta,
      { status: 503 },
    );
  }

  const items = (data ?? []).map((row) => {
    const payload = (row.payload ?? {}) as { kind?: string; title?: string; governance?: { note?: string } };
    return {
      id: row.id,
      status: row.status,
      kind: payload.kind ?? "—",
      title: payload.title ?? "Campanha",
      note: payload.governance?.note ?? "",
      decisionReason: row.decision_reason,
      expiresAt: row.expires_at,
      decidedAt: row.decided_at,
      createdAt: row.created_at,
    };
  });

  return apiSuccess({ items }, identity.meta, { headers: limited.headers });
}
