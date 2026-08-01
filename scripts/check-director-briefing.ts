/**
 * Teste adversarial do briefing executivo (lib/ai/director-briefing).
 *
 * Standalone, sem framework, no estilo dos scripts/check-*.mjs: acumula
 * falhas em pt-BR num array e sai com código 1 se qualquer caso reprovar.
 * Rodar com: node scripts/check-director-briefing.ts
 * (Node >= 22.18 executa TypeScript por type-stripping; os imports do módulo
 * alvo são todos `import type`, apagados em runtime — nada de alias "@/").
 */

import { buildDirectorBriefing, type BriefingInput, type DirectorBriefing } from "../lib/ai/director-briefing.ts";
import type { BudgetLine, CostBucket } from "../lib/marketing/cost-report.ts";
import type { MarketingPlan } from "../lib/ai/marketing-strategist.ts";

const failures: string[] = [];
let executados = 0;

function caso(nome: string, fn: () => void): void {
  executados += 1;
  try {
    fn();
  } catch (err: unknown) {
    failures.push(`${nome}: exceção inesperada — ${err instanceof Error ? err.message : String(err)}`);
  }
}
function esperar(cond: boolean, msg: string): void {
  if (!cond) failures.push(msg);
}

// ---- fábricas de fixture (preenchem os campos obrigatórios dos tipos reais) ----

function mkBudget(p: Partial<BudgetLine> & { product: string }): BudgetLine {
  return {
    developer: null,
    weeklyBudget: 1000,
    spent: 0,
    remaining: 1000,
    pctUsed: 0,
    cac: null,
    targetCac: null,
    pacing: "abaixo",
    verdict: "sem_dados",
    recommendation: "",
    ...p,
  };
}
function mkCampaign(p: Partial<CostBucket> & { label: string }): CostBucket {
  return { key: p.label.toLowerCase(), spend: 0, leads: 0, sales: 0, cpl: null, cac: null, share: 0, ...p };
}
function mkPlan(moves: MarketingPlan["moves"]): MarketingPlan {
  return { moves, summary: { desperdicioSemanal: 0, economiaPotencial: 0, produtosEficientes: 0, produtosCaros: 0 } };
}
function contarFrases(narrative: string): number {
  return narrative.split(/\.\s+/).length;
}

// ---- casos adversariais ----

// 1. Input vazio não quebra: mood bom, narrativa honesta, nada inventado.
caso("vazio", () => {
  const b: DirectorBriefing = buildDirectorBriefing({ source: "db" });
  esperar(b.mood === "bom", `vazio: mood deveria ser "bom", veio "${b.mood}"`);
  esperar(b.decisions.length === 0, `vazio: não deveria haver decisões, vieram ${b.decisions.length}`);
  esperar(b.kpis.length === 0, `vazio: kpis deveriam ser omitidos, vieram ${b.kpis.length}`);
  esperar(/não recebi dados/i.test(b.narrative), "vazio: narrativa deveria admitir ausência de dados");
  esperar(/aprovação/i.test(b.narrative), "vazio: narrativa deveria fechar com o que espera aprovação");
  esperar(/sem dados/i.test(b.headline), "vazio: headline deveria ser honesta sobre a falta de dados");
  esperar(b.watching.length >= 1, "vazio: watching deveria ter ao menos um item");
});

// 2. Verba estourada + CAC caro => crítico, com decisão máxima.
caso("estouro-caro", () => {
  const b = buildDirectorBriefing({
    source: "db",
    budget: [mkBudget({ product: "Spin Mood", weeklyBudget: 1000, spent: 1300, pctUsed: 130, pacing: "estourou", verdict: "caro", cac: 900, targetCac: 500 })],
  });
  esperar(b.mood === "critico", `estouro-caro: mood deveria ser "critico", veio "${b.mood}"`);
  esperar(b.decisions.some((d) => d.urgency === 5), "estouro-caro: deveria existir decisão de urgência 5");
  esperar(b.decisions.some((d) => /Spin Mood/.test(d.title)), "estouro-caro: a decisão deveria nomear o produto");
});

// 3. Score criativo < 40 em campanha com gasto relevante => crítico.
caso("andromeda-critico", () => {
  const b = buildDirectorBriefing({
    source: "db",
    campaigns: [mkCampaign({ label: "Spin Mood Leads", spend: 800, leads: 40, cpl: 20 })],
    creativeHealth: [{ campaignName: "Spin Mood Leads", andromedaScore: 25, fatigueCount: 3, activeAds: 5 }],
  });
  esperar(b.mood === "critico", `andromeda-critico: mood deveria ser "critico", veio "${b.mood}"`);
});

// 4. Score < 40 mas gasto irrelevante => NÃO crítico (vira atenção).
caso("andromeda-gasto-baixo", () => {
  const b = buildDirectorBriefing({
    source: "db",
    campaigns: [mkCampaign({ label: "Teste Interno", spend: 50, leads: 2, cpl: 25 })],
    creativeHealth: [{ campaignName: "Teste Interno", andromedaScore: 25, fatigueCount: 1, activeAds: 2 }],
  });
  esperar(b.mood === "atencao", `andromeda-gasto-baixo: mood deveria ser "atencao", veio "${b.mood}"`);
});

