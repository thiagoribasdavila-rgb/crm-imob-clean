/**
 * Saúde criativa pós-Andromeda (motor de retrieval de anúncios da Meta).
 *
 * Núcleo determinístico e puro: recebe insights por anúncio × janela semanal
 * (MetaAdInsight, vindos de fetchAdInsights com time_increment=7) e produz,
 * por campanha, o quadro de diversidade criativa, os sinais de fadiga
 * (frequência/CTR/CPM comparando a última janela com a anterior) e um score
 * ponderado com recomendações.
 *
 * Tudo aqui é PROPOSTA sob supervisão humana — nada executa contra a Meta.
 * Sem fetch, sem relógio, sem aleatório: mesma entrada, mesma saída.
 *
 * Thresholds da pesquisa Andromeda 2025/2026: 5+ criativos conceitualmente
 * distintos por campanha (ideal 8-20, variando persona/desejo/awareness —
 * edições leves não geram Entity ID novo); frequência semanal > 2.5 degrada
 * entrega em público frio; queda de CTR e alta de CPM semana a semana
 * confirmam fadiga; conta pequena (< R$ 5.000/mês) com mais de 3 campanhas
 * fragmenta o aprendizado (cada ad set pede ~50 conversões/semana).
 */

import type { MetaAdInsight } from "@/lib/meta/marketing/campaign-read";

export type FatigueSignal = {
  adId: string;
  adName: string;
  kind: "frequencia_alta" | "ctr_caindo" | "cpm_subindo";
  detail: string;
};

export type AndromedaMove = {
  kind: "adicionar_criativos" | "consolidar_campanhas" | "pausar_criativo" | "renovar_criativo" | "manter";
  target: string;
  reason: string;
  /** 1 = urgente, 2 = importante, 3 = manutenção. */
  priority: number;
};

export type CreativeHealth = {
  campaignId: string;
  campaignName: string;
  activeAds: number;
  diversityScore: number;
  fatigue: FatigueSignal[];
  andromedaScore: number;
  breakdown: { diversidade: number; fadiga: number; consolidacao: number };
  recommendations: AndromedaMove[];
};

// Thresholds padrão (fontes no cabeçalho). Sobrescritíveis via opts.
const DEFAULT_FREQ_LIMIT = 2.5; // frequência semanal tolerável em público frio
const DEFAULT_CTR_DROP_PCT = 25; // queda semanal de CTR que confirma fadiga
const DEFAULT_CPM_RISE_PCT = 20; // alta semanal de CPM que confirma drift
const DIVERSITY_TARGET = 5; // mínimo de criativos distintos por campanha (ideal 8-20)
const RELEVANT_SPEND_SHARE = 0.1; // ad com >= 10% do gasto da campanha na última janela
const SMALL_ACCOUNT_MONTHLY_BRL = 5_000; // abaixo disso, conta pequena
const MAX_ACTIVE_CAMPAIGNS_SMALL = 3; // acima disso, o sinal fragmenta

