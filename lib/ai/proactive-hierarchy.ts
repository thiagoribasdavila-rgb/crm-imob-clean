/**
 * Inteligência proativa por HIERARQUIA — o motor que gera "próximas ações"
 * PARA CADA papel da operação, cada um pensado de forma diferente.
 *
 * Núcleo puro e determinístico: NÃO busca rede, NÃO usa relógio nem aleatório —
 * mesma entrada, mesma saída. Recebe sinais já apurados por outros motores
 * (plano de eficiência do marketing-strategist, saúde criativa pós-Andromeda,
 * SLA de times, carteira do corretor, anomalias preditivas do forecast) e
 * traduz cada um em um NUDGE ("cutucão" proativo) endereçado ao papel certo.
 *
 * Diferença para o director-briefing: o briefing é a COMUNICAÇÃO executiva do
 * diretor (manchete, humor, decisões). Aqui o objetivo é outro — dizer, para
 * QUALQUER papel, qual é a próxima ação proativa que faz sentido para ELE:
 *   - diretor: decisões de verba, aprovações paradas, anomalia preditiva;
 *   - superintendente: eficiência de marketing + SLA dos times;
 *   - gestor: SLA do SEU time + saúde criativa;
 *   - corretor: a próxima ação da carteira (lead quente, tarefa vencida) —
 *     SÓ o que é dele; um corretor JAMAIS recebe nudge de verba/aprovação.
 *
 * Tudo é sugestão sob supervisão humana: um nudge nunca executa nada.
 */

import type { MarketingPlan } from "./marketing-strategist";

export type Role = "director" | "superintendent" | "manager" | "broker";

export type Nudge = {
  role: Role;
  emoji: string;
  title: string;
  detail: string;
  action: string;
  urgency: 1 | 2 | 3 | 4 | 5;
  scope: "marketing" | "comercial" | "time" | "carteira";
};

/** Sinais de entrada — todos opcionais; cada papel só lê o que lhe interessa. */
export type ProactiveInput = {
  /** Plano de eficiência do marketing-strategist (só o resumo é lido aqui). */
  plan?: Pick<MarketingPlan, "summary">;
  /** Saúde criativa por campanha (pós-Andromeda). */
  creativeHealth?: Array<{ campaignName: string; andromedaScore: number; fatigueCount: number }>;
  /** Propostas paradas na Caixa de Aprovações. */
  pendingApprovals?: number;
  /** Atendimentos/leads que estouraram o SLA nos times. */
  teamSlaBreaches?: number;
  /** Tarefas vencidas na carteira do corretor. */
  brokerOverdueTasks?: number;
  /** Leads quentes aguardando ação na carteira do corretor. */
  brokerHotLeads?: number;
  /** Sinais preditivos do forecast (anomalias já detectadas por outro motor). */
  forecast?: { anomalies?: string[] };
};

/** Score criativo abaixo disto = crítico (mesmo limiar do briefing executivo). */
const ANDROMEDA_CRITICO = 40;

const clampUrgency = (n: number): Nudge["urgency"] => {
  if (n >= 5) return 5;
  if (n <= 1) return 1;
  return n as Nudge["urgency"];
};

