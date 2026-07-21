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
import { invalidateMetaReads } from "@/lib/meta/marketing/insights-cache";

export const dynamic = "force-dynamic";

function roleOf(access: { profile: { commercialRole?: string | null; role: string } }): string {
  return access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
}
const isDirector = (role: string) => ["director", "superintendent"].includes(role);

type Body = {
  action?: "pause" | "activate" | "set_daily_budget";
  objectType?: ControlObjectType;
  objectId?: string;
  dailyBudgetBrl?: number;
  approvalId?: string;
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
  if (!action || !["pause", "activate", "set_daily_budget"].includes(action)) {
    return apiError("ACTION_INVALID", "Informe action: pause | activate | set_daily_budget.", identity.meta, { status: 422 });
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
      .from("approval_requests").select("id,status,organization_id")
      .eq("id", approvalId).eq("organization_id", identity.access.organization.id).maybeSingle();
    if (error) {
      return apiError("APPROVAL_UNAVAILABLE", "Aprovação não verificável até a ativação do banco (approval_requests) — execução real bloqueada.", identity.meta, { status: 503 });
    }
    if (!approval || approval.status !== "approved") {
      return apiError("APPROVAL_NOT_APPROVED", "A proposta informada não existe ou não está aprovada.", identity.meta, { status: 409 });
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
