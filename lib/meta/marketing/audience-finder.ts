/**
 * Localizador de Público — o diferencial de "achar público" na era Andromeda.
 *
 * Sob a categoria HOUSING ninguém segmenta na mão; achar público vira ciência
 * de SINAL: (1) onde o público responde (placement), (2) onde a verba vaza
 * (geo fora da praça), (3) qual perfil observado responde (demografia é
 * LEGÍVEL em reporting; segmentar por ela é proibido — aqui vira calibração
 * de criativo, nunca targeting), e (4) qual ÂNGULO criativo atrai o público
 * que rende (convenção de nome de anúncio → atribuição por ângulo).
 *
 * Núcleo puro e determinístico; tudo vira PROPOSTA (placement e geo são
 * controles permitidos em HOUSING — placement não é classe protegida).
 */

import type { MetaBreakdownRow } from "@/lib/meta/marketing/campaign-read";

const r2 = (n: number) => Math.round(n * 100) / 100;

export type PlacementLine = {
  platform: string; position: string;
  spend: number; leads: number; cpl: number | null; sharePct: number;
  verdict: "escalar" | "manter" | "revisar" | "descartar";
  reason: string;
};

/** Placements com fama de lead de baixa qualidade (clique acidental). */
const LOW_QUALITY_PLACEMENTS = new Set(["audience_network", "messenger"]);

/** Onde o público responde: gasto/leads/CPL por plataforma × posição. */
export function placementReport(rows: MetaBreakdownRow[]): PlacementLine[] {
  const map = new Map<string, { platform: string; position: string; spend: number; leads: number }>();
  let total = 0;
  for (const r of rows) {
    const platform = r.keys.publisher_platform || "desconhecida";
    const position = r.keys.platform_position || "desconhecida";
    const k = `${platform}|${position}`;
    const cur = map.get(k) ?? { platform, position, spend: 0, leads: 0 };
    cur.spend += r.spend; cur.leads += r.leads;
    map.set(k, cur);
    total += r.spend;
  }
  const lines: PlacementLine[] = [];
  const cpls = [...map.values()].filter((v) => v.leads > 0).map((v) => v.spend / v.leads).sort((a, b) => a - b);
  const medianCpl = cpls.length ? cpls[Math.floor(cpls.length / 2)] : null;
  for (const v of map.values()) {
    const cpl = v.leads > 0 ? r2(v.spend / v.leads) : null;
    let verdict: PlacementLine["verdict"] = "manter";
    let reason = "desempenho dentro do esperado.";
    if (LOW_QUALITY_PLACEMENTS.has(v.platform) && v.spend > 0) {
      verdict = "descartar";
      reason = `${v.platform} tem fama de lead de clique acidental — propor exclusão do placement (controle permitido em HOUSING) e validar a qualidade no CRM.`;
    } else if (v.leads === 0 && v.spend >= 20) {
      verdict = "revisar";
      reason = `R$ ${r2(v.spend)} gastos sem nenhum lead neste placement.`;
    } else if (cpl != null && medianCpl != null && cpl <= medianCpl * 0.7 && v.leads >= 10) {
      verdict = "escalar";
      reason = `CPL R$ ${cpl} bem abaixo da mediana (R$ ${r2(medianCpl)}) com volume — é onde o público responde.`;
    } else if (cpl != null && medianCpl != null && cpl > medianCpl * 2 && v.spend >= 20) {
      verdict = "revisar";
      reason = `CPL R$ ${cpl} mais de 2× a mediana — público não responde aqui.`;
    }
    lines.push({
      platform: v.platform, position: v.position,
      spend: r2(v.spend), leads: v.leads, cpl,
      sharePct: total > 0 ? r2((v.spend / total) * 100) : 0,
      verdict, reason,
    });
  }
  return lines.sort((a, b) => b.spend - a.spend);
}

export type GeoReport = {
  inTarget: { spend: number; leads: number; cpl: number | null; sharePct: number };
  leak: { spend: number; leads: number; sharePct: number; topRegions: Array<{ region: string; spend: number; leads: number }> };
  verdict: "focado" | "vazando";
  recommendation: string;
  /** Honestidade: o breakdown por região subatribui leads de formulário
   *  (validado ao vivo: ~20% dos leads ganham região). O GASTO por região é
   *  confiável; o CPL regional não — julgue o vazamento pelo gasto. */
  dataNote: string;
};

