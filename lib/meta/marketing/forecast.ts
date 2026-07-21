/**
 * Análise preditiva do Meta — o "para onde isso vai" das campanhas.
 *
 * A partir das linhas campanha×semana (a mesma matéria-prima do relatório de
 * custo: last_30d, time_increment 7 → uma linha por semana) o módulo projeta
 * leads, CPL e ritmo de gasto de forma DETERMINÍSTICA: só aritmética sobre o
 * histórico, sem rede, sem banco e — regra dura — SEM chutar. Quando não há
 * histórico suficiente a projeção é 0/null e a suposição vai explícita em
 * `assumptions`; nunca inventamos um número que o dado não sustenta.
 *
 * Nenhuma função lê o relógio: `budgetBurnForecast` recebe o dia da semana
 * (1-7) do chamador — o núcleo continua puro e testável (mesma entrada, mesma
 * saída). Os limiares de tendência/anomalia vêm da calibração central
 * (grupo "forecast" em lib/ai/calibration.ts) via `opts`, com defaults seguros.
 */

export type ForecastWeek = { weekStart: string; spend: number; leads: number };

export type ForecastPace = "acelerando" | "estavel" | "desacelerando";
export type ForecastConfidence = "baixa" | "media" | "alta";

export type CampaignForecast = {
  pace: ForecastPace;
  projectedWeeklyLeads: { pessimista: number; esperado: number; otimista: number };
  projectedCpl: number | null;
  trendPct: number;
  confidence: ForecastConfidence;
  assumptions: string[];
};

export type ForecastOpts = {
  minWeeksForTrend?: number;   // nº mínimo de semanas para confiar na tendência
  anomalyLeadDropPct?: number; // queda % de leads que dispara alerta preditivo
};

// ---------------------------------------------------------------------------
// Constantes de núcleo (limiares que NÃO são calibráveis pela diretoria —
// política/matemática interna). O que a diretoria mexe vive na calibração.
// ---------------------------------------------------------------------------
const PACE_BAND_PCT = 10;      // |trend| dentro disso = "estavel"
const VOLUME_ALTA = 30;        // leads acumulados p/ confiança "alta"
const CPL_SPIKE_RATIO = 1.5;   // CPL da última semana X× a média anterior = spike
const EPS = 1e-9;

const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Número finito e ≥ 0; qualquer lixo vira 0 (nunca NaN, nunca negativo). */
const nonNeg = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
/** Número > 0; devolve fallback se inválido. */
const posOr = (v: unknown, fb: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fb;
};

/** Ordena as semanas por weekStart (ISO ordena lexicograficamente) e sanitiza. */
function sortedWeeks(weeks: ForecastWeek[]): Array<{ weekStart: string; spend: number; leads: number }> {
  if (!Array.isArray(weeks)) return [];
  return weeks
    .map((w) => ({ weekStart: String(w?.weekStart ?? ""), spend: nonNeg(w?.spend), leads: nonNeg(w?.leads) }))
    .sort((a, b) => (a.weekStart < b.weekStart ? -1 : a.weekStart > b.weekStart ? 1 : 0));
}

/** Média simples de uma lista (0 se vazia). */
function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

/** Desvio-padrão populacional (0 se ≤ 1 ponto). */
function stddev(xs: number[]): number {
  if (xs.length <= 1) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
}

/**
 * Regressão linear simples (mínimos quadrados) de y sobre o índice 0..n-1.
 * Devolve o valor projetado para o próximo índice (n). Com 1 ponto, projeta o
 * próprio ponto (sem inclinação); com 0 pontos, 0.
 */
function projectNext(ys: number[]): number {
  const n = ys.length;
  if (n === 0) return 0;
  if (n === 1) return ys[0];
  const xs = ys.map((_, i) => i);
  const mx = mean(xs);
  const my = mean(ys);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den > EPS ? num / den : 0;
  const intercept = my - slope * mx;
  return intercept + slope * n;
}