/** Reais no padrão pt-BR sem depender de Intl: "R$ 1.234,56". */
function brl(n: number): string {
  const neg = n < 0 ? "-" : "";
  const [inteiro, decimal] = Math.abs(n).toFixed(2).split(".");
  const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg}R$ ${agrupado},${decimal}`;
}

/** Urgência do SLA: quanto mais estouros, mais alto (1 → 3, 2-3 → 4, 4+ → 5). */
function slaUrgency(breaches: number): Nudge["urgency"] {
  if (breaches >= 4) return 5;
  if (breaches >= 2) return 4;
  return 3;
}

/** Pior campanha por saúde criativa (menor score primeiro; desempate por fadiga). */
function worstCreative(
  health: ProactiveInput["creativeHealth"],
): { campaignName: string; andromedaScore: number; fatigueCount: number } | null {
  if (!health || health.length === 0) return null;
  return [...health].sort(
    (a, b) => a.andromedaScore - b.andromedaScore || b.fatigueCount - a.fatigueCount,
  )[0];
}

/** Nudge calmo padrão do papel — usado quando não há nenhum sinal para ele. */
function calmNudge(role: Role): Nudge {
  const scope: Nudge["scope"] =
    role === "director" ? "comercial" : role === "superintendent" ? "marketing" : role === "manager" ? "time" : "carteira";
  const detail =
    role === "broker"
      ? "Nenhum lead quente nem tarefa vencida na sua carteira agora."
      : role === "manager"
        ? "Time dentro do SLA e criativos saudáveis — nada pedindo sua ação."
        : role === "superintendent"
          ? "Marketing eficiente e times dentro do SLA — nada pedindo sua ação."
          : "Sem aprovações paradas, verba sob controle e nenhuma anomalia — nada pedindo sua decisão.";
  return { role, emoji: "✅", title: "Tudo em dia", detail, action: "Seguir monitorando — os motores avisam quando algo mudar.", urgency: 1, scope };
}

// ---- geradores por papel (cada um enxerga SÓ o seu mundo) ----

function directorNudges(input: ProactiveInput): Nudge[] {
  const out: Nudge[] = [];

  // Anomalia PREDITIVA vira decisão do diretor (o forecast já detectou; ele decide).
  const anomalies = input.forecast?.anomalies ?? [];
  if (anomalies.length > 0) {
    const primeira = anomalies[0];
    out.push({
      role: "director",
      emoji: "📉",
      title: anomalies.length === 1 ? "Anomalia preditiva detectada" : `${anomalies.length} anomalias preditivas detectadas`,
      detail: `O forecast acusou: ${anomalies.slice(0, 2).join("; ")}${anomalies.length > 2 ? "…" : ""}.`,
      action: `Investigar a causa${primeira ? ` de "${primeira}"` : ""} antes que vire tendência.`,
      urgency: 5,
      scope: "comercial",
    });
  }

  // Aprovações paradas — nada executa sem o aval humano.
  const pend = input.pendingApprovals ?? 0;
  if (pend > 0) {
    out.push({
      role: "director",
      emoji: "✋",
      title: pend === 1 ? "1 proposta parada na Caixa de Aprovações" : `${pend} propostas paradas na Caixa de Aprovações`,
      detail: `${pend === 1 ? "Há 1 proposta aguardando" : `Há ${pend} propostas aguardando`} sua decisão — nada executa sem o seu aval.`,
      action: "Abrir a Caixa de Aprovações e decidir as pendências.",
      urgency: clampUrgency(pend >= 3 ? 5 : 4),
      scope: "comercial",
    });
  }

  // Verba: desperdício semanal e produtos caros no plano de eficiência.
  const resumo = input.plan?.summary;
  if (resumo && (resumo.desperdicioSemanal > 0 || resumo.produtosCaros > 0)) {
    const caros = resumo.produtosCaros;
    out.push({
      role: "director",
      emoji: "💰",
      title: caros > 0 ? "Verba escorrendo em produtos caros" : "Desperdício de verba mapeado",
      detail:
        `${brl(resumo.desperdicioSemanal)}/semana em risco de desperdício` +
        (caros > 0 ? `, com ${caros} produto${caros === 1 ? "" : "s"} acima da meta de custo` : "") +
        (resumo.economiaPotencial > 0 ? `. Pausas liberam até ${brl(resumo.economiaPotencial)}/semana para realocar.` : "."),
      action: "Revisar as propostas de pausa/realocação de verba e aprovar as que fazem sentido.",
      urgency: clampUrgency(caros > 0 ? 4 : 3),
      scope: "marketing",
    });
  }

  return out;
}

function superintendentNudges(input: ProactiveInput): Nudge[] {
  const out: Nudge[] = [];

  // Eficiência de marketing — a saúde criativa pior primeiro.
  const pior = worstCreative(input.creativeHealth);
  if (pior && (pior.andromedaScore < ANDROMEDA_CRITICO || pior.fatigueCount > 0)) {
    const critico = pior.andromedaScore < ANDROMEDA_CRITICO;
    out.push({
      role: "superintendent",
      emoji: "📉",
      title: critico ? `Eficiência de marketing em queda em ${pior.campaignName}` : `Sinal de fadiga em ${pior.campaignName}`,
      detail: `Saúde criativa em ${pior.andromedaScore}/100 e ${pior.fatigueCount} anúncio${pior.fatigueCount === 1 ? "" : "s"} com fadiga — o custo por lead sobe até a troca de conceito.`,
      action: `Cobrar do gestor a renovação de conceitos criativos em ${pior.campaignName}.`,
      urgency: clampUrgency(critico ? 4 : 3),
      scope: "marketing",
    });
  }

  // SLA dos times (visão agregada de superintendência).
  const sla = input.teamSlaBreaches ?? 0;
  if (sla > 0) {
    out.push({
      role: "superintendent",
      emoji: "⏰",
      title: sla === 1 ? "1 atendimento estourou o SLA nos times" : `${sla} atendimentos estouraram o SLA nos times`,
      detail: `${sla} lead${sla === 1 ? "" : "s"} passaram do tempo de resposta acordado — cada minuto parado esfria a oportunidade.`,
      action: "Acionar os gestores dos times com estouro para redistribuir a fila.",
      urgency: slaUrgency(sla),
      scope: "time",
    });
  }

  return out;
}

function managerNudges(input: ProactiveInput): Nudge[] {
  const out: Nudge[] = [];

  // SLA do SEU time.
  const sla = input.teamSlaBreaches ?? 0;
  if (sla > 0) {
    out.push({
      role: "manager",
      emoji: "⏰",
      title: sla === 1 ? "1 lead do seu time fora do SLA" : `${sla} leads do seu time fora do SLA`,
      detail: `${sla} atendimento${sla === 1 ? "" : "s"} passaram do tempo de resposta — redistribua antes que esfriem.`,
      action: "Reatribuir os leads em atraso para corretores livres.",
      urgency: slaUrgency(sla),
      scope: "time",
    });
  }

  // Saúde criativa (o gestor toca a renovação no dia a dia).
  const pior = worstCreative(input.creativeHealth);
  if (pior && (pior.andromedaScore < ANDROMEDA_CRITICO || pior.fatigueCount > 0)) {
    const critico = pior.andromedaScore < ANDROMEDA_CRITICO;
    out.push({
      role: "manager",
      emoji: "📉",
      title: `Criativos de ${pior.campaignName} pedindo renovação`,
      detail: `Saúde criativa em ${pior.andromedaScore}/100 e ${pior.fatigueCount} anúncio${pior.fatigueCount === 1 ? "" : "s"} com fadiga.`,
      action: `Preparar novos conceitos criativos para ${pior.campaignName}.`,
      urgency: clampUrgency(critico ? 4 : 3),
      scope: "marketing",
    });
  }

  return out;
}

function brokerNudges(input: ProactiveInput): Nudge[] {
  const out: Nudge[] = [];

  // Leads quentes — a próxima ação de maior retorno da carteira.
  const hot = input.brokerHotLeads ?? 0;
  if (hot > 0) {
    out.push({
      role: "broker",
      emoji: "🔥",
      title: hot === 1 ? "1 lead quente esperando você" : `${hot} leads quentes esperando você`,
      detail: `${hot} lead${hot === 1 ? " está" : "s estão"} com alta chance de conversão agora — falar cedo é o que fecha.`,
      action: hot === 1 ? "Chamar o lead quente antes que esfrie." : "Chamar os leads quentes por ordem de temperatura.",
      urgency: clampUrgency(hot >= 3 ? 5 : 4),
      scope: "carteira",
    });
  }

  // Tarefas vencidas — o que já passou do prazo na carteira dele.
  const overdue = input.brokerOverdueTasks ?? 0;
  if (overdue > 0) {
    out.push({
      role: "broker",
      emoji: "⏰",
      title: overdue === 1 ? "1 tarefa vencida na sua carteira" : `${overdue} tarefas vencidas na sua carteira`,
      detail: `${overdue} tarefa${overdue === 1 ? " passou" : "s passaram"} do prazo — follow-ups atrasados derrubam a conversão.`,
      action: "Colocar as tarefas vencidas em dia, das mais antigas para as mais novas.",
      urgency: clampUrgency(overdue >= 5 ? 5 : 4),
      scope: "carteira",
    });
  }

  return out;
}

/**
 * Gera os nudges proativos de UM papel, ordenados da maior urgência para a
 * menor (empate preserva a ordem de geração). Papel sem nenhum sinal recebe um
 * único nudge calmo ("tudo em dia"). Corretor só vê a própria carteira — nunca
 * verba, aprovações ou anomalia preditiva.
 */
export function proactiveNudges(role: Role, input: ProactiveInput): Nudge[] {
  let nudges: Nudge[];
  switch (role) {
    case "director":
      nudges = directorNudges(input);
      break;
    case "superintendent":
      nudges = superintendentNudges(input);
      break;
    case "manager":
      nudges = managerNudges(input);
      break;
    case "broker":
      nudges = brokerNudges(input);
      break;
  }
  if (nudges.length === 0) return [calmNudge(role)];
  // sort estável: empate de urgência preserva a ordem de origem
  return nudges.sort((a, b) => b.urgency - a.urgency);
}

/** Resumo de 1 linha, em tom amigável pt-BR, para o topo do painel do papel. */
export function nudgeDigest(nudges: Nudge[]): string {
  if (nudges.length === 0) return "Tudo em dia — nada pedindo sua atenção agora.";
  const calmoUnico = nudges.length === 1 && nudges[0]?.emoji === "✅";
  if (calmoUnico) return "Tudo em dia — nada pedindo sua atenção agora.";

  const top = nudges[0];
  const urgentes = nudges.filter((n) => n.urgency >= 4).length;
  const total = nudges.length;
  const plural = total === 1 ? "ação proativa" : "ações proativas";
  if (urgentes > 0) {
    const rotulo = urgentes === 1 ? "1 urgente" : `${urgentes} urgentes`;
    return `${total} ${plural}, ${rotulo}: comece por ${lowerFirst(top?.title ?? "")}.`;
  }
  return `${total} ${plural}, nada urgente: quando puder, ${lowerFirst(top?.title ?? "")}.`;
}

function lowerFirst(text: string): string {
  return text.length ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}
