export type WhatsAppLearningMessageRow = {
  id: string;
  conversation_id: string | null;
  direction: string | null;
  external_message_id: string | null;
  sent_at: string | null;
  created_at: string | null;
};

export type WhatsAppLearningConversationRow = {
  id: string;
  lead_id: string | null;
};

export type WhatsAppLearningBehaviorRow = {
  source_id: string | null;
  event_name: string | null;
};

export type WhatsAppLearningLineRow = {
  status: string | null;
  config: unknown;
};

const percent = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 1_000) / 10 : 0;

const hasValidDate = (value: string | null) =>
  Boolean(value && Number.isFinite(Date.parse(value)));

const lineRecordsConversations = (line: WhatsAppLearningLineRow) => {
  const config =
    line.config && typeof line.config === "object"
      ? (line.config as Record<string, unknown>)
      : {};
  return line.status === "connected" && config.recordConversations !== false;
};

export function buildWhatsAppLearningCaptureQuality(input: {
  messages: WhatsAppLearningMessageRow[];
  conversations: WhatsAppLearningConversationRow[];
  behaviorEvents: WhatsAppLearningBehaviorRow[];
  lines: WhatsAppLearningLineRow[];
  sourceTotal?: number;
  observedLimit?: number;
  now?: string;
}) {
  const messages = input.messages ?? [];
  const conversations = new Map(
    (input.conversations ?? []).map((conversation) => [
      conversation.id,
      conversation,
    ]),
  );
  const messageIds = new Set(messages.map((message) => message.id));
  const behaviorEvents = (input.behaviorEvents ?? []).filter(
    (event) => event.source_id && messageIds.has(event.source_id),
  );
  const coveredMessageIds = new Set(
    behaviorEvents
      .map((event) => event.source_id)
      .filter((id): id is string => Boolean(id)),
  );
  const sourceTotal = Math.max(
    messages.length,
    Math.trunc(input.sourceTotal ?? messages.length),
  );
  const observedLimit = Math.max(
    messages.length,
    Math.trunc(input.observedLimit ?? messages.length),
  );

  let inbound = 0;
  let outbound = 0;
  let validDirection = 0;
  let timestamped = 0;
  let linkedConversation = 0;
  let linkedLead = 0;
  let structurallyUsable = 0;
  let externallyTraceable = 0;

  for (const message of messages) {
    const directionValid =
      message.direction === "inbound" || message.direction === "outbound";
    if (message.direction === "inbound") inbound += 1;
    if (message.direction === "outbound") outbound += 1;
    if (directionValid) validDirection += 1;

    const timestampValid = hasValidDate(message.sent_at ?? message.created_at);
    if (timestampValid) timestamped += 1;
    if (message.external_message_id) externallyTraceable += 1;

    const conversation = message.conversation_id
      ? conversations.get(message.conversation_id)
      : undefined;
    if (conversation) linkedConversation += 1;
    if (conversation?.lead_id) linkedLead += 1;
    if (directionValid && timestampValid && conversation?.lead_id) {
      structurallyUsable += 1;
    }
  }

  const registeredLines = input.lines?.length ?? 0;
  const recordingConfiguredLines = (input.lines ?? []).filter(
    lineRecordsConversations,
  ).length;

  return {
    scope: "authenticated_organization" as const,
    containsPii: false as const,
    readsMessageContent: false as const,
    evidenceState: "measured" as const,
    source: {
      total: sourceTotal,
      observed: messages.length,
      observedLimit,
      truncated: sourceTotal > messages.length,
    },
    capture: {
      total: messages.length,
      inbound,
      outbound,
      validDirection,
      timestamped,
      linkedConversation,
      linkedLead,
      structurallyUsable,
      structuralCoveragePercent: percent(structurallyUsable, messages.length),
    },
    traceability: {
      externallyTraceable,
      coveragePercent: percent(externallyTraceable, messages.length),
    },
    canonicalMemory: {
      behaviorEvents: behaviorEvents.length,
      coveredMessages: coveredMessageIds.size,
      coveragePercent: percent(coveredMessageIds.size, messages.length),
      structuredLearningReady:
        messages.length > 0 && coveredMessageIds.size === messages.length,
    },
    recording: {
      registeredLines,
      recordingConfiguredLines,
      configurationCoveragePercent: percent(
        recordingConfiguredLines,
        registeredLines,
      ),
      provesAiLearningAuthorization: false as const,
    },
    authorization: {
      status: "not_proven" as const,
      explicitAiLearningEvidence: false,
      rawContentLearningAuthorized: false as const,
    },
    learning: {
      mode: "structured_only" as const,
      metadataReady: structurallyUsable > 0,
      structuredLearningReady:
        structurallyUsable > 0 && coveredMessageIds.size === messages.length,
      rawContentLearningReady: false as const,
    },
    gaps: {
      invalidDirection: messages.length - validDirection,
      missingTimestamp: messages.length - timestamped,
      missingConversation: messages.length - linkedConversation,
      missingLeadLink: messages.length - linkedLead,
      missingCanonicalEvent: messages.length - coveredMessageIds.size,
    },
    measuredAt: new Date(input.now ?? Date.now()).toISOString(),
    limitations: [
      "A medição não consulta nem retorna texto, remetente, destinatário, telefone ou mídia.",
      "Configuração de gravação e consentimento de contato não provam autorização para treinar IA com conteúdo bruto.",
      "Enquanto não houver evidência específica e auditável, o aprendizado permanece restrito a eventos estruturados.",
    ],
  };
}
