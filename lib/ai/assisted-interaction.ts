export const ASSISTED_INTERACTION_CHANNELS = [
  "call",
  "whatsapp",
  "meeting",
  "visit",
  "email",
  "note",
] as const;

export type AssistedInteractionChannel =
  (typeof ASSISTED_INTERACTION_CHANNELS)[number];

export type AssistedInteractionDraft = {
  outcome: string;
  intent: string;
  objections: string[];
  summary: string;
  nextAction: string;
  confidence: number;
};

export type AssistedInteractionConfirmation = AssistedInteractionDraft & {
  sourceText: string;
  channel: AssistedInteractionChannel;
  humanConfirmed: true;
  captureId: string;
  generatedBy: string;
  model: string;
};

const CHANNEL_SET = new Set<string>(ASSISTED_INTERACTION_CHANNELS);
const GENERATION_PROVIDER_SET = new Set(["openai", "local"]);
const MAX_SOURCE_LENGTH = 5_000;

function compact(value: unknown, maxLength: number) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function deterministicOutcome(text: string) {
  if (includesAny(text, ["visita agendada", "agendou visita", "marcou visita"])) {
    return "Visita agendada";
  }
  if (includesAny(text, ["proposta enviada", "recebeu a proposta", "enviar proposta"])) {
    return "Proposta em andamento";
  }
  if (includesAny(text, ["não respondeu", "nao respondeu", "sem retorno", "não atendeu", "nao atendeu"])) {
    return "Sem retorno";
  }
  if (includesAny(text, ["sem interesse", "desistiu", "não quer", "nao quer"])) {
    return "Sem interesse no momento";
  }
  if (includesAny(text, ["interessado", "interessada", "gostou", "quer conhecer"])) {
    return "Interesse confirmado";
  }
  return "Atendimento registrado";
}

function deterministicIntent(text: string) {
  if (includesAny(text, ["investir", "investimento", "renda", "rentabilidade"])) {
    return "Investimento";
  }
  if (includesAny(text, ["morar", "moradia", "família", "familia"])) {
    return "Moradia";
  }
  if (includesAny(text, ["comprar", "compra", "aquisição", "aquisicao"])) {
    return "Compra de imóvel";
  }
  return "A confirmar";
}

function deterministicObjections(text: string) {
  const signals: Array<[string, string[]]> = [
    ["Preço", ["preço", "preco", "caro", "valor alto", "orçamento", "orcamento"]],
    ["Financiamento", ["financiamento", "crédito", "credito", "entrada", "parcela"]],
    ["Localização", ["localização", "localizacao", "bairro", "região", "regiao", "distante"]],
    ["Prazo", ["prazo", "entrega", "quando fica pronto", "data de entrega"]],
    ["Produto", ["planta", "metragem", "tamanho", "dormitório", "dormitorio", "vaga"]],
    ["Concorrência", ["concorrência", "concorrencia", "outro empreendimento", "outra imobiliária", "outra imobiliaria"]],
  ];
  return signals
    .filter(([, terms]) => includesAny(text, terms))
    .map(([label]) => label);
}

function deterministicNextAction(outcome: string, objections: string[]) {
  if (outcome === "Visita agendada") return "Confirmar horário e presença antes da visita.";
  if (outcome === "Proposta em andamento") return "Confirmar o recebimento e combinar a data de retorno.";
  if (outcome === "Sem retorno") return "Definir uma nova tentativa de contato com data e canal.";
  if (outcome === "Sem interesse no momento") return "Registrar o motivo e confirmar se existe outra necessidade imobiliária.";
  if (objections.includes("Financiamento")) return "Validar capacidade de entrada e preparar uma simulação sem prometer aprovação.";
  if (objections.includes("Preço")) return "Confirmar a faixa de investimento e comparar opções compatíveis.";
  return "Combinar com o cliente a próxima ação e uma data de retorno.";
}

