/**
 * GET /api/v1/ai/next-best-action — a PLAYLIST de próxima-melhor-ação do corretor.
 *
 * Junta a carteira do corretor (best-effort do banco), calcula a probabilidade
 * de conversão por lead (predictConversionDetailed) e devolve a lista priorizada
 * (nextBestActions) + um resumo de 1 linha (playlistSummary). O corretor vê a
 * própria carteira; a liderança (director/superintendent/manager) pode inspecionar
 * a de um corretor via ?brokerId=.
 *
 * Degrade honesto: sem a tabela de leads (schema drift), a rota responde 503 —
 * nunca inventa uma carteira. Nada aqui EXECUTA nada: é priorização sob
 * supervisão humana. SEM PII em log (nenhum dado de lead é registrado).
 */

import { type NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { predictConversionDetailed, type ConversionSignals } from "@/lib/ai/conversion-predictor";
import { nextBestActions, playlistSummary, type LeadSignal } from "@/lib/ai/next-best-action";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEADERSHIP = new Set(["director", "superintendent", "manager"]);
const DAY_MS = 86_400_000;

const asString = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const asNumber = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

function readMetadata(row: Record<string, unknown>): Record<string, unknown> {
  const m = row.metadata;
  return m && typeof m === "object" && !Array.isArray(m) ? (m as Record<string, unknown>) : {};
}

/** Dias (arredondados p/ baixo) desde uma data ISO até agora; undefined se inválida. */
function daysSince(iso: unknown, now: number): number | undefined {
  const s = asString(iso);
  if (!s) return undefined;
  const t = Date.parse(s);
  if (Number.isNaN(t)) return undefined;
  return Math.max(0, Math.floor((now - t) / DAY_MS));
}

/** Constrói os sinais do preditor a partir de uma linha de lead (defensivo). */
function toConversionSignals(row: Record<string, unknown>, now: number): ConversionSignals {
  const meta = readMetadata(row);
  const nextActionAt = asString(row.next_action_at);
  const nextActionOverdue = nextActionAt ? Date.parse(nextActionAt) < now : null;
  const lastInteraction =
    daysSince(meta.last_interaction_at, now) ??
    daysSince(meta.last_contact_at, now) ??
    daysSince(row.updated_at, now) ??
    null;
  return {
    status: asString(row.status) ?? null,
    stage: asString(meta.stage) ?? asString(row.status) ?? null,
    // score_ia é a coluna canônica do scorer de IA; score é o legado (fallback).
    // 0 é valor de IA válido (curto-circuita o ??), então só cai no legado se score_ia for null.
    score: asNumber(row.score_ia) ?? asNumber(row.score) ?? null,
    daysSinceLastInteraction: lastInteraction,
    nextActionOverdue,
  };
}

/**
 * Extrai o valor do imóvel dos campos best-effort (nunca inventa).
 * budget_max NÃO entra aqui de propósito: é teto declarado pelo cliente, não
 * preço de imóvel. Ele viaja em declaredBudget, fora do score e do potencial.
 */
function readPropertyValue(row: Record<string, unknown>): number | undefined {
  const meta = readMetadata(row);
  return (
    asNumber(meta.property_value) ??
    asNumber(meta.valor_imovel) ??
    asNumber(meta.ticket) ??
    undefined
  );
}

/** Teto de orçamento declarado pelo cliente (coluna do CRM), quando houver. */
function readDeclaredBudget(row: Record<string, unknown>): number | undefined {
  const value = asNumber(row.budget_max) ?? Number(row.budget_max);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export async function GET(request: NextRequest) {
  const limited = enforceRateLimit(request, { limit: 40, scope: "ai-next-best-action" });
  if (!limited.ok) return limited.response;

  const identity = await requireAccessContext(request);
  if (!identity.ok) return identity.response;

  const { access, meta } = identity;
  const commercialRole = access.profile.commercialRole || (access.profile.role === "admin" ? "director" : access.profile.role);
  const isLeadership = LEADERSHIP.has(commercialRole);

  // Alvo: a liderança pode pedir ?brokerId=; o corretor vê só a própria carteira.
  const askedBroker = new URL(request.url).searchParams.get("brokerId");
  let targetBrokerId = access.profile.id;
  if (isLeadership && askedBroker) {
    if (!UUID_RE.test(askedBroker)) {
      return apiError("INVALID_BROKER_ID", "O parâmetro brokerId precisa ser um UUID válido.", meta, {
        status: 400,
        headers: limited.headers,
      });
    }
    targetBrokerId = askedBroker;
  }

  const org = access.organization.id;
  const admin = getSupabaseAdmin();

  // Carteira do corretor — best-effort. Sem a tabela (schema drift) → 503 honesto.
  const { data, error } = await admin
    .from("leads")
    .select("id, name, status, score_ia, score, temperature, next_action_at, updated_at, created_at, metadata, budget_max, arquivado")
    .eq("organization_id", org)
    .eq("assigned_to", targetBrokerId)
    .limit(200);

  if (error) {
    return apiError(
      "PORTFOLIO_UNAVAILABLE",
      "Carteira de leads indisponível no momento — não foi possível montar a playlist.",
      meta,
      { status: 503, headers: limited.headers },
    );
  }

  const now = Date.now();
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const signals: LeadSignal[] = rows
    .filter((row) => row.arquivado !== true)
    .map((row) => {
      const prediction = predictConversionDetailed(toConversionSignals(row, now));
      const stage = asString(readMetadata(row).stage) ?? asString(row.status);
      const nextActionAt = asString(row.next_action_at);
      const overdue = nextActionAt && Date.parse(nextActionAt) < now ? 1 : 0;
      const lastContactDays =
        daysSince(readMetadata(row).last_interaction_at, now) ??
        daysSince(readMetadata(row).last_contact_at, now) ??
        daysSince(row.updated_at, now);
      const signal: LeadSignal = {
        leadId: String(row.id),
        probability: prediction.probability,
        // Risco primeiro: o núcleo usa só o PRIMEIRO fator como "dominante", e
        // com positivos na frente um risco real (telefone inválido, sete dias
        // sem contato) nunca chegava ao corretor.
        factors: [...prediction.riskFactors, ...prediction.positiveFactors],
        overdueTaskCount: overdue,
        band: prediction.band,
        missingSignals: prediction.missingSignals,
        signalCoverage: prediction.signalCoverage,
      };
      const name = asString(row.name);
      if (name) signal.name = name;
      if (stage) signal.stage = stage;
      const value = readPropertyValue(row);
      if (value !== undefined) signal.propertyValue = value;
      const declaredBudget = readDeclaredBudget(row);
      if (declaredBudget !== undefined) signal.declaredBudget = declaredBudget;
      if (lastContactDays !== undefined) signal.lastContactDays = lastContactDays;
      return signal;
    });

  const actions = nextBestActions(signals, { max: 20 });

  return apiSuccess(
    {
      brokerId: targetBrokerId,
      count: actions.length,
      actions,
      summary: playlistSummary(actions),
      caveat: "Priorização explicável sob supervisão humana; nada executa sem sua ação.",
    },
    meta,
    { headers: limited.headers },
  );
}
