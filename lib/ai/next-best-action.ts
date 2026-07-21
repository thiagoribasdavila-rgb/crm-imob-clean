/**
 * NEXT-BEST-ACTION por corretor — a PLAYLIST priorizada da carteira.
 *
 * Hoje o preditor (conversion-predictor) devolve PROBABILIDADE + fatores por
 * lead, e o motor de propostas (action-proposals) prepara ações ISOLADAS. Falta
 * o que COMPÕE tudo numa sequência: "de todos os leads da minha carteira, qual
 * eu toco AGORA, com qual ação, e por quê". Este núcleo faz exatamente isso.
 *
 * Núcleo puro e determinístico: NÃO busca rede, NÃO usa relógio nem aleatório —
 * mesma entrada, mesma saída. Recebe sinais JÁ apurados por lead (a rota junta
 * probabilidade + valor do imóvel + estado do funil) e devolve a lista ordenada
 * de próximas ações. Nada aqui executa nada — é priorização sob supervisão
 * humana. Invariante preservada: dado ausente NÃO vira número inventado
 * (valor do imóvel desconhecido → expectedValue null, nunca um chute).
 */

/** O que a rota junta por lead da carteira (tudo já apurado, nada de rede aqui). */
export type LeadSignal = {
  leadId: string;
  name?: string;
  /** Probabilidade de conversão 0–100 (do predictConversionDetailed). */
  probability: number;
  /** Fatores explicáveis (o dominante alimenta o "porquê"). */
  factors: string[];
  /** Valor do imóvel em R$ (quando conhecido; ausente = potencial não calculável). */
  propertyValue?: number;
  /** Estágio do funil (novo/contato/qualificacao/visita/proposta/contrato). */
  stage?: string;
  /** Tarefas vencidas do lead (quando a carteira informar). */
  overdueTaskCount?: number;
  /** Dias desde o último contato (quando conhecido). */
  lastContactDays?: number;
};

export type NextBestActionKind =
  | "ligar_agora"
  | "enviar_proposta"
  | "remarcar_visita"
  | "reengajar"
  | "nutrir";

export type NextBestAction = {
  leadId: string;
  name: string;
  action: NextBestActionKind;
  /** Posição na playlist (1 = toque primeiro). */
  priority: number;
  /** score = probabilidade × valor do imóvel (quente + caro vem primeiro). */
  score: number;
  /** Porquê legível, citando o fator dominante. */
  why: string;
  emoji: string;
  /** Potencial em R$ = probabilidade × valor; null quando o valor é desconhecido. */
  expectedValue: number | null;
};

// Limiares de temperatura por probabilidade (alinhados ao conversion-predictor:
// banda "alta" começa em 58, "baixa" abaixo de 38). Mantemos margens próprias e
// explícitas para não acoplar ao detalhe interno do preditor.
const QUENTE = 58;
const FRIO = 38;

