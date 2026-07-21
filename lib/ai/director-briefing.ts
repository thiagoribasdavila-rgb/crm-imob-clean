/**
 * Briefing executivo para a diretoria — a IA fala em DECISÕES, não em tabelas.
 *
 * Núcleo puro e determinístico: AGREGA o que os outros motores já concluíram
 * (plano de eficiência do marketing-strategist, verba do cost-report, saúde
 * criativa e aprovações pendentes) e traduz tudo em manchete, humor, KPIs,
 * decisões priorizadas e narrativa em tom executivo, sem jargão de API. Não
 * re-decide nada — decidir é papel do strategist/orchestrator; esta é a camada
 * de comunicação com quem aprova. Tudo é PROPOSTA: nenhuma ação executa sem
 * aprovação humana (governança "autônomo, sob supervisão").
 */

import type { BudgetLine, CostBucket } from "@/lib/marketing/cost-report";
import type { MarketingPlan } from "@/lib/ai/marketing-strategist";

export type BriefingInput = {
  source: "db" | "meta_live";
  totalsSpend?: number;
  campaigns?: CostBucket[];
  budget?: BudgetLine[];
  plan?: MarketingPlan;
  creativeHealth?: Array<{ campaignName: string; andromedaScore: number; fatigueCount: number; activeAds: number }>;
  pendingApprovals?: number;
  weekLeads?: number;
};

export type Decision = {
  id: string;
  title: string;
  why: string;
  impact: string;
  suggestedAction: string;
  urgency: 1 | 2 | 3 | 4 | 5;
};

export type DirectorBriefing = {
  headline: string;
  mood: "bom" | "atencao" | "critico";
  kpis: Array<{ label: string; value: string; hint?: string }>;
  decisions: Decision[];
  watching: string[];
  narrative: string;
};

/** Limiares do briefing — score criativo crítico e gasto que torna uma campanha relevante. */
export const BRIEFING_THRESHOLDS = {
  andromedaCritico: 40,
  gastoRelevanteSemanal: 300,
} as const;