/**
 * Previsão de leads/CPL/ritmo de uma campanha a partir das suas semanas.
 *
 * - `trendPct`: variação % dos leads da última semana vs a média das anteriores.
 * - `pace`: acelerando/estável/desacelerando conforme |trendPct| cruza a banda.
 * - `projectedWeeklyLeads`: regressão sobre as semanas + banda de incerteza
 *   (mais larga quanto menor a confiança); pessimista nunca fica negativo.
 * - `projectedCpl`: gasto projetado ÷ leads projetados; null se não houver leads.
 * - `confidence`: por nº de semanas (minWeeksForTrend) e volume de leads.
 *
 * Sem histórico → tudo 0/null com a suposição registrada. Nunca chuta.
 */
export function forecastCampaign(weeks: ForecastWeek[], opts?: ForecastOpts): CampaignForecast {
  const minWeeksForTrend = Math.max(2, Math.floor(posOr(opts?.minWeeksForTrend, 3)));
  const ws = sortedWeeks(weeks);
  const n = ws.length;
  const assumptions: string[] = [];

  if (n === 0) {
    assumptions.push("Sem histórico de semanas — projeção zerada; colete pelo menos algumas semanas antes de projetar.");
    return {
      pace: "estavel",
      projectedWeeklyLeads: { pessimista: 0, esperado: 0, otimista: 0 },
      projectedCpl: null,
      trendPct: 0,
      confidence: "baixa",
      assumptions,
    };
  }

  const leadsArr = ws.map((w) => w.leads);
  const spendArr = ws.map((w) => w.spend);
  const totalLeads = leadsArr.reduce((s, x) => s + x, 0);

  // Tendência: última semana vs média das anteriores.
  const last = ws[n - 1];
  const prev = ws.slice(0, n - 1).map((w) => w.leads);
  const meanPrev = mean(prev);
  let trendPct = 0;
  if (n >= 2) {
    if (meanPrev > EPS) trendPct = r1(((last.leads - meanPrev) / meanPrev) * 100);
    else if (last.leads > 0) trendPct = 100; // saiu do zero — cresceu, mas anota a base frágil
    else trendPct = 0;
  }

  // Ritmo pela banda de tendência (só quando há ≥ 2 semanas p/ comparar).
  let pace: ForecastPace = "estavel";
  if (n >= 2) {
    if (trendPct > PACE_BAND_PCT) pace = "acelerando";
    else if (trendPct < -PACE_BAND_PCT) pace = "desacelerando";
  }

  // Confiança por nº de semanas e volume.
  let confidence: ForecastConfidence;
  if (n < 2 || totalLeads <= 0) confidence = "baixa";
  else if (n >= minWeeksForTrend && totalLeads >= VOLUME_ALTA) confidence = "alta";
  else confidence = "media";

  // Projeção de leads (regressão) + banda de incerteza.
  const projLeadsRaw = Math.max(0, projectNext(leadsArr));
  const uncertaintyFrac = confidence === "alta" ? 0.1 : confidence === "media" ? 0.2 : 0.35;
  const band = stddev(leadsArr) + projLeadsRaw * uncertaintyFrac;
  const esperado = Math.round(projLeadsRaw);
  const pessimista = Math.max(0, Math.round(projLeadsRaw - band));
  const otimista = Math.round(projLeadsRaw + band);

  // CPL projetado: gasto projetado ÷ leads projetados (não arredondados).
  const projSpendRaw = Math.max(0, projectNext(spendArr));
  const projectedCpl = projLeadsRaw > EPS ? r2(projSpendRaw / projLeadsRaw) : null;

  // Suposições honestas.
  assumptions.push(`Baseado em ${n} semana(s) de histórico (${totalLeads} lead(s) somados).`);
  if (n < minWeeksForTrend) {
    assumptions.push(`Menos de ${minWeeksForTrend} semanas — tendência ainda instável; leia o ritmo com cautela.`);
  }
  if (projectedCpl === null) {
    assumptions.push("Sem leads projetados — CPL não estimável; não inventamos um valor.");
  }

  return {
    pace,
    projectedWeeklyLeads: { pessimista, esperado, otimista },
    projectedCpl,
    trendPct,
    confidence,
    assumptions,
  };
}