/** Onde a verba vaza: praça-alvo vs resto do país. */
export function geoReport(rows: MetaBreakdownRow[], opts: { homeRegions?: string[] } = {}): GeoReport {
  const home = (opts.homeRegions ?? ["São Paulo (state)"]).map((h) => h.toLowerCase());
  let inSpend = 0, inLeads = 0, outSpend = 0, outLeads = 0;
  const outByRegion = new Map<string, { spend: number; leads: number }>();
  for (const r of rows) {
    const region = r.keys.region || "desconhecida";
    const isHome = home.some((h) => region.toLowerCase().includes(h) || h.includes(region.toLowerCase()));
    if (isHome) { inSpend += r.spend; inLeads += r.leads; }
    else {
      outSpend += r.spend; outLeads += r.leads;
      const cur = outByRegion.get(region) ?? { spend: 0, leads: 0 };
      cur.spend += r.spend; cur.leads += r.leads;
      outByRegion.set(region, cur);
    }
  }
  const total = inSpend + outSpend;
  const leakPct = total > 0 ? (outSpend / total) * 100 : 0;
  const vazando = leakPct > 15;
  return {
    inTarget: {
      spend: r2(inSpend), leads: inLeads,
      cpl: inLeads > 0 ? r2(inSpend / inLeads) : null,
      sharePct: total > 0 ? r2((inSpend / total) * 100) : 0,
    },
    leak: {
      spend: r2(outSpend), leads: outLeads, sharePct: r2(leakPct),
      topRegions: [...outByRegion.entries()]
        .map(([region, v]) => ({ region, spend: r2(v.spend), leads: v.leads }))
        .sort((a, b) => b.spend - a.spend).slice(0, 5),
    },
    verdict: vazando ? "vazando" : "focado",
    recommendation: vazando
      ? `${r2(leakPct)}% da verba fora da praça-alvo — propor geo na cidade/raio do produto (controle permitido em HOUSING). Lead de fora raramente compra imóvel em SP.`
      : "Geo focado na praça-alvo — manter.",
    dataNote:
      "O gasto por região é confiável; leads de formulário são subatribuídos por região — julgue o vazamento pelo GASTO, não pelo CPL regional.",
  };
}

export type DemoLine = { age: string; gender: string; spend: number; leads: number; cpl: number | null; sharePct: number };

/**
 * Perfil OBSERVADO que responde (entrega da Meta, não segmentação).
 * Uso permitido: calibrar linguagem/criativo. Uso proibido: virar targeting.
 */
export function demoReport(rows: MetaBreakdownRow[]): { lines: DemoLine[]; policyNote: string } {
  const map = new Map<string, { age: string; gender: string; spend: number; leads: number }>();
  let total = 0;
  for (const r of rows) {
    const age = r.keys.age || "?";
    const gender = r.keys.gender || "?";
    const k = `${age}|${gender}`;
    const cur = map.get(k) ?? { age, gender, spend: 0, leads: 0 };
    cur.spend += r.spend; cur.leads += r.leads;
    map.set(k, cur);
    total += r.spend;
  }
  const lines = [...map.values()]
    .map((v) => ({
      age: v.age, gender: v.gender, spend: r2(v.spend), leads: v.leads,
      cpl: v.leads > 0 ? r2(v.spend / v.leads) : null,
      sharePct: total > 0 ? r2((v.spend / total) * 100) : 0,
    }))
    .sort((a, b) => b.leads - a.leads);
  return {
    lines,
    policyNote:
      "Observação de ENTREGA (reporting) — permitido. Segmentar por idade/gênero é PROIBIDO na categoria HOUSING; use apenas para calibrar linguagem e formato do criativo.",
  };
}

// ---------------------------------------------------------------------------
// Atribuição por ÂNGULO criativo — a convenção que fecha o ciclo
// ---------------------------------------------------------------------------

/** Nome de anúncio padronizado: "[Atlas] {produto} · {ângulo}" — atribuição machine-readable. */
export function adNameFor(product: string, angle: string): string {
  return `[Atlas] ${product} · ${angle}`;
}

export function parseAdName(adName: string): { product: string; angle: string } | null {
  const m = /^\[Atlas\]\s+(.+?)\s+·\s+(\S+)\s*$/.exec(adName);
  return m ? { product: m[1], angle: m[2] } : null;
}

export type AnglePerformance = { angle: string; product: string; spend: number; leads: number; cpl: number | null; ads: number };

/**
 * CPL por ângulo criativo — só para anúncios na convenção [Atlas]. Anúncio
 * legado (sem convenção) fica fora, sem chute. Quando a Fase 0 ligar o CRM,
 * a mesma chave (ângulo) recebe qualificação e venda — aí o "achar público"
 * vira aprendizado proprietário que a concorrência não tem.
 */
export function anglePerformance(
  ads: Array<{ adName: string; spend: number; leads: number }>,
): AnglePerformance[] {
  const map = new Map<string, AnglePerformance>();
  for (const ad of ads) {
    const parsed = parseAdName(ad.adName);
    if (!parsed) continue;
    const k = `${parsed.product}|${parsed.angle}`;
    const cur = map.get(k) ?? { angle: parsed.angle, product: parsed.product, spend: 0, leads: 0, cpl: null, ads: 0 };
    cur.spend = r2(cur.spend + ad.spend); cur.leads += ad.leads; cur.ads += 1;
    map.set(k, cur);
  }
  return [...map.values()]
    .map((v) => ({ ...v, cpl: v.leads > 0 ? r2(v.spend / v.leads) : null }))
    .sort((a, b) => (a.cpl ?? Infinity) - (b.cpl ?? Infinity));
}