/** Emoji canônico por ação (estável para a UI). */
const ACTION_EMOJI: Record<NextBestActionKind, string> = {
  ligar_agora: "📞",
  enviar_proposta: "📝",
  remarcar_visita: "📅",
  reengajar: "🔄",
  nutrir: "🌱",
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Reais no padrão pt-BR sem depender de Intl: "R$ 1.234.567,00". */
export function brl(n: number): string {
  const neg = n < 0 ? "-" : "";
  const [inteiro, decimal] = Math.abs(n).toFixed(2).split(".");
  const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${neg}R$ ${agrupado},${decimal}`;
}

/** Probabilidade saneada para 0–100 (defensivo contra entrada fora de faixa). */
function safeProbability(p: number): number {
  return finite(p) ? clamp(Math.round(p), 0, 100) : 0;
}

/** Valor do imóvel válido (> 0) ou null — nunca inventa um número. */
function safePropertyValue(v: number | undefined): number | null {
  return finite(v) && v > 0 ? v : null;
}

/** Nome legível do lead sem vazar PII inexistente. */
function leadLabel(signal: LeadSignal): string {
  const nome = (signal.name || "").trim();
  if (nome) return nome;
  const id = (signal.leadId || "").trim();
  return id ? `Lead ${id.slice(0, 8)}` : "Lead sem nome";
}

/**
 * Escolhe a próxima ação pelo ESTADO do lead (determinístico, ordem importa):
 *   1. visita agendada com tarefa vencida  → remarcar_visita (compromisso quebrado)
 *   2. quente + proposta pendente           → enviar_proposta (fechar o ciclo)
 *   3. quente sem contato recente            → ligar_agora (a janela está fechando)
 *   4. quente (demais casos)                 → ligar_agora (manter o calor)
 *   5. frio                                  → nutrir (não queimar; educar)
 *   6. morno parado há muito tempo           → reengajar (resgatar o interesse)
 *   7. morno (demais casos)                  → reengajar
 */
export function chooseAction(signal: LeadSignal): NextBestActionKind {
  const p = safeProbability(signal.probability);
  const stage = (signal.stage || "").toLowerCase();
  const overdue = finite(signal.overdueTaskCount) ? signal.overdueTaskCount : 0;
  const lastContact = finite(signal.lastContactDays) ? signal.lastContactDays : null;
  const quente = p >= QUENTE;
  const frio = p < FRIO;

  if (stage === "visita" && overdue > 0) return "remarcar_visita";
  if (quente && stage === "proposta") return "enviar_proposta";
  if (quente && (lastContact === null || lastContact >= 2)) return "ligar_agora";
  if (quente) return "ligar_agora";
  if (frio) return "nutrir";
  if (lastContact !== null && lastContact >= 7) return "reengajar";
  return "reengajar";
}

/** Fator dominante para o "porquê" (o primeiro fator explicável, quando houver). */
function dominantFactor(signal: LeadSignal): string | null {
  for (const f of signal.factors ?? []) {
    const t = (f || "").trim();
    if (t) return t;
  }
  return null;
}

/** Frase-motivo por ação, citando o fator dominante quando existir. */
function buildWhy(action: NextBestActionKind, signal: LeadSignal): string {
  const fator = dominantFactor(signal);
  const p = safeProbability(signal.probability);
  const base: Record<NextBestActionKind, string> = {
    ligar_agora: `Lead quente (${p}% de conversão) — falar cedo é o que fecha`,
    enviar_proposta: `Lead quente (${p}%) com proposta no radar — formalizar destrava a decisão`,
    remarcar_visita: "Visita com tarefa vencida — reagendar mantém o compromisso vivo",
    reengajar: `Negociação morna (${p}%) esfriando — um toque de resgate reacende o interesse`,
    nutrir: `Ainda frio (${p}%) — nutrir com conteúdo sem queimar o lead`,
  };
  return fator ? `${base[action]}. Fator dominante: ${fator}.` : `${base[action]}.`;
}

/**
 * Monta a playlist priorizada da carteira.
 *
 * Ordenação (determinística e estável):
 *   score desc → probability desc → propertyValue desc (valor conhecido antes de
 *   desconhecido) → leadId asc. Assim o lead quente de imóvel CARO vem primeiro,
 *   e empates são resolvidos por critério fixo (nunca por acaso).
 *
 * score = probabilidade × valor do imóvel. Quando o valor é desconhecido, o
 * score é a própria probabilidade (não inventamos valor) — esses leads ficam
 * naturalmente atrás dos que têm potencial monetário calculável.
 */
export function nextBestActions(leads: LeadSignal[], opts?: { max?: number }): NextBestAction[] {
  const items = (leads ?? [])
    .filter((l) => l && typeof l.leadId === "string" && l.leadId.trim().length > 0)
    .map((signal) => {
      const p = safeProbability(signal.probability);
      const value = safePropertyValue(signal.propertyValue);
      const action = chooseAction(signal);
      const score = value !== null ? Math.round(p * value) : p;
      const expectedValue = value !== null ? Math.round((p / 100) * value) : null;
      return {
        leadId: signal.leadId,
        name: leadLabel(signal),
        action,
        priority: 0, // atribuído após a ordenação
        score,
        why: buildWhy(action, signal),
        emoji: ACTION_EMOJI[action],
        expectedValue,
        // campos auxiliares só para o desempate determinístico
        _p: p,
        _value: value ?? -1,
      };
    });

  items.sort(
    (a, b) =>
      b.score - a.score ||
      b._p - a._p ||
      b._value - a._value ||
      a.leadId.localeCompare(b.leadId),
  );

  const max = opts && finite(opts.max) ? Math.max(0, Math.floor(opts.max)) : items.length;
  const sliced = items.slice(0, max);

  return sliced.map(({ _p, _value, ...rest }, index) => {
    void _p;
    void _value;
    return { ...rest, priority: index + 1 };
  });
}

/**
 * Resumo de 1 linha, tom de corretor: quantos leads, quanto de potencial
 * calculável hoje, e por quem começar. Potencial soma só os expectedValue
 * conhecidos (dado ausente não entra na conta).
 */
export function playlistSummary(actions: NextBestAction[]): string {
  if (!actions || actions.length === 0) {
    return "Nenhuma próxima ação na carteira agora — nada quente pedindo seu toque.";
  }
  const total = actions.length;
  const potencial = actions.reduce((soma, a) => soma + (a.expectedValue ?? 0), 0);
  const topo = actions[0];
  const plural = total === 1 ? "lead vale" : "leads valem";
  const inicio = `Comece por ${topo.name} ${topo.emoji}`;
  if (potencial > 0) {
    return `${total} ${plural} ${brl(potencial)} em potencial hoje; ${inicio}.`;
  }
  // Sem valor monetário calculável: honesto, sem inventar cifra.
  return `${total} ${total === 1 ? "lead" : "leads"} na fila hoje (potencial em R$ não calculável ainda); ${inicio}.`;
}