export function validateAssistedSource(input: {
  sourceText?: unknown;
  channel?: unknown;
}) {
  const sourceText = compact(input.sourceText, MAX_SOURCE_LENGTH);
  const channel = compact(input.channel, 24);
  if (!CHANNEL_SET.has(channel)) {
    return { ok: false as const, error: "Selecione um canal de atendimento válido." };
  }
  if (sourceText.length < 8) {
    return { ok: false as const, error: "Descreva o atendimento com pelo menos 8 caracteres." };
  }
  return {
    ok: true as const,
    value: { sourceText, channel: channel as AssistedInteractionChannel },
  };
}

export function buildDeterministicInteractionDraft(
  sourceText: string,
): AssistedInteractionDraft {
  const normalized = compact(sourceText, MAX_SOURCE_LENGTH);
  const searchable = normalized.toLocaleLowerCase("pt-BR");
  const outcome = deterministicOutcome(searchable);
  const objections = deterministicObjections(searchable);
  return {
    outcome,
    intent: deterministicIntent(searchable),
    objections,
    summary: normalized.slice(0, 700),
    nextAction: deterministicNextAction(outcome, objections),
    confidence: 0.45,
  };
}

function jsonObject(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1] ?? text;
  const start = fenced.indexOf("{");
  const end = fenced.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(fenced.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function mergeGeneratedInteractionDraft(
  raw: string,
  fallback: AssistedInteractionDraft,
): AssistedInteractionDraft {
  const parsed = jsonObject(raw);
  if (!parsed) return fallback;
  const objections = Array.isArray(parsed.objections)
    ? parsed.objections.map((item) => compact(item, 60)).filter(Boolean).slice(0, 6)
    : fallback.objections;
  const confidence = Number(parsed.confidence);
  return {
    outcome: compact(parsed.outcome, 120) || fallback.outcome,
    intent: compact(parsed.intent, 120) || fallback.intent,
    objections,
    summary: compact(parsed.summary, 700) || fallback.summary,
    nextAction: compact(parsed.nextAction, 300) || fallback.nextAction,
    confidence: Number.isFinite(confidence)
      ? Math.min(1, Math.max(0, confidence))
      : fallback.confidence,
  };
}

export function validateAssistedConfirmation(input: Record<string, unknown>) {
  const source = validateAssistedSource(input);
  if (!source.ok) return source;
  if (input.humanConfirmed !== true) {
    return { ok: false as const, error: "Revise e confirme o rascunho antes de salvar." };
  }
  const captureId = compact(input.captureId, 80);
  if (!/^[0-9a-f-]{36}$/i.test(captureId)) {
    return { ok: false as const, error: "Identificador da revisão inválido. Gere o rascunho novamente." };
  }
  const fallback = buildDeterministicInteractionDraft(source.value.sourceText);
  const draft = mergeGeneratedInteractionDraft(JSON.stringify(input), fallback);
  if (!draft.outcome || !draft.summary || !draft.nextAction) {
    return { ok: false as const, error: "Resultado, resumo e próxima ação são obrigatórios." };
  }
  const reportedProvider = compact(input.generatedBy, 40).toLowerCase();
  const generatedBy = GENERATION_PROVIDER_SET.has(reportedProvider)
    ? reportedProvider
    : "local";
  return {
    ok: true as const,
    value: {
      ...source.value,
      ...draft,
      humanConfirmed: true as const,
      captureId,
      generatedBy,
      model: generatedBy === "openai"
        ? compact(input.model, 120) || "openai-model-not-reported"
        : "deterministic-safe-fallback",
    } satisfies AssistedInteractionConfirmation,
  };
}

export function assistedInteractionDescription(
  input: AssistedInteractionConfirmation,
) {
  return [
    `Resultado: ${input.outcome}`,
    `Intenção: ${input.intent}`,
    input.objections.length ? `Objeções: ${input.objections.join(", ")}` : "Objeções: nenhuma registrada",
    `Resumo revisado: ${input.summary}`,
    `Próxima ação: ${input.nextAction}`,
    `Registro original preservado: ${input.sourceText}`,
  ].join("\n");
}