// 5. Decisões sempre ordenadas por urgência decrescente, misturando fontes.
caso("ordenacao", () => {
  const b = buildDirectorBriefing({
    source: "db",
    plan: mkPlan([
      { kind: "definir_meta", scope: "produto", target: "Gama", reason: "Sem meta.", priority: 3 },
      { kind: "escalar", scope: "produto", target: "Beta", reason: "CAC 400 na meta 500, 60% usado.", amount: 450, priority: 4 },
      { kind: "pausar", scope: "produto", target: "Alpha", reason: "CAC 900 acima da meta 500 e verba estourada (130%).", priority: 5 },
    ]),
    pendingApprovals: 2,
    creativeHealth: [{ campaignName: "Delta", andromedaScore: 70, fatigueCount: 1, activeAds: 4 }],
  });
  for (let i = 1; i < b.decisions.length; i += 1) {
    esperar(
      b.decisions[i - 1].urgency >= b.decisions[i].urgency,
      `ordenacao: decisão ${i} (${b.decisions[i].id}) com urgência maior que a anterior`,
    );
  }
  esperar(b.decisions.length >= 4, `ordenacao: esperava >= 4 decisões, vieram ${b.decisions.length}`);
});

// 6. Ids estáveis: mesma entrada => mesmos ids, sempre em slug.
caso("ids-estaveis", () => {
  const input: BriefingInput = {
    source: "db",
    plan: mkPlan([
      { kind: "pausar", scope: "produto", target: "Spin Mood", reason: "CAC estourado.", priority: 5 },
      { kind: "realocar", scope: "produto", target: "Órbita Prime", reason: "Mover verba.", amount: 300, to: "Órbita Prime", priority: 5 },
    ]),
    creativeHealth: [{ campaignName: "Spin Mood Leads", andromedaScore: 30, fatigueCount: 2, activeAds: 4 }],
  };
  const a = buildDirectorBriefing(input).decisions.map((d) => d.id);
  const b = buildDirectorBriefing(input).decisions.map((d) => d.id);
  esperar(JSON.stringify(a) === JSON.stringify(b), "ids-estaveis: mesma entrada gerou ids diferentes");
  esperar(a.every((id) => /^[a-z0-9-]+$/.test(id)), `ids-estaveis: id fora do formato slug — ${a.join(", ")}`);
  esperar(a.includes("realocar-orbita-prime"), "ids-estaveis: acento deveria virar slug (realocar-orbita-prime)");
});

// 7. source meta_live => nota explícita de que venda vem do CRM.
caso("meta-live-nota", () => {
  const b = buildDirectorBriefing({ source: "meta_live", totalsSpend: 1000, weekLeads: 100 });
  esperar(/CRM/.test(b.narrative), "meta-live-nota: narrativa deveria citar que a venda vem do CRM");
  esperar(b.kpis.some((k) => (k.hint ?? "").includes("CRM")), "meta-live-nota: KPI de CPL deveria trazer hint sobre o CRM");
  esperar(b.watching.some((w) => w.includes("CRM")), "meta-live-nota: watching deveria acompanhar a conciliação no CRM");
});

// 8. KPIs honestos: só entra o que veio (spend sem leads => sem CPL, sem leads).
caso("kpis-honestos", () => {
  const b = buildDirectorBriefing({ source: "db", totalsSpend: 2500 });
  esperar(b.kpis.some((k) => k.label.includes("Investimento")), "kpis-honestos: faltou o KPI de investimento");
  esperar(!b.kpis.some((k) => k.label.includes("Leads")), "kpis-honestos: KPI de leads não deveria existir sem dado");
  esperar(!b.kpis.some((k) => k.label.includes("CPL")), "kpis-honestos: KPI de CPL não deveria existir sem leads");
  esperar(!b.kpis.some((k) => k.label.includes("Campanhas")), "kpis-honestos: KPI de campanhas não deveria existir sem lista");
  esperar(!b.kpis.some((k) => k.label.includes("criativa")), "kpis-honestos: KPI de saúde criativa não deveria existir sem dado");
});

// 9. Aprovações paradas viram decisão com número concreto e sobem o humor para atenção.
caso("aprovacoes-pendentes", () => {
  const b = buildDirectorBriefing({ source: "db", pendingApprovals: 3 });
  esperar(b.mood === "atencao", `aprovacoes-pendentes: mood deveria ser "atencao", veio "${b.mood}"`);
  const d = b.decisions.find((x) => x.id === "aprovacoes-pendentes");
  esperar(d != null, "aprovacoes-pendentes: faltou a decisão da Caixa de Aprovações");
  esperar((d?.title ?? "").includes("3"), "aprovacoes-pendentes: o título deveria trazer o número 3");
});

// 10. CPL calculado e formatado em pt-BR (R$ 4,20), refletido na headline.
caso("cpl-calculado", () => {
  const b = buildDirectorBriefing({ source: "db", totalsSpend: 4200, weekLeads: 1000 });
  const cpl = b.kpis.find((k) => k.label === "CPL médio");
  esperar(cpl?.value === "R$ 4,20", `cpl-calculado: valor deveria ser "R$ 4,20", veio "${cpl?.value ?? "ausente"}"`);
  esperar(b.headline.includes("4,20"), "cpl-calculado: headline deveria citar o CPL da semana");
});

