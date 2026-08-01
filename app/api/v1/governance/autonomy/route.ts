/**
 * Saúde da governança + autonomia graduada (visão da diretoria).
 *
 * Mede se a supervisão está no ponto (carimbando? gargalando? saudável?) a
 * partir do histórico de decisões, e mostra a classificação de risco das
 * propostas pendentes com o veredicto de autonomia — SEM executar nada. A
 * auto-aprovação real fica atrás da trava autonomyEnabled (default desligada),
 * então este endpoint hoje ADVERTE, não age: a IA propõe, o humano decide.
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { classifyRisk, autonomyDecision, governanceHealth, type DecisionRecord, type RiskInput } from "@/lib/governance/policy";

export const dynamic = "force-dynamic";

function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}

// Deriva o perfil de risco de uma proposta a partir do seu tipo/entidade.
function riskInputFor(entityType: string, payload: unknown): RiskInput {
  const p = (payload ?? {}) as { kind?: string; plan?: { steps?: unknown[] }; amountBrl?: number; dailyBudgetBrl?: number };
  if (entityType === "meta_campaign") {
    const kind = p.kind ?? "create";
    if (kind === "create") return { kind: "criar_campanha", reversible: false, scope: "campanha", activates: false };
    if (kind === "activate") return { kind: "ativar_campanha", reversible: true, scope: "campanha", activates: true };
    if (kind === "set_daily_budget") return { kind: "verba", reversible: true, scope: "campanha", amountBrl: (p.dailyBudgetBrl ?? 0) * 7 };
    return { kind: "pausar", reversible: true, scope: "campanha" };
  }
  if (entityType === "message") return { kind: "enviar_mensagem", reversible: false, scope: "individual", externalSend: true };
  if (entityType === "lead_action") return { kind: "acao_lead", reversible: true, scope: "individual" };
  if (entityType === "reactivation_batch") return { kind: "reativacao", reversible: true, scope: "conta", externalSend: true };
  return { kind: entityType, reversible: true, scope: "campanha" };
}

// GET — painel de governança: saúde + risco das pendentes. Diretor/superintendente.
export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 30, scope: "governance-autonomy" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!["director", "superintendent"].includes(roleOf(identity.access))) {
    return apiError("FORBIDDEN", "Painel de governança é do diretor/superintendente.", identity.meta, { status: 403 });
  }
  const org = identity.access.organization.id;
  const admin = getSupabaseAdmin();

  // histórico de decisões (best-effort — sem a tabela, 503 honesto)
  const { data: rows, error } = await admin
    .from("approval_requests")
    .select("entity_type,status,payload,created_at,decided_at")
    .eq("organization_id", org)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) {
    return apiError("GOVERNANCE_UNAVAILABLE", "Painel indisponível até a ativação do banco (approval_requests).", identity.meta, { status: 503 });
  }

  const records: DecisionRecord[] = (rows ?? []).map((r) => {
    const status = String(r.status);
    const decision = status === "approved" ? "approved" : status === "rejected" ? "rejected" : status === "expired" ? "expired" : "pending";
    return {
      createdAtMs: new Date(r.created_at).getTime(),
      decidedAtMs: r.decided_at ? new Date(r.decided_at).getTime() : null,
      decision: decision as DecisionRecord["decision"],
    };
  });
  const health = governanceHealth(records);

  // classificação de risco das PENDENTES (advertência, não ação)
  const pending = (rows ?? []).filter((r) => String(r.status) === "pending").slice(0, 50);
  const pendingRisk = pending.map((r) => {
    const risk = classifyRisk(riskInputFor(String(r.entity_type), r.payload));
    // autonomia SEMPRE desligada aqui: mostramos o que SERIA elegível, sem agir
    const advice = autonomyDecision(risk, null, { autonomyEnabled: false });
    return { entityType: r.entity_type, risk, autonomyAdvice: advice.reason };
  });

  return apiSuccess({
    health,
    pendingRisk,
    autonomyEnabled: false, // trava mestra — auto-aprovação real exige ligar explicitamente + histórico
    governance: "advertência: classificamos o risco e medimos a supervisão; nada é auto-aprovado — a IA propõe, o humano decide.",
  }, identity.meta, { headers: limited.headers });
}
