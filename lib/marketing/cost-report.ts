/**
 * Relatório de custo de marketing — custo semanal por campanha, projeto
 * (empreendimento/produto) e incorporador, + a alocação de verba por produto.
 *
 * Núcleo puro e testável: agrega gasto/leads/vendas por dimensão, calcula CPL e
 * CAC, e cruza a verba planejada por produto com o gasto real (pacing +
 * veredito de eficiência). É o cérebro determinístico da IA de marketing —
 * a narração via LLM é opcional e vem por cima.
 */

export type SpendRow = {
  campaignId: string;
  campaignName?: string | null;
  product?: string | null;   // empreendimento / produto (ex.: "Spin Mood")
  developer?: string | null; // incorporador (ex.: "SPIN")
  weekIso?: string | null;   // "2026-W29"; se ausente, deriva de `date`
  date?: string | null;
  /**
   * Leads que a campanha GEROU na origem (Meta Insights / leads_count do
   * formulário). `undefined`/`null` significa "não perguntei" — e nunca pode
   * ser preenchido com zero por conveniência: zero aqui diz que a campanha não
   * gerou lead nenhuma, que é uma afirmação e não uma ausência.
   */
  leadsNaOrigem?: number | null;
  spend: number;
  leads?: number;
  sales?: number;
};