// ---------------------------------------------------------------------------
// Ritmo de queima da verba semanal
// ---------------------------------------------------------------------------

export type BurnPacing = "abaixo" | "no_ritmo" | "estourando" | "vai_estourar";
export type BudgetBurnForecast = {
  pacing: BurnPacing;
  projectedWeekSpend: number;
  recommendation: string;
};

const BURN_LOW = 0.85;  // projeção < 85% da verba → "abaixo"
const BURN_HIGH = 1.05; // projeção > 105% da verba → "vai_estourar"

/**
 * Projeta o gasto da SEMANA pelo ritmo diário observado até aqui.
 *
 * `dayOfWeek` (1-7) vem do chamador — o núcleo NÃO lê o relógio. Ritmo diário =
 * gasto até agora ÷ dias decorridos; projeção = ritmo × 7. O veredito compara a
 * projeção com a verba; se o gasto atual JÁ passou da verba, é "estourando"
 * (não é previsão, é fato).
 */
export function budgetBurnForecast(weeklyBudget: number, spentSoFar: number, dayOfWeek: number): BudgetBurnForecast {
  const budget = nonNeg(weeklyBudget);
  const spent = nonNeg(spentSoFar);
  const day = Math.min(7, Math.max(1, Math.floor(posOr(dayOfWeek, 1))));

  const dailyRate = spent / day;
  const projectedWeekSpend = r2(dailyRate * 7);

  let pacing: BurnPacing;
  let recommendation: string;

  if (budget <= 0) {
    // Sem verba definida não há régua de pacing — mas gasto sem teto é alerta.
    pacing = spent > 0 ? "estourando" : "abaixo";
    recommendation =
      spent > 0
        ? "Sem verba semanal definida e já há gasto — defina o teto para poder controlar o ritmo."
        : "Sem verba semanal definida e sem gasto — configure a verba para acompanhar o ritmo.";
    return { pacing, projectedWeekSpend, recommendation };
  }

  const ratio = projectedWeekSpend / budget;

  if (spent > budget + EPS) {
    pacing = "estourando";
    recommendation = `Verba de R$ ${r2(budget)} já estourada no dia ${day}/7 (R$ ${r2(spent)} gastos) — pause ou reduza o diário imediatamente.`;
  } else if (ratio > BURN_HIGH) {
    pacing = "vai_estourar";
    recommendation = `No ritmo atual a semana fecha em ~R$ ${projectedWeekSpend}, acima da verba de R$ ${r2(budget)} — reduza o diário para caber.`;
  } else if (ratio >= BURN_LOW) {
    pacing = "no_ritmo";
    recommendation = `Projeção de ~R$ ${projectedWeekSpend} contra a verba de R$ ${r2(budget)} — dentro do esperado, manter.`;
  } else {
    pacing = "abaixo";
    recommendation = `No ritmo atual a semana fecha em ~R$ ${projectedWeekSpend}, abaixo da verba de R$ ${r2(budget)} — há folga para escalar se o CPL permitir.`;
  }

  return { pacing, projectedWeekSpend, recommendation };
}

// ---------------------------------------------------------------------------
// Saída do aprendizado (learning phase)
// ---------------------------------------------------------------------------

export type LearningPhaseEta = { willExit: boolean; etaWeeks: number | null; note: string };

/**
 * Estima se/quando o conjunto sai do aprendizado no ritmo atual.
 *
 * Regra da Meta: são precisos ~`learningEventsPerWeek` (~50) eventos de
 * otimização dentro de uma janela de 7 dias. Se o ritmo semanal fica ABAIXO
 * disso, o conjunto não sai — fica em "aprendizado limitado" (a janela reinicia
 * antes de acumular o suficiente). Determinístico, sem relógio.
 */