// 11. Move de escalar vira decisão com ação de aprovação e impacto em R$.
caso("escalar-vira-decisao", () => {
  const b = buildDirectorBriefing({
    source: "db",
    plan: mkPlan([{ kind: "escalar", scope: "produto", target: "Spin Mood", reason: "CAC 400 dentro da meta e verba com folga (60% usado).", amount: 450, priority: 4 }]),
  });
  const d = b.decisions.find((x) => x.id === "escalar-spin-mood");
  esperar(d != null, "escalar-vira-decisao: faltou a decisão de escalar com id estável");
  esperar((d?.suggestedAction ?? "").startsWith("Aprovar"), "escalar-vira-decisao: ação sugerida deveria começar com 'Aprovar'");
  esperar((d?.impact ?? "").includes("R$ 450,00"), "escalar-vira-decisao: impacto deveria trazer o valor em R$");
  esperar((d?.why ?? "").includes("400"), "escalar-vira-decisao: o porquê deveria manter o número concreto do motor");
});

// 12. Duas frentes urgentes => headline conta as decisões esperando o diretor.
caso("headline-duas-decisoes", () => {
  const b = buildDirectorBriefing({
    source: "db",
    budget: [mkBudget({ product: "Spin Mood", weeklyBudget: 1000, spent: 1300, pctUsed: 130, pacing: "estourou", verdict: "caro", cac: 900, targetCac: 500 })],
    pendingApprovals: 1,
  });
  esperar(b.headline.startsWith("2 decisões esperando você:"), `headline-duas-decisoes: headline inesperada — "${b.headline}"`);
});

// 13. Tudo eficiente => mood bom e headline de semana eficiente.
caso("semana-eficiente", () => {
  const b = buildDirectorBriefing({
    source: "db",
    totalsSpend: 4200,
    weekLeads: 1000,
    budget: [mkBudget({ product: "Spin Mood", weeklyBudget: 1000, spent: 700, remaining: 300, pctUsed: 70, pacing: "no_ritmo", verdict: "eficiente", cac: 400, targetCac: 500 })],
  });
  esperar(b.mood === "bom", `semana-eficiente: mood deveria ser "bom", veio "${b.mood}"`);
  esperar(b.headline.startsWith("Semana eficiente:"), `semana-eficiente: headline inesperada — "${b.headline}"`);
  esperar(b.headline.includes("nenhuma verba estourada"), "semana-eficiente: headline deveria confirmar verba sob controle");
});

// 14. Narrativa sempre entre 3 e 5 frases, do vazio ao cenário cheio.
caso("narrativa-tamanho", () => {
  const cenarios: BriefingInput[] = [
    { source: "db" },
    { source: "meta_live", totalsSpend: 1000, weekLeads: 50 },
    {
      source: "meta_live",
      totalsSpend: 5000,
      weekLeads: 200,
      budget: [mkBudget({ product: "Spin Mood", pacing: "estourou", verdict: "caro", spent: 1300, pctUsed: 130, cac: 900, targetCac: 500 })],
      plan: mkPlan([{ kind: "pausar", scope: "produto", target: "Spin Mood", reason: "CAC 900 acima da meta 500.", priority: 5 }]),
      creativeHealth: [{ campaignName: "Spin Mood Leads", andromedaScore: 35, fatigueCount: 2, activeAds: 4 }],
      pendingApprovals: 2,
    },
  ];
  for (const [i, cenario] of cenarios.entries()) {
    const n = contarFrases(buildDirectorBriefing(cenario).narrative);
    esperar(n >= 3 && n <= 5, `narrativa-tamanho: cenário ${i} gerou ${n} frases (esperado 3–5)`);
  }
});

// 15. Verba estourada já pausada pelo plano não vira decisão duplicada.
caso("sem-duplicata-estouro", () => {
  const b = buildDirectorBriefing({
    source: "db",
    budget: [mkBudget({ product: "Spin Mood", pacing: "estourou", verdict: "caro", spent: 1300, pctUsed: 130, cac: 900, targetCac: 500 })],
    plan: mkPlan([{ kind: "pausar", scope: "produto", target: "Spin Mood", reason: "CAC 900 acima da meta 500 e verba estourada (130%).", priority: 5 }]),
  });
  const sobreProduto = b.decisions.filter((d) => d.id.includes("spin-mood"));
  esperar(sobreProduto.length === 1, `sem-duplicata-estouro: esperava 1 decisão sobre o produto, vieram ${sobreProduto.length}`);
  esperar(sobreProduto[0]?.id === "pausar-spin-mood", "sem-duplicata-estouro: a decisão mantida deveria ser a pausa do plano");
});

// ---- veredito ----
if (failures.length > 0) {
  console.error(`Briefing executivo: falhou — ${failures.length} problema(s) em ${executados} casos\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`Briefing executivo: aprovado — ${executados} casos adversariais, 0 falhas.`);