export type Dimension = "campaign" | "product" | "developer";

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Semana ISO-8601: "YYYY-Www". Retorna "sem-data" se não parsear. */
export function isoWeek(dateStr?: string | null): string {
  if (!dateStr) return "sem-data";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return "sem-data";
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((t.getTime() - firstThu.getTime()) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function weekOf(row: SpendRow): string {
  return row.weekIso || isoWeek(row.date);
}
function keyOf(row: SpendRow, dim: Dimension): { key: string; label: string } {
  if (dim === "campaign") return { key: row.campaignId, label: row.campaignName || row.campaignId };
  if (dim === "product") return { key: (row.product || "sem-produto").toLowerCase(), label: row.product || "Sem produto" };
  return { key: (row.developer || "sem-incorporador").toLowerCase(), label: row.developer || "Sem incorporador" };
}

export type CostBucket = {
  key: string; label: string;
  spend: number; leads: number; sales: number;
  cpl: number | null; cac: number | null; share: number;
  /** Leads que a campanha GEROU na origem (Meta). `null` = não perguntei. */
  leadsNaOrigem: number | null;
  /** Geradas menos chegadas. Nunca negativo. `null` quando a origem é desconhecida. */
  leadsNaoEntraram: number | null;
  /** CPL dividido pelas que CHEGARAM — o número antigo, mantido para comparação. */
  cplSobreEntradas: number | null;
  /** `false` quando há lead fora do CRM, ou quando não se sabe quantas a campanha gerou. */
  cplConfiavel: boolean;
};

/** Agrega gasto/leads/vendas por dimensão, com CPL, CAC e participação (%). */
export function aggregate(rows: SpendRow[], dim: Dimension): CostBucket[] {
  const map = new Map<string, CostBucket>();
  let total = 0;
  for (const row of rows) {
    const { key, label } = keyOf(row, dim);
    const b = map.get(key) ?? { key, label, spend: 0, leads: 0, sales: 0, cpl: null, cac: null, share: 0, leadsNaOrigem: null, leadsNaoEntraram: null, cplSobreEntradas: null, cplConfiavel: false };
    b.spend += num(row.spend);
    b.leads += num(row.leads);
    b.sales += num(row.sales);
    // `null` é "não perguntei à Meta" e NUNCA vira zero por soma: só passa a
    // número quando ao menos uma linha do balde declarou a origem.
    if (row.leadsNaOrigem != null) b.leadsNaOrigem = num(b.leadsNaOrigem) + num(row.leadsNaOrigem);
    map.set(key, b);
    total += num(row.spend);
  }
  // ── CPL/CAC EXIGEM GASTO MEDIDO ──────────────────────────────────────────
  //
  // `spend / leads` com gasto ZERO devolve 0, e "CPL R$ 0,00" na tela do
  // diretor lê-se como "esse produto traz lead de graça". A verdade é o oposto:
  // o gasto daquela linha não foi amarrado a ela. É a mesma classe de defeito
  // que o zero de leads não atribuídos — ausência de medição desenhada como
  // número.
  //
  // O caso não é hipotético: a campanha que trouxe as 24 leads desta conta não
  // pertence à conta de anúncios que o CRM importa (gasto 0), e agrupar por
  // produto/incorporadora — que é o que esta correção passou a fazer — coloca
  // leads sem gasto em bucket próprio.
  //
  // Dividir por esse zero também vazava para fora: `decision-simulator`
  // projeta `verba ÷ cpl`, e `cpl = 0` daria leads infinitos (a rota de
  // propostas já se defendia sozinha com `cpl <= 0`, prova de que o zero já
  // incomodava). Com null, todo mundo lê "não sei" — que é o fato.
  // ── E O DENOMINADOR EXIGE AS LEADS QUE A CAMPANHA GEROU ─────────────────
  //
  // O irmão da regra acima, e custou 50 VEZES. Medido em 03/08/2026: sete
  // campanhas "[Cia360] Inside Smart" somam R$ 4.122,19 e o CRM tinha 4 leads
  // ligadas a elas — CPL de R$ 1.030. As mesmas campanhas geraram 202 leads na
  // Meta; 198 seguem represadas porque a Página só foi conectada hoje. O custo
  // real é da ordem de R$ 20.
  //
  // A conta estava certa. O denominador contava quem CHEGOU e chamava isso de
  // quem foi GERADO. E o número inflado não some quando alguém recuperar a
  // represa — some quando alguém consertar a divisão.
  const out = [...map.values()].map((b) => {
    const geradas = b.leadsNaOrigem;
    // A Meta esquece lead depois de 90 dias de retenção: origem MENOR que o CRM
    // é normal em base antiga, e aí quem manda é o CRM.
    const naoEntraram = geradas == null ? null : Math.max(0, geradas - b.leads);
    const denominador = geradas != null && geradas > b.leads ? geradas : b.leads;
    return {
      ...b,
      spend: r2(b.spend),
      leadsNaoEntraram: naoEntraram,
      cpl: denominador > 0 && b.spend > 0 ? r2(b.spend / denominador) : null,
      cplSobreEntradas: b.leads > 0 && b.spend > 0 ? r2(b.spend / b.leads) : null,
      // Só é confiável quando SEI quantas a campanha gerou E todas chegaram.
      // Sem perguntar à Meta, o número existe mas ninguém pode apresentá-lo
      // como fato — foi assim que R$ 1.030 virou verdade por semanas.
      cplConfiavel: geradas != null && naoEntraram === 0,
      cac: b.sales > 0 && b.spend > 0 ? r2(b.spend / b.sales) : null,
      share: total > 0 ? r2((b.spend / total) * 100) : 0,
    };
  });
  return out.sort((a, b) => b.spend - a.spend);
}

export type WeeklySeries = {
  weeks: string[];
  series: Array<{ key: string; label: string; byWeek: Record<string, number>; total: number }>;
};

/** Custo SEMANAL por dimensão — matriz (linha = campanha/produto/incorp., coluna = semana). */
export function weekly(rows: SpendRow[], dim: Dimension): WeeklySeries {
  const weeks = new Set<string>();
  const map = new Map<string, { key: string; label: string; byWeek: Record<string, number>; total: number }>();
  for (const row of rows) {
    const wk = weekOf(row);
    weeks.add(wk);
    const { key, label } = keyOf(row, dim);
    const s = map.get(key) ?? { key, label, byWeek: {}, total: 0 };
    s.byWeek[wk] = r2((s.byWeek[wk] ?? 0) + num(row.spend));
    s.total = r2(s.total + num(row.spend));
    map.set(key, s);
  }
  return {
    weeks: [...weeks].sort(),
    series: [...map.values()].sort((a, b) => b.total - a.total),
  };
}

export type ProductBudget = { product: string; developer?: string | null; weeklyBudget: number; targetCac?: number | null };

export type BudgetLine = {
  product: string; developer: string | null;
  weeklyBudget: number; spent: number; remaining: number; pctUsed: number;
  cac: number | null; targetCac: number | null;
  pacing: "abaixo" | "no_ritmo" | "estourando" | "estourou";
  verdict: "eficiente" | "caro" | "sem_dados";
  recommendation: string;
};

/** Cruza a verba planejada por produto com o gasto real: pacing + eficiência. */
export function budgetView(budgets: ProductBudget[], rows: SpendRow[]): BudgetLine[] {
  const byProduct = aggregate(rows, "product");
  const find = (p: string) => byProduct.find((b) => b.key === p.toLowerCase());
  return budgets.map((bg) => {
    const actual = find(bg.product);
    const spent = actual ? actual.spend : 0;
    const weeklyBudget = r2(num(bg.weeklyBudget));
    const pctUsed = weeklyBudget > 0 ? r2((spent / weeklyBudget) * 100) : 0;
    const cac = actual?.cac ?? null;
    const targetCac = bg.targetCac != null ? r2(num(bg.targetCac)) : null;

    const pacing: BudgetLine["pacing"] =
      pctUsed > 100 ? "estourou" : pctUsed >= 90 ? "estourando" : pctUsed >= 60 ? "no_ritmo" : "abaixo";

    let verdict: BudgetLine["verdict"] = "sem_dados";
    if (cac != null && targetCac != null) verdict = cac <= targetCac ? "eficiente" : "caro";

    let recommendation = "Sem gasto registrado nesta semana — ative ou aguarde dados.";
    if (actual) {
      if (verdict === "eficiente" && pacing === "abaixo") recommendation = "Eficiente e com folga de verba — escalar orçamento.";
      else if (verdict === "eficiente") recommendation = "CAC dentro da meta — manter e monitorar.";
      else if (verdict === "caro" && pacing === "estourou") recommendation = "CAC acima da meta e verba estourada — pausar ou revisar criativo/público.";
      else if (verdict === "caro") recommendation = "CAC acima da meta — revisar criativo/público antes de escalar.";
      else if (pacing === "estourou") recommendation = "Verba estourada — sem CAC-alvo definido, defina a meta para avaliar.";
      else recommendation = "Rodando — colete mais dados para o veredito de eficiência.";
    }

    return {
      product: bg.product, developer: bg.developer ?? actual?.label ?? null,
      weeklyBudget, spent, remaining: r2(weeklyBudget - spent), pctUsed,
      cac, targetCac, pacing, verdict, recommendation,
    };
  }).sort((a, b) => b.spent - a.spent);
}
