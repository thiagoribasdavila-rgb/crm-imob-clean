import type { NextRequest } from "next/server";
import { apiError, apiSuccess } from "@/lib/api/core";
import { enforceRateLimit, requireAccessContext } from "@/lib/api/security";
import { DISCARD_TAXONOMY_VERSION, getDiscardReason } from "@/lib/atlas/discard-reasons";
import { logger } from "@/lib/observability/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/analytics/discard-report?days=30
//
// Relatório de qualidade de descartes (lead_events event_type=lead_discarded)
// pronto para o loop Andromeda / Meta CRM lead status feedback.
//
// Query params:
//   days — janela em dias (default 30, mín 1, máx 365).
//
// Shape da resposta (payload do apiSuccess):
// {
//   period: { start, end, days },
//   totals: {
//     lostMoves,     // movimentações para "perdido" em pipeline_history na janela (null se indisponível)
//     discarded,     // eventos lead_discarded na janela
//     uniqueLeads,   // leads distintos com evento de descarte
//     classified,    // eventos cujo reasonKey pertence à taxonomia vigente
//     coveragePct    // classified / lostMoves * 100 (null se lostMoves ausente ou 0)
//   },
//   byReason:       [{ key, label, metaCategory, count, share }],   // share em % do total de descartes
//   byMetaCategory: [{ category, count, share }],
//   bySource:       [{ source, count, uniqueLeads, share,
//                      leadsFromSource, discardRatePct, sampleSufficient, baseUnavailableReason }],
//   byCampaign:     [{ campaignId, campaign, count, uniqueLeads, share,
//                      leadsFromCampaign, discardRatePct, sampleSufficient, baseUnavailableReason }],
//
// Denominador: "58 descartes" não decide nada sem "de quantos". leadsFromSource
// é a contagem de leads da MESMA janela com aquela origem (COUNT no servidor,
// sem trafegar linha), e discardRatePct é leads distintos descartados ÷ essa
// base. Quando a base não é apurável (origem não informada, campanha ausente),
// o campo sai null e baseUnavailableReason diz por quê — a tela nunca inventa
// uma taxa e nunca pede desculpa sem motivo apurado.
//   andromeda: {
//     policy: "negative_signals_internal_only",  // motivos ficam internos (andromeda-loop)
//     directorDecisionRequired: true,            // envio à Meta exige gate do diretor
//     readyForCrmLeadStatusSync,                 // coveragePct >= 80
//     taxonomyVersion
//   },
//   generatedAt
// }

type DiscardEventRow = {
  id: string;
  lead_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
};

const DAY = 86_400_000;

function clampDays(value: string | null) {
  // Number(null) e Number("") valem 0 — sem esta guarda, a chamada padrão
  // (sem ?days=) viraria janela de 1 dia em vez do default de 30.
  if (value === null || value.trim() === "") return 30;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 30;
  return Math.min(365, Math.max(1, Math.round(parsed)));
}

function sharePct(count: number, total: number) {
  return total > 0 ? Math.round((count / total) * 1000) / 10 : 0;
}

/**
 * Amostra mínima para a taxa autorizar decisão de corte, alinhada ao
 * minimumLeadsForDecision do painel executivo. Abaixo disto a taxa é exibida,
 * mas marcada — 3 descartes em 4 leads dá 75% e não decide nada.
 */
const MINIMUM_BASE_FOR_DECISION = 30;

/**
 * Teto de denominadores apurados por chamada. Cada um é um COUNT no servidor
 * (head: true, zero linha trafegada), mas contagem é custo: as caudas longas
 * ficam sem base declarada em vez de multiplicar consultas.
 */
const MAX_BASE_LOOKUPS = 12;

