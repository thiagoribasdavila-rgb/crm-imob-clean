import { generateAIText } from "@/lib/ai/provider-router";

// Inteligência de conversa do WhatsApp (entrada): transforma a resposta do
// cliente em intenção, objeções, resumo e próxima ação. Rota OpenAI-only via
// containsPersonalData (a mensagem do cliente é dado pessoal). Sempre há fallback
// determinístico — a IA nunca é ponto único de falha do atendimento.

export const WHATSAPP_INTENTS = ["interesse_alto", "duvida", "negociacao", "agendamento", "desinteresse", "suporte", "outro"] as const;
export type WhatsAppIntent = (typeof WHATSAPP_INTENTS)[number];

export const WHATSAPP_ACTIONS = ["responder_agora", "ligar", "enviar_material", "agendar_visita", "apresentar_projeto", "envolver_gerente", "aguardar"] as const;
export type WhatsAppAction = (typeof WHATSAPP_ACTIONS)[number];

export const WHATSAPP_OBJECTIONS = ["preco", "localizacao", "prazo_entrega", "financiamento", "tamanho", "concorrencia", "indeciso"] as const;
export type WhatsAppObjection = (typeof WHATSAPP_OBJECTIONS)[number];

export type WhatsAppInsight = {
  intent: WhatsAppIntent;
  objectionKeys: WhatsAppObjection[];
  summary: string;
  recommendedAction: WhatsAppAction;
  temperature: "frio" | "morno" | "quente";
  source: "ai" | "fallback";
  model: string | null;
};

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Fallback determinístico — heurística por palavras-chave, sem custo externo.
export function fallbackAnalyze(text: string): WhatsAppInsight {
  const t = normalize(text);
  const objections: WhatsAppObjection[] = [];
  if (/\b(caro|preco|valor|desconto|parcel)/.test(t)) objections.push("preco");
  if (/\b(longe|distante|bairro|regiao|localiza)/.test(t)) objections.push("localizacao");
  if (/\b(entrega|pronto|prazo|quando fica)/.test(t)) objections.push("prazo_entrega");
  if (/\b(financi|banco|entrada|credito|aprovad)/.test(t)) objections.push("financiamento");
  if (/\b(pequeno|metragem|tamanho|comodo|quarto)/.test(t)) objections.push("tamanho");

  let intent: WhatsAppIntent = "outro";
  let recommendedAction: WhatsAppAction = "responder_agora";
  let temperature: WhatsAppInsight["temperature"] = "morno";
  if (/\b(nao tenho interesse|nao quero|desisti|parar|depois eu vejo)/.test(t)) { intent = "desinteresse"; recommendedAction = "aguardar"; temperature = "frio"; }
  else if (/\b(visita|conhecer|agendar|marcar|ir ai|plantao)/.test(t)) { intent = "agendamento"; recommendedAction = "agendar_visita"; temperature = "quente"; }
  else if (objections.length) { intent = "negociacao"; recommendedAction = "envolver_gerente"; temperature = "morno"; }
  else if (/\b(quanto|preco|valor|planta|material|foto|detalh|informa)/.test(t)) { intent = "duvida"; recommendedAction = "enviar_material"; temperature = "morno"; }
  else if (/\b(quero|gostei|interess|amei|perfeito|fechar)/.test(t)) { intent = "interesse_alto"; recommendedAction = "ligar"; temperature = "quente"; }

  return { intent, objectionKeys: objections, summary: text.trim().slice(0, 200), recommendedAction, temperature, source: "fallback", model: null };
}

function coerce<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

const SYSTEM = [
  "Você é o motor de inteligência de conversas do Atlas, CRM imobiliário brasileiro.",
  "Analise a última mensagem do cliente no contexto da conversa e responda SOMENTE com um JSON válido, sem texto fora do JSON.",
  "Formato: {\"intent\":<interesse_alto|duvida|negociacao|agendamento|desinteresse|suporte|outro>,\"objections\":[<preco|localizacao|prazo_entrega|financiamento|tamanho|concorrencia|indeciso>],\"summary\":<resumo curto em pt-BR, até 240 caracteres>,\"recommended_action\":<responder_agora|ligar|enviar_material|agendar_visita|apresentar_projeto|envolver_gerente|aguardar>,\"temperature\":<frio|morno|quente>}",
  "Não invente dados. Se não houver sinal, use \"outro\" e \"responder_agora\".",
].join("\n");

export async function analyzeInboundWhatsApp(input: {
  organizationId: string;
  conversationText: string;
  latestText: string;
}): Promise<WhatsAppInsight> {
  const latest = input.latestText.trim();
  if (!latest) return fallbackAnalyze(input.latestText);
  try {
    const result = await generateAIText({
      task: "commercial",
      containsPersonalData: true,
      organizationId: input.organizationId,
      feature: "whatsapp-inbound-nlu",
      system: SYSTEM,
      prompt: `Conversa recente (mais antiga → mais recente):\n${input.conversationText.slice(0, 4000)}\n\nÚltima mensagem do cliente:\n"${latest.slice(0, 1000)}"\n\nResponda apenas com o JSON.`,
    });
    if (result.provider === "local") return fallbackAnalyze(latest);
    const match = result.text.match(/\{[\s\S]*\}/);
    if (!match) return { ...fallbackAnalyze(latest), model: result.model };
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const objections = Array.isArray(parsed.objections)
      ? [...new Set(parsed.objections.map((o) => coerce(o, WHATSAPP_OBJECTIONS, "indeciso")))].filter((o) => WHATSAPP_OBJECTIONS.includes(o))
      : [];
    return {
      intent: coerce(parsed.intent, WHATSAPP_INTENTS, "outro"),
      objectionKeys: objections as WhatsAppObjection[],
      summary: (typeof parsed.summary === "string" ? parsed.summary : latest).trim().slice(0, 240),
      recommendedAction: coerce(parsed.recommended_action, WHATSAPP_ACTIONS, "responder_agora"),
      temperature: coerce(parsed.temperature, ["frio", "morno", "quente"] as const, "morno"),
      source: "ai",
      model: result.model,
    };
  } catch {
    return fallbackAnalyze(latest);
  }
}