function groupBy<K, T>(items: T[], key: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/** Variação percentual entre janelas; null quando não há base de comparação. */
function pctDelta(prev: number, last: number): number | null {
  if (prev <= 0) return null;
  return ((last - prev) / prev) * 100;
}

/**
 * Analisa a saúde criativa por campanha a partir de linhas anúncio × janela.
 *
 * Premissa de entrada: uma linha por anúncio por janela (contrato de
 * fetchAdInsights com time_increment). "Ativo" = anúncio presente na última
 * janela da campanha. Fadiga exige pelo menos duas janelas do MESMO anúncio —
 * uma janela só não é tendência (honestidade antes de alarme).
 */
export function analyzeCreativeHealth(
  rows: MetaAdInsight[],
  opts: { freqLimit?: number; ctrDropPct?: number; cpmRisePct?: number; diversityTarget?: number; maxActiveCampaignsSmall?: number } = {},
): CreativeHealth[] {
  const freqLimit = opts.freqLimit ?? DEFAULT_FREQ_LIMIT;
  const ctrDropPct = opts.ctrDropPct ?? DEFAULT_CTR_DROP_PCT;
  const cpmRisePct = opts.cpmRisePct ?? DEFAULT_CPM_RISE_PCT;
  const diversityTarget = opts.diversityTarget ?? DIVERSITY_TARGET;
  const maxActiveSmall = opts.maxActiveCampaignsSmall ?? MAX_ACTIVE_CAMPAIGNS_SMALL;

  const byCampaign = groupBy(rows, (r) => r.campaignId);
  // Consolidação mede a CONTA, não a campanha — e só conta campanha VIVA:
  // presença na última janela global (o período pode conter pausadas antigas).
  const globalLastWindow = rows.reduce((max, r) => (r.dateStart > max ? r.dateStart : max), "");
  const liveCampaigns = new Set(rows.filter((r) => r.dateStart === globalLastWindow).map((r) => r.campaignId)).size;
  // Até o teto = 100; cada campanha viva extra custa 20 pontos.
  const consolidacao = Math.max(
    0,
    100 - Math.max(0, liveCampaigns - maxActiveSmall) * 20,
  );

  const reports: CreativeHealth[] = [];
  for (const [campaignId, campaignRows] of byCampaign) {
    const campaignName = campaignRows[0]?.campaignName ?? "";

    // Última janela da campanha (datas ISO ordenam lexicograficamente).
    const lastWindow = campaignRows.reduce((max, r) => (r.dateStart > max ? r.dateStart : max), "");
    const lastRows = campaignRows.filter((r) => r.dateStart === lastWindow);
    const activeAds = new Set(lastRows.map((r) => r.adId)).size;
    // Escala linear até o alvo calibrável (alvo = 100).
    const diversidade = Math.min(100, Math.round(activeAds * (100 / diversityTarget)));

    // Fadiga por anúncio: última janela vs anterior (mesmo adId).
    const fatigue: FatigueSignal[] = [];
    const signalsByAd = new Map<string, FatigueSignal[]>();
    let evaluatedAds = 0;
    for (const [adId, adRows] of groupBy(campaignRows, (r) => r.adId)) {
      const sorted = [...adRows].sort((a, b) => a.dateStart.localeCompare(b.dateStart));
      if (sorted.length < 2) continue; // 1 janela só = sem sinal (honesto)
      const prev = sorted[sorted.length - 2];
      const last = sorted[sorted.length - 1];
      if (!prev || !last) continue;
      evaluatedAds += 1;

      const signals: FatigueSignal[] = [];
      if (last.frequency > freqLimit) {
        signals.push({
          adId,
          adName: last.adName,
          kind: "frequencia_alta",
          detail: `frequência ${last.frequency.toFixed(2)}/semana acima do limite ${freqLimit} para público frio (degradação acima de 2.5, queda forte acima de 4.0)`,
        });
      }
      const ctrDelta = pctDelta(prev.ctr, last.ctr);
      if (ctrDelta !== null && -ctrDelta > ctrDropPct) {
        signals.push({
          adId,
          adName: last.adName,
          kind: "ctr_caindo",
          detail: `CTR caiu ${(-ctrDelta).toFixed(1)}% entre janelas (${prev.ctr.toFixed(2)} → ${last.ctr.toFixed(2)}), acima do limite de ${ctrDropPct}%`,
        });
      }
      const cpmDelta = pctDelta(prev.cpm, last.cpm);
      if (cpmDelta !== null && cpmDelta > cpmRisePct) {
        signals.push({
          adId,
          adName: last.adName,
          kind: "cpm_subindo",
          detail: `CPM subiu ${cpmDelta.toFixed(1)}% entre janelas (${prev.cpm.toFixed(2)} → ${last.cpm.toFixed(2)}), acima do limite de ${cpmRisePct}%`,
        });
      }
      if (signals.length > 0) {
        signalsByAd.set(adId, signals);
        fatigue.push(...signals);
      }
    }
    // Sem histórico avaliável = sem penalização (e sem atestado de saúde).
    const fadiga = evaluatedAds === 0 ? 100 : Math.round(100 * (1 - signalsByAd.size / evaluatedAds));

    // Recomendações — sempre propostas, coerentes com os sinais acima.
    const recommendations: AndromedaMove[] = [];
    if (activeAds < diversityTarget) {
      recommendations.push({
        kind: "adicionar_criativos",
        target: campaignName || campaignId,
        reason: `${activeAds} criativo(s) ativo(s) na última janela; o alvo pós-Andromeda é ${diversityTarget}+ conceitos distintos (ideal 8-20), variando persona, desejo e nível de awareness — edição leve não conta como criativo novo`,
        priority: activeAds <= 2 ? 1 : 2,
      });
    }
    const campaignLastSpend = lastRows.reduce((sum, r) => sum + r.spend, 0);
    for (const [adId, signals] of signalsByAd) {
      const adLast = lastRows.find((r) => r.adId === adId);
      const spend = adLast?.spend ?? 0;
      if (campaignLastSpend <= 0 || spend / campaignLastSpend < RELEVANT_SPEND_SHARE) continue;
      const sharePct = ((spend / campaignLastSpend) * 100).toFixed(0);
      const adName = signals[0]?.adName ?? adId;
      if (signals.length >= 2) {
        recommendations.push({
          kind: "pausar_criativo",
          target: adName,
          reason: `${signals.length} sinais de fadiga simultâneos com ${sharePct}% do gasto da campanha na última janela — pausar e substituir por conceito novo (Entity ID distinto)`,
          priority: 1,
        });
      } else {
        recommendations.push({
          kind: "renovar_criativo",
          target: adName,
          reason: `sinal de ${signals[0]?.kind ?? "fadiga"} com ${sharePct}% do gasto da campanha — renovar o CONCEITO do criativo (trocar cor ou cortar segundos não gera Entity ID novo)`,
          priority: 2,
        });
      }
    }
    if (liveCampaigns > maxActiveSmall) {
      recommendations.push({
        kind: "consolidar_campanhas",
        target: "conta",
        reason: `${liveCampaigns} campanhas ativas fragmentam o sinal de aprendizado; o Andromeda premia 1-3 campanhas por objetivo com ad sets amplos e diversidade no nível do criativo`,
        priority: 2,
      });
    }
    if (recommendations.length === 0) {
      recommendations.push({
        kind: "manter",
        target: campaignName || campaignId,
        reason: "diversidade no alvo e sem sinais de fadiga — manter e planejar rotação de conceitos a cada 1-3 semanas (refresh proativo preserva ROAS)",
        priority: 3,
      });
    }
    recommendations.sort((a, b) => a.priority - b.priority);

    const andromedaScore = Math.round(0.4 * diversidade + 0.4 * fadiga + 0.2 * consolidacao);
    reports.push({
      campaignId,
      campaignName,
      activeAds,
      diversityScore: diversidade,
      fatigue,
      andromedaScore,
      breakdown: { diversidade, fadiga, consolidacao },
      recommendations,
    });
  }

  // Pior saúde primeiro (é onde a supervisão humana deve olhar antes).
  return reports.sort(
    (a, b) => a.andromedaScore - b.andromedaScore || a.campaignId.localeCompare(b.campaignId),
  );
}

/**
 * Veredito de consolidação da conta: conta pequena (< R$ 5.000/mês) com mais
 * de 3 campanhas ativas dilui o budget abaixo do necessário para o learning
 * (~50 conversões/ad set/semana) — o Andromeda premia consolidação.
 */
export function accountConsolidation(
  activeCampaigns: number,
  monthlySpend: number,
): { verdict: "consolidada" | "fragmentada"; reason: string } {
  const small = monthlySpend < SMALL_ACCOUNT_MONTHLY_BRL;
  if (small && activeCampaigns > MAX_ACTIVE_CAMPAIGNS_SMALL) {
    return {
      verdict: "fragmentada",
      reason: `conta pequena (R$ ${monthlySpend.toFixed(2)}/mês) com ${activeCampaigns} campanhas ativas: o budget semanal não banca ~50 conversões por ad set e o aprendizado fragmenta — consolidar em 1-3 campanhas e diversificar no nível do criativo`,
    };
  }
  if (small) {
    return {
      verdict: "consolidada",
      reason: `estrutura compatível com a verba: ${activeCampaigns} campanha(s) ativa(s) para R$ ${monthlySpend.toFixed(2)}/mês — manter até ${MAX_ACTIVE_CAMPAIGNS_SMALL} campanhas e concentrar o sinal`,
    };
  }
  return {
    verdict: "consolidada",
    reason: `verba mensal (R$ ${monthlySpend.toFixed(2)}) comporta a estrutura de ${activeCampaigns} campanha(s); ainda assim, manter 1-3 campanhas por objetivo com diversidade criativa é o padrão pós-Andromeda`,
  };
}
