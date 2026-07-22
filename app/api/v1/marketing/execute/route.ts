/**
 * Execução governada de controle de campanha — pausar / ativar / verba,
 * pela plataforma, com o gate de aprovação em código:
 *
 * - dryRun (default) é livre para a liderança ver o que aconteceria.
 * - Execução REAL exige approvalId de um approval_requests APROVADO da
 *   organização (sem a tabela → 503 honesto: sem aprovação verificável não
 *   há execução real). Ativação ainda registra approvedBy no passo.
 * - Execução REAL é AUDITADA antes de acontecer (meta_execution_audit): sem
 *   linha de auditoria não há execução — auditoria que vira no-op silencioso é
 *   pior do que não ter auditoria, porque a frase "executado sob aprovação X"
 *   passaria a afirmar um registro inexistente.
 * - Cada aprovação é ONE-SHOT: reexecutar a mesma aprovação é recusado (antes,
 *   uma aprovação valia como senha reutilizável até expirar, 72h por padrão).
 * - Toda execução real invalida o cache de leituras Meta (dados frescos).
 */

import { type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  planPause, planActivation, planDailyBudget, executeControl, readControlObject,
  MAX_DAILY_BUDGET_CENTS,
  type ControlStep, type ControlObjectType, type ControlObjectState,
} from "@/lib/meta/marketing/campaign-control";
import {
  executeSteps, validateExecutionPlan, type ExecutionStep,
} from "@/lib/meta/marketing/campaign-executor";
import { invalidateMetaReads } from "@/lib/meta/marketing/insights-cache";
import { findPriorExecution, recordExecution } from "@/lib/meta/marketing/idempotency";
import { canDecideMetaCampaign, META_CAMPAIGN_AUTHORITY_MESSAGE } from "@/lib/meta/marketing/approval-authority";

export const dynamic = "force-dynamic";

type AuditIntent = {
  organizationId: string;
  actorProfileId: string;
  approvalId: string | null;
  action: "create" | "pause" | "activate" | "set_daily_budget";
  objectType: string | null;
  objectId: string | null;
  previousValueCents: number | null;
  requestedValueCents: number | null;
  note: string | null;
};

/**
 * Chave de idempotência derivada da APROVAÇÃO. A criação por /execute e a por
 * campaign-intake usavam chaves diferentes para a mesma campanha, então a mesma
 * aprovação podia ser gasta duas vezes — uma por porta — sem que nenhuma
 * enxergasse a outra.
 */
function approvalKeyFor(organizationId: string, approvalId: string): string {
  return `${organizationId}:approval:${approvalId}`;
}

/** Verba diária (centavos) da campanha do plano, para registrar na auditoria. */
function plannedCampaignDailyBudget(steps: ExecutionStep[]): number | null {
  const campaign = steps.find((s) => s.kind === "create_campaign");
  const raw = campaign?.payload?.daily_budget;
  const cents = Number(raw);
  return Number.isFinite(cents) ? cents : null;
}

/** Abre a linha de auditoria ANTES da chamada. Falha = execução não acontece. */
async function openAudit(
  admin: SupabaseClient,
  intent: AuditIntent,
): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const { data, error } = await admin
    .from("meta_execution_audit")
    .insert({
      organization_id: intent.organizationId,
      actor_profile_id: intent.actorProfileId,
      approval_id: intent.approvalId,
      action: intent.action,
      object_type: intent.objectType,
      object_id: intent.objectId,
      previous_value_cents: intent.previousValueCents,
      requested_value_cents: intent.requestedValueCents,
      outcome: "attempted",
      note: intent.note,
    })
    .select("id")
    .single();
  if (error || !data) return { ok: false, reason: error?.message ?? "insert sem id" };
  return { ok: true, id: String(data.id) };
}

/**
 * Fecha a linha com o desfecho REAL (inclusive falha). Se este update não
 * gravar, a linha fica em "attempted" — que significa exatamente "tentado,
 * desfecho não registrado", e não some do histórico.
 */