type Move = MarketingPlan["moves"][number];
type Kpi = DirectorBriefing["kpis"][number];

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Formata reais no padrão pt-BR sem depender de Intl: "R$ 1.234,56". */
function brl(n: number): string {
  const neg = n < 0 ? "-" : "";
  const [inteiro, decimal] = Math.abs(n).toFixed(2).split(".");
  const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg}R$ ${agrupado},${decimal}`;
}

/** Slug estável (sem acento, minúsculo, hífens) para ids determinísticos. */
function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "sem-alvo";
}

function asUrgency(n: number): Decision["urgency"] {
  if (n >= 5) return 5;
  if (n >= 4) return 4;
  if (n >= 3) return 3;
  if (n >= 2) return 2;
  return 1;
}

function lowerFirst(text: string): string {
  return text.length ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

/** Gasto já registrado no orçamento do produto (para dimensionar impacto em R$). */
function spentOf(budget: BudgetLine[] | undefined, product: string): number | null {
  const line = budget?.find((l) => slugify(l.product) === slugify(product));
  return line ? line.spent : null;
}

/** Campanha tem gasto relevante? Sem dado de gasto, assume relevante (por precaução). */
function hasRelevantSpend(campaigns: CostBucket[] | undefined, name: string): boolean {
  if (!campaigns) return true;
  const found = campaigns.find((c) => slugify(c.label) === slugify(name));
  return (found?.spend ?? 0) >= BRIEFING_THRESHOLDS.gastoRelevanteSemanal;
}

/** Traduz um movimento do plano de eficiência em decisão executiva. "manter" não é decisão. */
function moveToDecision(move: Move, budget: BudgetLine[] | undefined): Decision | null {
  if (move.kind === "manter") return null;
  const id = slugify(`${move.kind}-${move.target}`);
  const amount = move.amount != null ? brl(move.amount) : null;
  const spent = spentOf(budget, move.target);
  switch (move.kind) {
    case "pausar":
      return {
        id,
        title: move.scope === "campanha" ? `Pausar a campanha ${move.target}` : `Pausar ${move.target}`,
        why: move.reason,
        impact: spent != null ? `Libera até ${brl(spent)}/semana de verba.` : "Corta gasto sem retorno enquanto a causa é diagnosticada.",
        suggestedAction: `Aprovar a pausa de ${move.target} e a revisão antes de retomar.`,
        urgency: asUrgency(move.priority),
      };
    case "realocar": {
      const destino = move.to ?? move.target;
      return {
        id,
        title: amount ? `Realocar ${amount}/semana para ${destino}` : `Realocar verba para ${destino}`,
        why: move.reason,
        impact: amount
          ? `${amount}/semana saem do que não rende e vão para ${destino}.`
          : `A verba liberada migra para ${destino}, que converte dentro da meta.`,
        suggestedAction: amount
          ? `Aprovar a realocação de ${amount}/semana para ${destino}.`
          : `Aprovar a realocação de verba para ${destino}.`,
        urgency: asUrgency(move.priority),
      };
    }
    case "escalar":
      return {
        id,
        title: amount ? `Escalar ${move.target} em ${amount}/semana` : `Escalar ${move.target}`,
        why: move.reason,
        impact: amount
          ? `+${amount}/semana no produto que já converte dentro da meta.`
          : "Mais leads no produto que já converte dentro da meta.",
        suggestedAction: amount
          ? `Aprovar o aumento de ${amount}/semana em ${move.target}.`
          : `Aprovar o aumento de verba em ${move.target}.`,
        urgency: asUrgency(move.priority),
      };
    case "revisar":
      return {
        id,
        title: `Revisar criativo e público de ${move.target}`,
        why: move.reason,
        impact: spent != null ? `Protege ${brl(spent)}/semana de virar desperdício.` : "Protege a verba semanal de virar desperdício.",
        suggestedAction: `Aprovar a revisão de criativo e público de ${move.target}.`,
        urgency: asUrgency(move.priority),
      };
    case "definir_meta":
      return {
        id,
        title: `Definir o custo-alvo por venda de ${move.target}`,
        why: move.reason,
        impact: "Sem meta de custo por venda, a verba do produto roda às cegas.",
        suggestedAction: `Definir o custo-alvo por venda de ${move.target} para liberar o veredito de eficiência.`,
        urgency: asUrgency(move.priority),
      };
  }
}

/** Verbas estouradas que o plano ainda não endereçou (dedup por produto). */
function budgetDecisions(budget: BudgetLine[] | undefined, taken: ReadonlySet<string>): Decision[] {
  const out: Decision[] = [];
  for (const l of budget ?? []) {
    if (l.pacing !== "estourou") continue;
    if (taken.has(slugify(l.product))) continue;
    const caro = l.verdict === "caro";
    out.push({
      id: slugify(`verba-estourou-${l.product}`),
      title: `Conter a verba de ${l.product}`,
      why: `Gasto de ${brl(l.spent)} contra ${brl(l.weeklyBudget)} planejados (${l.pctUsed}% usado)${
        caro && l.cac != null ? `, com custo por venda de ${brl(l.cac)} acima da meta` : ""
      }.`,
      impact: `Estouro de ${brl(Math.max(0, r2(l.spent - l.weeklyBudget)))} na semana.`,
      suggestedAction: caro
        ? `Aprovar a pausa ou o corte de verba de ${l.product}.`
        : `Aprovar um teto de verba para ${l.product} ou revisar o planejado.`,
      urgency: caro ? 5 : 4,
    });
  }
  return out;
}

/** Fadiga criativa: score baixo ou anúncios cansados viram decisão de troca de conceito. */
function creativeDecisions(input: BriefingInput): Decision[] {
  const out: Decision[] = [];
  for (const c of input.creativeHealth ?? []) {
    const critico = c.andromedaScore < BRIEFING_THRESHOLDS.andromedaCritico;
    if (!critico && c.fatigueCount <= 0) continue;
    const relevante = hasRelevantSpend(input.campaigns, c.campaignName);
    const metadeFatigada = c.fatigueCount >= Math.max(1, Math.ceil(c.activeAds / 2));
    const urgency: Decision["urgency"] = critico ? (relevante ? 5 : 4) : metadeFatigada ? 4 : 3;
    out.push({
      id: slugify(`criativo-fatigado-${c.campaignName}`),
      title: `Renovar os criativos de ${c.campaignName}`,
      why: `Saúde criativa em ${c.andromedaScore}/100 e ${c.fatigueCount} de ${c.activeAds} anúncios com sinal de fadiga.`,
      impact: "Criativo fatigado encarece cada lead — o custo por lead sobe até a troca de conceito.",
      suggestedAction: `Aprovar a troca por conceitos criativos novos em ${c.campaignName}.`,
      urgency,
    });
  }
  return out;
}

/** Junta todas as fontes de decisão, sem duplicar alvo, ordenado da mais urgente para a menos. */
function collectDecisions(input: BriefingInput): Decision[] {
  const out: Decision[] = [];
  const seen = new Set<string>();
  const taken = new Set<string>();
  const push = (d: Decision | null): void => {
    if (!d || seen.has(d.id)) return;
    seen.add(d.id);
    out.push(d);
  };

  for (const move of input.plan?.moves ?? []) {
    const d = moveToDecision(move, input.budget);
    if (d && (move.kind === "pausar" || move.kind === "revisar")) taken.add(slugify(move.target));
    push(d);
  }
  for (const d of budgetDecisions(input.budget, taken)) push(d);
  for (const d of creativeDecisions(input)) push(d);

  if (input.pendingApprovals != null && input.pendingApprovals > 0) {
    const n = input.pendingApprovals;
    push({
      id: "aprovacoes-pendentes",
      title: n === 1 ? "1 proposta parada na Caixa de Aprovações" : `${n} propostas paradas na Caixa de Aprovações`,
      why: `${n === 1 ? "Há 1 proposta aguardando" : `Há ${n} propostas aguardando`} decisão humana — nada executa sem o seu aval.`,
      impact: "Cada dia parado adia a economia e os leads já mapeados nas propostas.",
      suggestedAction: "Abrir a Caixa de Aprovações e decidir as propostas pendentes.",
      urgency: 4,
    });
  }

  // sort estável: empate de urgência preserva a ordem de origem (plano vem primeiro)
  return out.sort((a, b) => b.urgency - a.urgency);
}

/** Humor da semana: crítico > atenção > bom, sempre a partir de números concretos. */
function resolveMood(input: BriefingInput, decisions: Decision[]): DirectorBriefing["mood"] {
  const estouroCaro = (input.budget ?? []).some((l) => l.pacing === "estourou" && l.verdict === "caro");
  const criativoCritico = (input.creativeHealth ?? []).some(
    (c) => c.andromedaScore < BRIEFING_THRESHOLDS.andromedaCritico && hasRelevantSpend(input.campaigns, c.campaignName),
  );
  if (estouroCaro || criativoCritico) return "critico";
  if (decisions.some((d) => d.urgency >= 4)) return "atencao";
  return "bom";
}

type KpiBase = { kpis: Kpi[]; spendTotal: number | null; leadsTotal: number | null; cpl: number | null };

/** KPIs honestos: só entra o que veio no input (ou é derivável dele), nada é inventado. */
function buildKpis(input: BriefingInput): KpiBase {
  const metaLive = input.source === "meta_live";
  const spendTotal =
    input.totalsSpend != null ? r2(input.totalsSpend) : input.campaigns ? r2(input.campaigns.reduce((s, c) => s + c.spend, 0)) : null;
  const leadsTotal =
    input.weekLeads != null ? input.weekLeads : input.campaigns ? input.campaigns.reduce((s, c) => s + c.leads, 0) : null;
  const cpl = spendTotal != null && leadsTotal != null && leadsTotal > 0 ? r2(spendTotal / leadsTotal) : null;

  const kpis: Kpi[] = [];
  if (spendTotal != null) kpis.push({ label: "Investimento da semana", value: brl(spendTotal) });
  if (leadsTotal != null) kpis.push({ label: "Leads da semana", value: String(leadsTotal) });
  if (cpl != null) {
    kpis.push({
      label: "CPL médio",
      value: brl(cpl),
      ...(metaLive ? { hint: "Custo direto da mídia; a venda aparece só no CRM." } : {}),
    });
  }
  if (input.campaigns) {
    const top = input.campaigns.length ? input.campaigns.reduce((a, b) => (b.spend > a.spend ? b : a)) : null;
    kpis.push({
      label: "Campanhas ativas",
      value: String(input.campaigns.length),
      ...(top ? { hint: `Maior gasto: ${top.label}.` } : {}),
    });
  }
  if (input.creativeHealth && input.creativeHealth.length > 0) {
    const media = Math.round(input.creativeHealth.reduce((s, c) => s + c.andromedaScore, 0) / input.creativeHealth.length);
    const fatigados = input.creativeHealth.reduce((s, c) => s + c.fatigueCount, 0);
    kpis.push({
      label: "Saúde criativa média",
      value: `${media}/100`,
      hint: fatigados > 0 ? `${fatigados} anúncio${fatigados === 1 ? "" : "s"} com fadiga.` : "Sem fadiga relevante.",
    });
  }
  return { kpis, spendTotal, leadsTotal, cpl };
}

/** A frase que o diretor lê primeiro: decisões pendentes ou o veredito da semana. */
function buildHeadline(input: BriefingInput, decisions: Decision[], base: KpiBase): string {
  const altas = decisions.filter((d) => d.urgency >= 4);
  if (altas.length > 0) {
    const partes = altas.slice(0, 2).map((d) => lowerFirst(d.title));
    const rotulo = altas.length === 1 ? "decisão esperando" : "decisões esperando";
    return `${altas.length} ${rotulo} você: ${partes.join(" e ")}.`;
  }
  if (decisions.length > 0) {
    return `Semana sob controle: ${decisions.length} ajuste${decisions.length === 1 ? "" : "s"} leve${decisions.length === 1 ? "" : "s"} sugerido${decisions.length === 1 ? "" : "s"}, nada urgente.`;
  }
  if (base.cpl != null) {
    const semEstouro = (input.budget ?? []).every((l) => l.pacing !== "estourou");
    return input.budget && input.budget.length > 0 && semEstouro
      ? `Semana eficiente: CPL médio ${brl(base.cpl)} e nenhuma verba estourada.`
      : `Semana em ordem: CPL médio ${brl(base.cpl)} e nenhuma decisão esperando você.`;
  }
  if (base.spendTotal != null) {
    return `Semana em ordem: ${brl(base.spendTotal)} investidos e nenhuma decisão esperando você.`;
  }
  return "Sem dados de mídia nesta semana — nenhuma decisão esperando você.";
}

/** 3–5 frases corridas, fechando com o que a IA faz sozinha vs. o que espera aprovação. */
function buildNarrative(input: BriefingInput, decisions: Decision[], base: KpiBase): string {
  const frases: string[] = [];

  if (base.spendTotal != null && base.leadsTotal != null) {
    frases.push(
      `A semana consumiu ${brl(base.spendTotal)} e trouxe ${base.leadsTotal} lead${base.leadsTotal === 1 ? "" : "s"}${
        base.cpl != null ? `, um custo por lead de ${brl(base.cpl)}` : ""
      }.`,
    );
  } else if (base.spendTotal != null) {
    frases.push(`A semana consumiu ${brl(base.spendTotal)}; sem a contagem de leads, não calculo o custo por lead.`);
  } else if (base.leadsTotal != null) {
    frases.push(`Chegaram ${base.leadsTotal} leads, mas sem o gasto da semana não calculo o custo por lead.`);
  } else {
    frases.push("Não recebi dados de investimento nem de leads nesta semana, então estou sem leitura de mídia para fazer.");
  }

  const opcionais: string[] = [];
  const resumo = input.plan?.summary;
  if (resumo) {
    opcionais.push(
      `O plano de eficiência aponta ${resumo.produtosEficientes} produto${resumo.produtosEficientes === 1 ? "" : "s"} eficiente${resumo.produtosEficientes === 1 ? "" : "s"}, ${resumo.produtosCaros} acima da meta e ${brl(resumo.desperdicioSemanal)} de desperdício semanal em risco.`,
    );
  } else if (input.budget && input.budget.length > 0) {
    const estourados = input.budget.filter((l) => l.pacing === "estourou").length;
    opcionais.push(
      estourados > 0
        ? `Da verba planejada, ${estourados} produto${estourados === 1 ? " estourou" : "s estouraram"} o teto nesta semana.`
        : "Da verba planejada, nenhum produto estourou o teto nesta semana.",
    );
  }
  if (input.creativeHealth && input.creativeHealth.length > 0) {
    const media = Math.round(input.creativeHealth.reduce((s, c) => s + c.andromedaScore, 0) / input.creativeHealth.length);
    const fatigados = input.creativeHealth.reduce((s, c) => s + c.fatigueCount, 0);
    opcionais.push(
      fatigados > 0
        ? `Na frente criativa, a saúde média está em ${media}/100 e ${fatigados} anúncio${fatigados === 1 ? " pede" : "s pedem"} troca de conceito.`
        : `Na frente criativa, a saúde média está em ${media}/100, sem fadiga relevante.`,
    );
  }
  if (input.source === "meta_live") {
    opcionais.push("Os números vêm direto da plataforma de anúncios; como a venda só existe no CRM, avalio as campanhas por custo por lead, não por venda.");
  }
  frases.push(...opcionais.slice(0, 3));
  if (opcionais.length === 0) frases.push("Nenhum motor acusou anomalia que precise da sua decisão.");

  frases.push(
    decisions.length > 0
      ? `Sozinho, sigo apenas monitorando e medindo — ${decisions.length === 1 ? "a decisão acima só executa" : `as ${decisions.length} decisões acima só executam`} com a sua aprovação.`
      : "Sozinho, sigo apenas monitorando e medindo; qualquer pausa, realocação ou escala de verba chegará como proposta para a sua aprovação.",
  );
  return frases.join(" ");
}

/** O que a IA acompanha sozinha, sem precisar de decisão da diretoria. */
function buildWatching(input: BriefingInput): string[] {
  const watching: string[] = [];
  for (const l of input.budget ?? []) {
    if (l.pacing === "estourando") watching.push(`Verba de ${l.product} a ${l.pctUsed}% do teto — perto do limite.`);
  }
  for (const m of input.plan?.moves ?? []) {
    if (m.kind === "manter") watching.push(`${m.target} rodando dentro do esperado — sem ação necessária.`);
  }
  for (const c of input.creativeHealth ?? []) {
    if (c.andromedaScore >= BRIEFING_THRESHOLDS.andromedaCritico && c.fatigueCount === 0) {
      watching.push(`Saúde criativa de ${c.campaignName} (hoje ${c.andromedaScore}/100) e a frequência dos anúncios.`);
    }
  }
  if (input.source === "meta_live") {
    watching.push("Conciliação das vendas no CRM para fechar o custo real por venda das campanhas.");
  }
  if (watching.length === 0) watching.push("Chegada de novos dados de mídia e leads para reabrir a leitura da semana.");
  return watching.slice(0, 6);
}

/** Monta o briefing executivo completo a partir do que os outros motores já produziram. */
export function buildDirectorBriefing(
  input: BriefingInput,
  /** Limiares calibráveis (lib/ai/calibration → briefing): teto de decisões
   *  por briefing (anti-ruído). Headline/narrativa citam o total real. */
  opts: { maxDecisions?: number } = {},
): DirectorBriefing {
  const all = collectDecisions(input);
  const maxDecisions = Math.max(1, opts.maxDecisions ?? 6);
  const decisions = all.slice(0, maxDecisions);
  const mood = resolveMood(input, all);
  const base = buildKpis(input);
  return {
    headline: buildHeadline(input, all, base),
    mood,
    kpis: base.kpis,
    decisions,
    watching: buildWatching(input),
    narrative: buildNarrative(input, all, base),
  };
}
