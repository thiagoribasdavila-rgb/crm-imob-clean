/**
 * Execução governada de controle de campanha — pausar / ativar / verba,
 * pela plataforma, com o gate de aprovação em código:
 *
 * - dryRun (default) é livre para a liderança ver o que aconteceria.
 * - Execução REAL exige approvalId de um approval_requests APROVADO da
 *   organização (sem a tabela → 503 honesto: sem aprovação verificável não
 *   há execução real). Ativação ainda registra approvedBy no passo.
 * - Toda execução real invalida o cache de leituras Meta (dados frescos).
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  planPause, planActivation, planDailyBudget, executeControl,
  type ControlStep, type ControlObjectType,
} from "@/lib/meta/marketing/campaign-control";
import {
  executeSteps, validateExecutionPlan, type ExecutionStep,
} from "@/lib/meta/marketing/campaign-executor";
import { invalidateMetaReads } from "@/lib/meta/marketing/insights-cache";
import { findPriorExecution, recordExecution } from "@/lib/meta/marketing/idempotency";

export const dynamic = "force-dynamic";

function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}
const isDirector = (role: string) => ["director", "superintendent"].includes(role);

type Body = {
  action?: "pause" | "activate" | "set_daily_budget" | "create";
  objectType?: ControlObjectType;
  objectId?: string;
  dailyBudgetBrl?: number;
  approvalId?: string;
  /** SÓ para action "create": proposta meta_campaign aprovada com o plano de publicação. */
  proposalId?: string;
  dryRun?: boolean;
};