async function closeAudit(
  admin: SupabaseClient,
  auditId: string,
  patch: { outcome: "succeeded" | "failed"; stepResults: unknown; errorMessage?: string | null },
): Promise<void> {
  await admin
    .from("meta_execution_audit")
    .update({
      outcome: patch.outcome,
      step_results: patch.stepResults ?? [],
      error_message: patch.errorMessage ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", auditId);
}

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
  // Mesmo predicado que a Caixa de Aprovações usa para DECIDIR — aprovar e
  // executar não podem divergir de alçada.
  if (!canDecideMetaCampaign({ role: identity.access.profile.role, commercialRole: identity.access.profile.commercialRole })) {
    return apiError("FORBIDDEN", META_CAMPAIGN_AUTHORITY_MESSAGE, identity.meta, { status: 403 });
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
    // A chave deriva da APROVAÇÃO (não do proposalId cru nem do confirmToken do
    // intake): assim a mesma aprovação é one-shot qualquer que seja a porta.
    const idemKey = approvalKeyFor(identity.access.organization.id, proposalId);
    let auditId: string | null = null;
    if (!dryRun) {
      const prior = await findPriorExecution(admin, idemKey);
      if (prior) {
        return apiSuccess({ executed: true, dryRun: false, results: prior, governance: `campanha desta proposta já foi criada (idempotência) — não recriamos. ${proposalId}` }, identity.meta, { headers: limited.headers });
      }
      const plannedDaily = plannedCampaignDailyBudget(steps);
      const audit = await openAudit(admin, {
        organizationId: identity.access.organization.id,
        actorProfileId: identity.access.profile.id,
        approvalId: proposalId,
        action: "create",
        objectType: "campaign",
        objectId: null, // ainda não existe — os ids criados entram no step_results
        previousValueCents: null,
        requestedValueCents: plannedDaily,
        note: plannedDaily == null ? "verba diária do plano não identificada nos steps" : null,
      });
      if (!audit.ok) {
        return apiError("AUDIT_UNAVAILABLE", `Sem registro de auditoria (meta_execution_audit) não há execução real: ${audit.reason}`, identity.meta, { status: 503 });
      }
      auditId = audit.id;
    }
    try {
      const results = await executeSteps(steps, { token, dryRun, idempotencyKey: idemKey });
      if (!dryRun && results.some((r) => r.ok)) invalidateMetaReads();
      const failed = results.find((r) => !r.ok);
      if (failed) {
        if (auditId && admin) await closeAudit(admin, auditId, { outcome: "failed", stepResults: results, errorMessage: failed.error ?? null });
        return apiError("EXECUTION_FAILED", `Meta recusou: ${failed.error ?? "erro desconhecido"}`, identity.meta, { status: 502 });
      }
      if (!dryRun) await recordExecution(admin, idemKey, identity.access.organization.id, results);
      if (auditId && admin) await closeAudit(admin, auditId, { outcome: "succeeded", stepResults: results });
      return apiSuccess({
        executed: !dryRun,
        dryRun,
        results,
        governance: dryRun
          ? "simulação — nada foi criado na Meta"
          : `campanha criada sob aprovação ${proposalId} por ${identity.access.profile.id} (tudo PAUSED)`,
      }, identity.meta, { headers: limited.headers });
    } catch (err) {
      if (auditId) await closeAudit(admin, auditId, { outcome: "failed", stepResults: [], errorMessage: err instanceof Error ? err.message : "plano inválido" });
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
    const { data: approval, error } = await getSupabaseAdmin()
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

  const requestedCents = action === "set_daily_budget" ? Math.round((Number(body?.dailyBudgetBrl) || 0) * 100) : null;

  let step: ControlStep;
  if (action === "pause") {
    step = planPause(objectType, objectId);
  } else if (action === "activate") {
    step = planActivation(objectType, objectId, {
      approvalId: approvalId ?? "dry-run",
      approvedBy: identity.access.profile.id,
    });
  } else {
    step = planDailyBudget(objectType === "ad" ? "campaign" : objectType, objectId, requestedCents ?? 0);
  }

  // ESTADO ANTES (leitura pura, nenhum efeito na conta): serve ao "valor antes"
  // da auditoria e ao trilho de salto de verba. Só na execução real — dryRun
  // continua sem tocar a rede.
  let observed: ControlObjectState | null = null;
  if (!dryRun) {
    observed = await readControlObject(objectId, { token });
    // ATIVAR às cegas é o cenário caro: campanha criada com verba errada nasce
    // PAUSED e a ativação a coloca para gastar. Sem conseguir ler a verba
    // vigente, falha FECHADA; com verba acima do teto, recusa.
    if (action === "activate") {
      if (!observed.readOk) {
        return apiError("OBJECT_UNREADABLE", `Não consegui ler a verba vigente deste ${objectType} antes de ativar (${observed.error ?? "leitura falhou"}) — ativação bloqueada; não ativamos às cegas.`, identity.meta, { status: 503 });
      }
      const currentCents = Number(observed.dailyBudgetCents);
      if (Number.isFinite(currentCents) && currentCents > MAX_DAILY_BUDGET_CENTS) {
        return apiError(
          "BUDGET_ABOVE_CAP",
          `Este ${objectType} está com verba diária de R$ ${(currentCents / 100).toFixed(2)}, acima do teto de R$ ${(MAX_DAILY_BUDGET_CENTS / 100).toFixed(2)}/dia — ajuste a verba por proposta antes de ativar.`,
          identity.meta,
          { status: 409 },
        );
      }
    }
  }

  // Cliente admin só na execução real — dryRun continua sem depender do banco.
  let admin: SupabaseClient | null = null;
  const idemKey = approvalId ? approvalKeyFor(identity.access.organization.id, approvalId) : `${identity.access.organization.id}:dryrun`;
  let auditId: string | null = null;
  if (!dryRun) {
    admin = getSupabaseAdmin();
    // ONE-SHOT também no controle: sem isto a mesma aprovação reexecutava até
    // expirar (72h) — alguém pausava na mão e a aprovação antiga reativava.
    const prior = await findPriorExecution(admin, idemKey);
    if (prior) {
      return apiError("APPROVAL_ALREADY_EXECUTED", "Esta aprovação já foi executada — gere e aprove uma nova para agir de novo.", identity.meta, { status: 409 });
    }
    const audit = await openAudit(admin, {
      organizationId: identity.access.organization.id,
      actorProfileId: identity.access.profile.id,
      approvalId,
      action,
      objectType,
      objectId,
      previousValueCents: observed?.readOk ? (observed.dailyBudgetCents ?? null) : null,
      requestedValueCents: requestedCents,
      note: observed?.readOk ? null : `estado anterior não lido: ${observed?.error ?? "leitura falhou"}`,
    });
    if (!audit.ok) {
      return apiError("AUDIT_UNAVAILABLE", `Sem registro de auditoria (meta_execution_audit) não há execução real: ${audit.reason}`, identity.meta, { status: 503 });
    }
    auditId = audit.id;
  }

  try {
    const results = await executeControl([step], {
      token,
      dryRun,
      idempotencyKey: idemKey,
      verify: !dryRun,
      limits: { currentDailyBudgetCents: observed?.readOk ? observed.dailyBudgetCents ?? null : null },
    });
    if (!dryRun && results.some((r) => r.ok)) invalidateMetaReads();
    const failed = results.find((r) => !r.ok);
    if (failed) {
      if (auditId && admin) await closeAudit(admin, auditId, { outcome: "failed", stepResults: results, errorMessage: failed.error ?? null });
      return apiError("EXECUTION_FAILED", `Meta recusou: ${failed.error ?? "erro desconhecido"}`, identity.meta, { status: 502 });
    }
    if (!dryRun) {
      await recordExecution(admin, idemKey, identity.access.organization.id, results);
      if (auditId && admin) await closeAudit(admin, auditId, { outcome: "succeeded", stepResults: results });
    }
    const confirmed = results.every((r) => r.verified === true);
    return apiSuccess({
      executed: !dryRun,
      dryRun,
      results,
      verified: dryRun ? null : confirmed,
      governance: dryRun
        ? "simulação — nada foi alterado na Meta"
        : `executado sob aprovação ${approvalId} por ${identity.access.profile.id}` +
          (confirmed
            ? " (estado reconferido na Meta)"
            : " — a Meta aceitou o pedido, mas NÃO foi possível reconferir o estado do objeto"),
    }, identity.meta, { headers: limited.headers });
  } catch (err) {
    // validação do plano recusou (ex.: verba fora do trilho)
    if (auditId && admin) await closeAudit(admin, auditId, { outcome: "failed", stepResults: [], errorMessage: err instanceof Error ? err.message : "plano inválido" });
    return apiError("PLAN_INVALID", err instanceof Error ? err.message : "Plano de controle inválido.", identity.meta, { status: 422 });
  }
}