export async function GET(request: NextRequest) {
  const rate = enforceRateLimit(request, {
    limit: 60,
    scope: "analytics-discard-report",
  });
  if (!rate.ok) return rate.response;

  // "Gerente para cima": a opção roles compara com o commercialRole efetivo
  // (director | superintendent | manager | broker). Perfis admin resolvem para
  // "director" em resolveLegacyCommercialRole, então admin também passa —
  // mesmo padrão de broker-daily/team-sla.
  const identity = await requireAccessContext(request, {
    roles: ["director", "superintendent", "manager"],
  });
  if (!identity.ok) return identity.response;

  const organizationId = identity.access.organization.id;
  const days = clampDays(request.nextUrl.searchParams.get("days"));
  const end = new Date();
  const start = new Date(end.getTime() - days * DAY);
  const since = start.toISOString();

  /**
   * ── A FONTE MUDOU, E É POR ISSO QUE ESTA TELA MOSTRAVA ZERO ───────────────
   *
   * Esta rota lia `lead_events` com `event_type='lead_discarded'` e
   * `pipeline_history`. Medido em 2026-07-30, na organização real:
   *
   *   lead_events com 'lead_discarded' ....... 0   (a tabela tem 66 linhas, 6 tipos)
   *   pipeline_history ....................... 0   no banco INTEIRO
   *   pipeline_stage_moves, saídas do funil .. 104
   *
   * Nenhuma das duas fontes antigas recebe uma linha por movimentação. A RPC
   * `move_pipeline_lead` grava em `pipeline_stage_moves`, `activities` e
   * `atlas_events` — e o código que gravava `lead_discarded` vive depois de um
   * `return` que sempre acontece. A tela renderizava tudo zerado sobre uma
   * operação que perdeu 110 de 482 leads, e concluía-se que o time não
   * classificava.
   *
   * A fonte canônica é `pipeline_stage_moves`, pelo critério de ser a única
   * escrita na MESMA TRANSAÇÃO que `leads.status`. As outras duas eram escritas
   * de aplicação, best-effort, fora da transação — por construção não podem ser
   * a verdade.
   *
   * `comprou_outro` entra junto de `perdido`: as duas são saída do funil, e
   * separá-las aqui faria a soma desta tela divergir da sala de comando.
   */
  const ESTAGIOS_DE_SAIDA = ["perdido", "comprou_outro"];
  const [eventResult, primeiroMovimento] = await Promise.all([
    identity.supabase
      .from("pipeline_stage_moves")
      .select("id,lead_id,from_stage,to_stage,reason,discard_reason_key,discard_notes,reversal_of,occurred_at")
      .eq("organization_id", organizationId)
      .in("to_stage", ESTAGIOS_DE_SAIDA)
      // `occurred_at`, NÃO `created_at`: esta tabela não tem `created_at`, e um
      // filtro por coluna inexistente faz o PostgREST errar, a rota degradar e o
      // defeito virar invisível em vez de corrigido.
      .gte("occurred_at", since)
      .order("occurred_at", { ascending: false, nullsFirst: false })
      .limit(2000),
    // Desde quando existe registro. Sem isto, "0 saídas" numa janela de 90 dias
    // leria como "ninguém desistiu" quando o ledger só existe desde 27/07.
    identity.supabase
      .from("pipeline_stage_moves")
      .select("occurred_at")
      .eq("organization_id", organizationId)
      .order("occurred_at", { ascending: true })
      .limit(1)
      .maybeSingle(),
  ]);

  if (eventResult.error) {
    logger.warn("analytics.discard_report.read_failed", {
      organizationId,
      code: eventResult.error.code,
      message: eventResult.error.message,
    });
    return apiError(
      "DISCARD_REPORT_LOAD_FAILED",
      "O relatório de descartes está temporariamente indisponível.",
      identity.meta,
      { status: 503 },
    );
  }
  const movimentos = (eventResult.data ?? []) as Array<{
    id: string;
    lead_id: string | null;
    from_stage: string | null;
    to_stage: string | null;
    reason: string | null;
    discard_reason_key: string | null;
    discard_notes: string | null;
    reversal_of: string | null;
    occurred_at: string | null;
  }>;

  // Saída revertida NÃO é saída. Guardamos as duas linhas no ledger — nada é
  // apagado — mas a contagem publicada é líquida: um movimento conta se o id
  // dele não aparece como `reversal_of` de nenhum outro. Medido hoje: 0
  // reversões, e o zero é IMPRESSO em vez de omitido.
  const revertidos = new Set(movimentos.map((m) => m.reversal_of).filter((v): v is string => Boolean(v)));
  const rows = movimentos
    .filter((m) => !revertidos.has(m.id))
    .map((m) => ({
      id: m.id,
      lead_id: m.lead_id,
      created_at: m.occurred_at,
      // A chave vem de coluna TIPADA agora, não de metadata solto. `reason`
      // continua sendo a descrição de follow-up, e não é motivo de descarte.
      metadata: { reasonKey: m.discard_reason_key ?? "", notes: m.discard_notes ?? null },
      from_stage: m.from_stage,
      to_stage: m.to_stage,
    })) as DiscardEventRow[];
  const revertidasNaJanela = movimentos.length - rows.length;
  const registroDeMovimentoDesde = primeiroMovimento.data?.occurred_at ?? null;
  const leadIds = [...new Set(rows.map((row) => row.lead_id).filter((value): value is string => Boolean(value)))];
  const leadResult = leadIds.length
    ? await identity.supabase
        .from("leads")
        .select("id,source,campaign,campaign_id")
        .eq("organization_id", organizationId)
        .in("id", leadIds)
    : { data: [] as Record<string, unknown>[], error: null };
  if (leadResult.error) {
    logger.warn("analytics.discard_report.lead_enrichment_degraded", {
      organizationId,
      code: leadResult.error.code,
    });
  }
  const leads = new Map(
    ((leadResult.data ?? []) as Record<string, unknown>[]).map((lead) => [String(lead.id), lead]),
  );

  const byReason = new Map<string, { key: string; label: string; metaCategory: string; count: number }>();
  const byMetaCategory = new Map<string, number>();
  // Leads DISTINTOS por bucket entram junto da contagem de eventos: o mesmo
  // lead descartado duas vezes é um lead perdido, não dois — e é o lead que a
  // taxa compara com a base.
  const bySource = new Map<string, { count: number; leads: Set<string> }>();
  const byCampaign = new Map<string, { campaignId: string | null; campaign: string | null; count: number; leads: Set<string> }>();
  let classified = 0;

  for (const row of rows) {
    const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const reasonKey = String(metadata.reasonKey ?? "").trim().toLowerCase();
    const reason = getDiscardReason(reasonKey);
    if (reason) classified += 1;
    const key = reasonKey || "motivo_ausente";
    /**
     * `motivo_ausente` e `motivo_nao_classificado` são baldes DIFERENTES e
     * precisam de rótulos diferentes. O primeiro é o sistema que não gravou; o
     * segundo é o corretor que escolheu "Outro motivo". Fundi-los apagaria
     * exatamente a distinção que este relatório existe para mostrar — e hoje o
     * primeiro balde tem 104 linhas justamente porque a rota do pipeline
     * descartava a escolha do corretor antes de gravar.
     */
    const label = reason?.label
      ?? (key === "motivo_ausente"
        ? "Não medido — o motivo não foi gravado"
        : typeof metadata.reasonLabel === "string" && metadata.reasonLabel ? metadata.reasonLabel : key);
    const metaCategory = reason?.metaCategory
      ?? (typeof metadata.metaCategory === "string" && metadata.metaCategory ? metadata.metaCategory : "other");
    const reasonBucket = byReason.get(key) ?? { key, label, metaCategory, count: 0 };
    reasonBucket.count += 1;
    byReason.set(key, reasonBucket);
    byMetaCategory.set(metaCategory, (byMetaCategory.get(metaCategory) ?? 0) + 1);

    const lead = row.lead_id ? leads.get(row.lead_id) : null;
    const source = typeof lead?.source === "string" && lead.source.trim() ? lead.source.trim() : "desconhecido";
    const sourceBucket = bySource.get(source) ?? { count: 0, leads: new Set<string>() };
    sourceBucket.count += 1;
    if (row.lead_id) sourceBucket.leads.add(row.lead_id);
    bySource.set(source, sourceBucket);
    const campaignId = lead?.campaign_id !== null && lead?.campaign_id !== undefined && lead?.campaign_id !== ""
      ? String(lead.campaign_id)
      : null;
    const campaignKey = campaignId ?? "sem_campanha";
    const campaignBucket = byCampaign.get(campaignKey) ?? {
      campaignId,
      campaign: typeof lead?.campaign === "string" && lead.campaign.trim() ? lead.campaign.trim() : null,
      count: 0,
      leads: new Set<string>(),
    };
    campaignBucket.count += 1;
    if (row.lead_id) campaignBucket.leads.add(row.lead_id);
    byCampaign.set(campaignKey, campaignBucket);
  }

  // --- Denominador da taxa de descarte -------------------------------------
  // Um COUNT por bucket, com head: true — o servidor conta e não devolve linha.
  // Sem isto a tela mostrava "58 descartes" sem dizer de quantos, que é o
  // número que decide se a origem é cortada.
  const sourceEntries = [...bySource.entries()].sort((left, right) => right[1].count - left[1].count);
  const campaignEntries = [...byCampaign.values()].sort((left, right) => right.count - left.count);
  const countLeadsBy = async (column: "source" | "campaign_id", value: string) => {
    const result = await identity.supabase
      .from("leads")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .gte("created_at", since)
      .eq(column, value);
    if (result.error) {
      logger.warn("analytics.discard_report.base_unavailable", { organizationId, column, code: result.error.code });
      return null;
    }
    return result.count ?? 0;
  };
  const sourceBase = new Map<string, number | null>();
  await Promise.all(
    sourceEntries.slice(0, MAX_BASE_LOOKUPS).map(async ([source]) => {
      // "desconhecido" é rótulo nosso para origem ausente, não um valor do
      // banco: contar leads com origem nula devolveria uma base que não
      // corresponde a origem nenhuma.
      if (source === "desconhecido") return;
      sourceBase.set(source, await countLeadsBy("source", source));
    }),
  );
  const campaignBase = new Map<string, number | null>();
  await Promise.all(
    campaignEntries.slice(0, MAX_BASE_LOOKUPS).map(async (bucket) => {
      if (!bucket.campaignId) return;
      campaignBase.set(bucket.campaignId, await countLeadsBy("campaign_id", bucket.campaignId));
    }),
  );
  /** Base ausente sempre vem com motivo apurado — a tela não inventa o dela. */
  const baseFields = (unique: number, base: number | null | undefined, missingReason: string) => {
    if (base === null || base === undefined) return { discardRatePct: null, sampleSufficient: null, baseUnavailableReason: missingReason };
    return {
      discardRatePct: base > 0 ? Math.round((unique / base) * 1000) / 10 : null,
      sampleSufficient: base >= MINIMUM_BASE_FOR_DECISION,
      baseUnavailableReason: base > 0 ? null : "nenhum lead desta chave foi criado na janela",
    };
  };

  const discarded = rows.length;
  // `lostMoves` era um COUNT numa segunda tabela (`pipeline_history`, 0 linhas no
  // banco inteiro) enquanto `classified` vinha de outra. Numerador e denominador
  // de fontes diferentes é como se fabrica um percentual que não significa nada:
  // com 0 no denominador a cobertura ficava `null` e a tela sumia com a métrica.
  // Agora os dois saem do MESMO conjunto de linhas.
  const lostMoves = discarded;
  const coveragePct = discarded > 0 ? Math.round((classified / discarded) * 1000) / 10 : null;

  // Leads que estão em estado de saída SEM movimento registrado. São anteriores
  // ao ledger (que começa em 27/07) — a tela precisa declará-las em vez de
  // somá-las ao balde "sem motivo", que seria acusar o time por uma cegueira do
  // sistema.
  const leadsEmSaida = await identity.supabase
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .in("status", ESTAGIOS_DE_SAIDA);
  const semMovimentoRegistrado = leadsEmSaida.error
    ? null
    : Math.max(0, (leadsEmSaida.count ?? 0) - new Set(rows.map((r) => r.lead_id).filter(Boolean)).size);

  return apiSuccess(
    {
      scope: {
        organizationId,
        actorId: identity.access.profile.id,
        readOnly: true,
        minimumRole: "manager",
      },
      period: {
        start: since,
        end: end.toISOString(),
        days,
      },
      totals: {
        lostMoves,
        discarded,
        uniqueLeads: leadIds.length,
        classified,
        coveragePct,
        /** Saídas revertidas na janela. Impresso mesmo quando é 0. */
        revertidas: revertidasNaJanela,
        /** Leads em estado de saída sem movimento no ledger — anteriores a ele. */
        semMovimentoRegistrado,
      },
      /**
       * ── PROCEDÊNCIA ────────────────────────────────────────────────────
       *
       * A janela pedida pode ser MAIOR que o registro. Hoje 7, 30 e 90 dias
       * devolvem o mesmo número, porque todo o ledger cabe entre 27/07 e 30/07.
       * Sem declarar isso, no dia 61 a tela mente por omissão.
       */
      procedencia: {
        fonte: "pipeline_stage_moves",
        estagiosContados: ESTAGIOS_DE_SAIDA,
        registroDeMovimentoDesde,
        janelaMaiorQueORegistro: Boolean(
          registroDeMovimentoDesde && new Date(registroDeMovimentoDesde).getTime() > start.getTime(),
        ),
        /**
         * Os motivos anteriores à correção são IRRECUPERÁVEIS: medido, eles não
         * existem em `leads.metadata`, nem no payload de `atlas_events`, nem na
         * descrição de `activities`. Ficam "não medido" — que é diferente de
         * "motivo_nao_classificado", a escolha explícita do corretor por
         * "Outro motivo".
         */
        motivoGravadoDesde: "2026-07-30",
      },
      byReason: [...byReason.values()]
        .map((bucket) => ({ ...bucket, share: sharePct(bucket.count, discarded) }))
        .sort((left, right) => right.count - left.count),
      byMetaCategory: [...byMetaCategory.entries()]
        .map(([category, count]) => ({ category, count, share: sharePct(count, discarded) }))
        .sort((left, right) => right.count - left.count),
      bySource: sourceEntries.map(([source, bucket]) => ({
        source,
        count: bucket.count,
        uniqueLeads: bucket.leads.size,
        share: sharePct(bucket.count, discarded),
        leadsFromSource: sourceBase.get(source) ?? null,
        ...baseFields(
          bucket.leads.size,
          sourceBase.get(source),
          source === "desconhecido"
            ? "origem não informada nesses leads — não há base comparável"
            : "base desta origem não apurada nesta janela",
        ),
      })),
      byCampaign: campaignEntries.map((bucket) => ({
        campaignId: bucket.campaignId,
        campaign: bucket.campaign,
        count: bucket.count,
        uniqueLeads: bucket.leads.size,
        share: sharePct(bucket.count, discarded),
        leadsFromCampaign: bucket.campaignId ? campaignBase.get(bucket.campaignId) ?? null : null,
        ...baseFields(
          bucket.leads.size,
          bucket.campaignId ? campaignBase.get(bucket.campaignId) : null,
          bucket.campaignId
            ? "base desta campanha não apurada nesta janela"
            : "esses leads não têm campanha vinculada — a ingestão ainda não grava campaign_id, então não há base por campanha",
        ),
      })),
      andromeda: {
        policy: "negative_signals_internal_only",
        directorDecisionRequired: true,
        readyForCrmLeadStatusSync: coveragePct !== null && coveragePct >= 80,
        taxonomyVersion: DISCARD_TAXONOMY_VERSION,
      },
      compatibility: leadResult.error ? "safe-base-report" : "canonical-report",
      generatedAt: new Date().toISOString(),
    },
    identity.meta,
    { headers: { ...rate.headers, "Cache-Control": "no-store" } },
  );
}