// POST — controla campanha/conjunto/anúncio existente. Diretor/superintendente.
export async function POST(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 10, scope: "marketing-execute" });
  if (!limited.ok) return limited.response;
  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;
  if (!isDirector(roleOf(identity.access))) {
    return apiError("FORBIDDEN", "Executar controle de campanha é decisão do diretor.", identity.meta, { status: 403 });
  }

  const token = process.env.META_ADS_ACCESS_TOKEN;
  if (!token) {
    return apiError("META_NOT_CONFIGURED", "Meta não configurada: defina META_ADS_ACCESS_TOKEN.", identity.meta, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as Body | null;
  const action = body?.action;
  const objectType = body?.objectType ?? "campaign";
  const objectId = String(body?.objectId ?? "").trim();
  const dryRun = body?.dryRun !== false; // default TRUE
  if (!action || !["pause", "activate", "set_daily_budget", "create"].includes(action)) {
    return apiError("ACTION_INVALID", "Informe action: pause | activate | set_daily_budget | create.", identity.meta, { status: 422 });
  }

  // action "create": cria a estrutura de campanha (campanha→adset→creative→ad)
  // a partir do plano de publicação de uma proposta APROVADA (meta_campaign).
  // Espelha o gate do resto: dryRun (default) simula; execução real exige
  // proposta aprovada e verificável. Tudo nasce PAUSED (garantia do executor).
  if (action === "create") {
    const proposalId = body?.proposalId?.trim() || null;
    if (!proposalId) {
      return apiError("PROPOSAL_REQUIRED", "Criar campanha exige proposalId de uma proposta aprovada na Caixa de Aprovações.", identity.meta, { status: 422 });
    }
    const admin = getSupabaseAdmin();
    const { data: approval, error } = await admin
      .from("approval_requests").select("id,status,entity_type,payload,expires_at,organization_id")
      .eq("id", proposalId).eq("organization_id", identity.access.organization.id).maybeSingle();
    if (error) {
      return apiError("APPROVAL_UNAVAILABLE", "Aprovação não verificável até a ativação do banco (approval_requests) — execução real bloqueada.", identity.meta, { status: 503 });
    }
    if (!approval || approval.entity_type !== "meta_campaign") {
      return apiError("PROPOSAL_NOT_FOUND", "Proposta de campanha não encontrada nesta organização.", identity.meta, { status: 404 });
    }
    // expiração enforçada (não decorativa): proposta vencida não executa
    if (!dryRun && approval.expires_at && new Date(approval.expires_at).getTime() < Date.now()) {
      return apiError("PROPOSAL_EXPIRED", "Esta proposta expirou — gere uma nova antes de executar.", identity.meta, { status: 409 });
    }
    const payload = approval.payload as { kind?: string; plan?: { accountId?: string; steps?: unknown } } | null;
    if (payload?.kind !== "create" || !payload.plan) {
      return apiError("PROPOSAL_NOT_CREATE", "A proposta informada não é de criação de campanha.", identity.meta, { status: 422 });
    }
    const steps = Array.isArray(payload.plan.steps) ? (payload.plan.steps as ExecutionStep[]) : [];
    if (steps.length === 0) {
      return apiError("PLAN_EMPTY", "Plano de publicação vazio — nada a executar.", identity.meta, { status: 422 });
    }
    // Execução real SÓ com proposta aprovada; dryRun pode simular a proposta pendente.
    if (!dryRun && approval.status !== "approved") {
      return apiError("APPROVAL_NOT_APPROVED", "A proposta informada não existe ou não está aprovada.", identity.meta, { status: 409 });
    }
    const problems = validateExecutionPlan(steps);
    if (problems.length) {
      return apiError("PLAN_INVALID", `Plano recusado: ${problems.join("; ")}`, identity.meta, { status: 422 });
    }
    // ONE-SHOT: a aprovação já executada não recria (idempotência) — reenviar o
    // mesmo proposalId devolve o resultado anterior em vez de criar de novo.
    const idemKey = `${identity.access.organization.id}:${proposalId}`;
    if (!dryRun) {
      const prior = await findPriorExecution(admin, idemKey);
      if (prior) {
        return apiSuccess({ executed: true, dryRun: false, results: prior, governance: `campanha desta proposta já foi criada (idempotência) — não recriamos. ${proposalId}` }, identity.meta, { headers: limited.headers });
      }
    }
    try {
      const results = await executeSteps(steps, { token, dryRun, idempotencyKey: idemKey });
      if (!dryRun && results.some((r) => r.ok)) invalidateMetaReads();
      const failed = results.find((r) => !r.ok);
      if (failed) {
        return apiError("EXECUTION_FAILED", `Meta recusou: ${failed.error ?? "erro desconhecido"}`, identity.meta, { status: 502 });
      }
      if (!dryRun) await recordExecution(admin, idemKey, identity.access.organization.id, results);
      return apiSuccess({
        executed: !dryRun,
        dryRun,
        results,
        governance: dryRun
          ? "simulação — nada foi criado na Meta"
          : `campanha criada sob aprovação ${proposalId} por ${identity.access.profile.id} (tudo PAUSED)`,
      }, identity.meta, { headers: limited.headers });
    } catch (err) {
      return apiError("PLAN_INVALID", err instanceof Error ? err.message : "Plano de criação inválido.", identity.meta, { status: 422 });
    }
  }

  if (!/^\d{5,}$/.test(objectId)) {
    return apiError("OBJECT_ID_INVALID", "Informe o objectId da Meta (numérico).", identity.meta, { status: 422 });
  }

  // gate de aprovação — execução real SÓ com proposta aprovada e verificável
  const approvalId = body?.approvalId?.trim() || null;
  if (!dryRun) {
    if (!approvalId) {
      return apiError("APPROVAL_REQUIRED", "Execução real exige approvalId de uma proposta aprovada na Caixa de Aprovações.", identity.meta, { status: 422 });
    }
    const admin = getSupabaseAdmin();
    const { data: approval, error } = await admin
      .from("approval_requests").select("id,status,entity_type,payload,expires_at,organization_id")
      .eq("id", approvalId).eq("organization_id", identity.access.organization.id).maybeSingle();
    if (error) {
      return apiError("APPROVAL_UNAVAILABLE", "Aprovação não verificável até a ativação do banco (approval_requests) — execução real bloqueada.", identity.meta, { status: 503 });
    }
    if (!approval || approval.status !== "approved") {
      return apiError("APPROVAL_NOT_APPROVED", "A proposta informada não existe ou não está aprovada.", identity.meta, { status: 409 });
    }
    // expiração enforçada: aprovação vencida não executa
    if (approval.expires_at && new Date(approval.expires_at).getTime() < Date.now()) {
      return apiError("APPROVAL_EXPIRED", "Esta aprovação expirou — gere e aprove uma nova antes de executar.", identity.meta, { status: 409 });
    }
    // VÍNCULO APROVAÇÃO ↔ AÇÃO. Sem isto, "aprovado + não expirado" era senha
    // PORTADORA: qualquer approval_request aprovado da organização — inclusive
    // de 'message', 'lead_action' ou 'commercial_simulation' — autorizava
    // pause/activate/set_daily_budget em QUALQUER id da Meta, e a string de
    // auditoria ("executado sob aprovação X") passava a afirmar algo falso.
    // Rompe a doutrina na única ponta em que ela custa dinheiro: activate e
    // set_daily_budget gastam verba. O payload produzido por
    // lib/marketing/campaign-proposals já tem exatamente a forma conferida
    // abaixo, então o vínculo é verificável sem mudar o produtor.
    const approvalPayload = approval.payload as
      | { kind?: string; plan?: { objectType?: string; objectId?: string; dailyBudgetBrl?: number | null } }
      | null;
    const plan = approvalPayload?.plan;
    const mismatch = (autorizava: string) => apiError(
      "APPROVAL_TARGET_MISMATCH",
      `A aprovação informada não autoriza esta execução: ela autorizava ${autorizava}. Gere e aprove uma proposta para exatamente esta ação e este objeto.`,
      identity.meta,
      { status: 409 },
    );
    if (approval.entity_type !== "meta_campaign") {
      return mismatch(`outra natureza de decisão (entity_type "${String(approval.entity_type ?? "desconhecido")}"), não controle de campanha da Meta`);
    }
    if (approvalPayload?.kind !== action) {
      return mismatch(`a ação "${String(approvalPayload?.kind ?? "desconhecida")}", não "${action}"`);
    }
    if (String(plan?.objectId ?? "") !== objectId || String(plan?.objectType ?? "") !== objectType) {
      return mismatch(`o ${String(plan?.objectType ?? "objeto")} ${String(plan?.objectId ?? "sem id")}, não o ${objectType} ${objectId}`);
    }
    if (action === "set_daily_budget") {
      const approvedCents = Math.round((Number(plan?.dailyBudgetBrl) || 0) * 100);
      const requestedCents = Math.round((Number(body?.dailyBudgetBrl) || 0) * 100);
      if (approvedCents !== requestedCents) {
        return mismatch(`verba diária de R$ ${(approvedCents / 100).toFixed(2)}, não R$ ${(requestedCents / 100).toFixed(2)}`);
      }
    }
  }

  let step: ControlStep;
  if (action === "pause") {
    step = planPause(objectType, objectId);
  } else if (action === "activate") {
    step = planActivation(objectType, objectId, {
      approvalId: approvalId ?? "dry-run",
      approvedBy: identity.access.profile.id,
    });
  } else {
    const cents = Math.round((Number(body?.dailyBudgetBrl) || 0) * 100);
    step = planDailyBudget(objectType === "ad" ? "campaign" : objectType, objectId, cents);
  }

  try {
    const results = await executeControl([step], {
      token,
      dryRun,
      idempotencyKey: `${identity.access.organization.id}:${approvalId ?? "dryrun"}`,
    });
    if (!dryRun && results.some((r) => r.ok)) invalidateMetaReads();
    const failed = results.find((r) => !r.ok);
    if (failed) {
      return apiError("EXECUTION_FAILED", `Meta recusou: ${failed.error ?? "erro desconhecido"}`, identity.meta, { status: 502 });
    }
    return apiSuccess({
      executed: !dryRun,
      dryRun,
      results,
      governance: dryRun
        ? "simulação — nada foi alterado na Meta"
        : `executado sob aprovação ${approvalId} por ${identity.access.profile.id}`,
    }, identity.meta, { headers: limited.headers });
  } catch (err) {
    // validação do plano recusou (ex.: verba abaixo do trilho)
    return apiError("PLAN_INVALID", err instanceof Error ? err.message : "Plano de controle inválido.", identity.meta, { status: 422 });
  }
}