export function learningPhaseEta(convPerWeekNow: number, learningEventsPerWeek: number): LearningPhaseEta {
  const rate = nonNeg(convPerWeekNow);
  const floor = posOr(learningEventsPerWeek, 50);

  if (rate <= 0) {
    return {
      willExit: false,
      etaWeeks: null,
      note: `Sem conversões no ritmo atual — o conjunto não sai do aprendizado; precisa de ~${r1(floor)} eventos/semana.`,
    };
  }

  if (rate + EPS >= floor) {
    const etaWeeks = Math.max(1, Math.ceil(floor / rate));
    return {
      willExit: true,
      etaWeeks,
      note: `No ritmo de ~${r1(rate)} conv/semana o conjunto acumula os ~${r1(floor)} eventos e sai do aprendizado em ~${etaWeeks} semana(s).`,
    };
  }

  return {
    willExit: false,
    etaWeeks: null,
    note: `No ritmo de ~${r1(rate)} conv/semana (abaixo dos ~${r1(floor)} necessários) o conjunto fica em aprendizado limitado — suba a verba ou consolide para ganhar volume.`,
  };
}

// ---------------------------------------------------------------------------
// Alertas preditivos (anomalias que ainda vão doer)
// ---------------------------------------------------------------------------

/**
 * Alertas PREDITIVOS a partir das semanas: padrões que sinalizam problema à
 * frente (não só o retrato de agora). Ex.: gasto subindo e leads caindo em
 * sequência → o CPL vai estourar. Devolve [] quando a série está saudável —
 * silêncio honesto, sem alarme fabricado.
 */
export function anomalyForecast(weeks: ForecastWeek[], opts?: ForecastOpts): string[] {
  const minWeeksForTrend = Math.max(2, Math.floor(posOr(opts?.minWeeksForTrend, 3)));
  const anomalyLeadDropPct = posOr(opts?.anomalyLeadDropPct, 20);
  const ws = sortedWeeks(weeks);
  const n = ws.length;
  const alerts: string[] = [];
  if (n < 2) return alerts;

  const last = ws[n - 1];
  const prev = ws[n - 2];

  // 1) Gasto subindo E leads caindo em sequência a partir do fim.
  //    minWeeksForTrend semanas = (minWeeksForTrend - 1) transições consecutivas.
  let run = 0;
  for (let i = n - 1; i >= 1; i -= 1) {
    if (ws[i].spend > ws[i - 1].spend + EPS && ws[i].leads < ws[i - 1].leads - EPS) run += 1;
    else break;
  }
  if (run >= minWeeksForTrend - 1) {
    alerts.push(
      `Gasto subindo e leads caindo há ${run + 1} semanas seguidas — o CPL tende a estourar; revise criativo, público ou pause antes de queimar mais verba.`,
    );
  }

  // 2) Queda abrupta de leads na última semana (vs a anterior).
  if (prev.leads > 0) {
    const dropPct = ((prev.leads - last.leads) / prev.leads) * 100;
    if (dropPct >= anomalyLeadDropPct) {
      alerts.push(
        `Leads caíram ${r1(dropPct)}% na última semana (${prev.leads} → ${last.leads}) — acima do limite de ${r1(anomalyLeadDropPct)}%; investigue entrega/criativo.`,
      );
    }
  }

  // 3) Gasto sem lead nenhum na última semana (CPL indo para o infinito).
  if (last.spend > 0 && last.leads === 0) {
    alerts.push(
      `Última semana gastou R$ ${r2(last.spend)} sem nenhum lead — CPL tende ao infinito; verifique rastreamento de conversão e entrega.`,
    );
  }

  // 4) CPL da última semana muito acima da média das anteriores (spike).
  const cpls = ws.map((w) => (w.leads > 0 ? w.spend / w.leads : null));
  const lastCpl = cpls[n - 1];
  const priorCpls = cpls.slice(0, n - 1).filter((c): c is number => c !== null);
  if (lastCpl !== null && priorCpls.length > 0) {
    const meanPriorCpl = mean(priorCpls);
    if (meanPriorCpl > EPS && lastCpl >= meanPriorCpl * CPL_SPIKE_RATIO) {
      alerts.push(
        `CPL da última semana (R$ ${r2(lastCpl)}) está ${r1(lastCpl / meanPriorCpl)}× a média anterior (R$ ${r2(meanPriorCpl)}) — tendência de encarecimento.`,
      );
    }
  }

  return alerts;
}
