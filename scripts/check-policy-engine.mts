import { proposePolicies, policySummary, type PolicyInput } from "../lib/meta/marketing/policy-engine.ts";

let pass = 0, fail = 0;
const t = (name: string, ok: boolean, extra = "") => { if (ok) pass++; else fail++; console.log(`${ok ? "✅" : "❌"} ${name}${extra ? " — " + extra : ""}`); };

const placement = (platform: string, position: string, spend: number, leads: number, verdict: string) =>
  ({ platform, position, spend, leads, cpl: leads > 0 ? spend / leads : null, sharePct: 0, verdict, reason: "" }) as PolicyInput["placements"][number];
const health = (campaignName: string, score: number, fatigueCount: number, recKind: string) => ({
  campaignId: "c", campaignName, activeAds: 1, diversityScore: 20,
  fatigue: Array.from({ length: fatigueCount }, (_, i) => ({ adId: "a" + i, adName: "Ad", kind: "cpm_subindo", detail: "" })),
  andromedaScore: score, breakdown: { diversidade: 20, fadiga: 0, consolidacao: 100 },
  recommendations: [{ kind: recKind, target: "Ad X", reason: "fadiga", priority: 1 }],
}) as PolicyInput["creativeHealth"][number];

// 1. Audience Network descartar → proposta reversível de pausar_placement
{
  const p = proposePolicies({ placements: [placement("audience_network", "an_classic", 259, 120, "descartar")] });
  t("AN descartar → pausar_placement", p.some((x) => x.kind === "pausar_placement" && x.reversible));
  t("120 leads → alta confiança", p[0].confidence === "alta");
  t("evidência cita gasto", p[0].evidence.includes("259"));
}
// 2. placement escalar/manter NÃO vira proposta (só corta, não prescreve o que já vai bem)
{
  const p = proposePolicies({ placements: [placement("instagram", "reels", 188, 75, "escalar")] });
  t("escalar → sem prescrição", p.length === 0);
}
// 3. placement revisar com 0 leads e gasto → pausar_placement média
{
  const p = proposePolicies({ placements: [placement("facebook", "video_feeds", 30, 0, "revisar")] });
  t("0 leads gasto ≥20 → pausar média", p.some((x) => x.kind === "pausar_placement" && x.confidence === "media"));
}
// 4. criativo fatigado → pausar_criativo, alta se ≥2 sinais
{
  const p = proposePolicies({ creativeHealth: [health("Spin Mood", 28, 2, "pausar_criativo")] });
  t("fadiga 2 sinais → pausar_criativo alta", p.some((x) => x.kind === "pausar_criativo" && x.confidence === "alta"));
}
// 5. renovar_criativo
{
  const p = proposePolicies({ creativeHealth: [health("Arvo", 44, 1, "renovar_criativo")] });
  t("renovar_criativo média (1 sinal)", p.some((x) => x.kind === "renovar_criativo" && x.confidence === "media"));
}
// 6. recomendação que NÃO é pausar/renovar não vira proposta (ex.: adicionar_criativos não é reversível-ação-Meta)
{
  const h = health("X", 20, 0, "adicionar_criativos");
  const p = proposePolicies({ creativeHealth: [h] });
  t("adicionar_criativos → sem prescrição de controle", !p.some((x) => x.kind.startsWith("pausar") || x.kind.startsWith("renovar")));
}
// 7. conta fragmentada → consolidar reversível
{
  const p = proposePolicies({ consolidation: { verdict: "fragmentada", reason: "5 campanhas" } });
  t("fragmentada → consolidar", p.some((x) => x.kind === "consolidar_conta" && x.reversible));
}
// 8. conta consolidada → sem proposta
{
  const p = proposePolicies({ consolidation: { verdict: "consolidada", reason: "ok" } });
  t("consolidada → sem prescrição", p.length === 0);
}
// 9. geo vazando >15% → revisar_geo
{
  const p = proposePolicies({ geo: { verdict: "vazando", leak: { sharePct: 30 } } });
  t("geo vazando 30% → revisar_geo", p.some((x) => x.kind === "revisar_geo"));
  const p2 = proposePolicies({ geo: { verdict: "vazando", leak: { sharePct: 10 } } });
  t("geo vazando 10% → tolera (≤15)", p2.length === 0);
}
// 10. TODA proposta é reversível (invariante da prescrição governada)
{
  const p = proposePolicies({
    placements: [placement("audience_network", "an", 259, 120, "descartar")],
    creativeHealth: [health("X", 20, 2, "pausar_criativo")],
    consolidation: { verdict: "fragmentada", reason: "x" },
  });
  t("todas reversíveis", p.length >= 3 && p.every((x) => x.reversible));
  t("ordenadas por prioridade", p.every((x, i) => i === 0 || p[i - 1].priority <= x.priority));
}
// 11. vazio → sem proposta + summary honesto
{
  t("input vazio → []", proposePolicies({}).length === 0);
  t("summary vazio honesto", policySummary([]).includes("dentro dos parâmetros"));
  const p = proposePolicies({ placements: [placement("audience_network", "an", 259, 120, "descartar")] });
  t("summary conta e diz reversível", policySummary(p).includes("reversíveis") && policySummary(p).includes("1"));
}

console.log(`\n${pass}/${pass + fail} ok`);
process.exit(fail ? 1 : 0);
