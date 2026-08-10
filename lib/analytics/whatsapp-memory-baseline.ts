export type WhatsAppConnectionEvidence =
  | "proven"
  | "configured_unproven"
  | "not_configured";

type WhatsAppLineEvidence = {
  status: string | null;
  config: unknown;
};

type WhatsAppMemoryCounts = {
  conversations: number;
  linkedConversations: number;
  assignedConversations: number;
  messages: number;
  inboundMessages: number;
  outboundMessages: number;
  deliveredMessages: number;
  readMessages: number;
  failedMessages: number;
  externallyConfirmedMessages: number;
};

const count = (value: number) =>
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

const percent = (part: number, total: number) =>
  total > 0 ? Math.round((part / total) * 1_000) / 10 : 0;

function configObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function buildWhatsAppMemoryBaseline(input: {
  lines: WhatsAppLineEvidence[];
  counts: WhatsAppMemoryCounts;
  latestInboundAt?: string | null;
  latestOutboundAt?: string | null;
  latestExternalEvidenceAt?: string | null;
  measuredAt?: string;
}) {
  const lines = input.lines ?? [];
  const registered = lines.length;
  const connected = lines.filter((line) => line.status === "connected").length;
  const pendingApproval = lines.filter(
    (line) => line.status === "pending_approval",
  ).length;
  const disconnected = lines.filter(
    (line) => line.status === "disconnected",
  ).length;
  const recordingEnabled = lines.filter((line) => {
    const config = configObject(line.config);
    return line.status === "connected" && config.recordConversations !== false;
  }).length;

  const conversations = count(input.counts.conversations);
  const linkedConversations = Math.min(
    conversations,
    count(input.counts.linkedConversations),
  );
  const assignedConversations = Math.min(
    conversations,
    count(input.counts.assignedConversations),
  );
  const messages = count(input.counts.messages);
  const inboundMessages = Math.min(messages, count(input.counts.inboundMessages));
  const outboundMessages = Math.min(messages, count(input.counts.outboundMessages));
  const externallyConfirmedMessages = Math.min(
    messages,
    count(input.counts.externallyConfirmedMessages),
  );
  const trafficProven = externallyConfirmedMessages > 0;
  const configured = connected > 0;
  const connectionState: WhatsAppConnectionEvidence = trafficProven
    ? "proven"
    : configured
      ? "configured_unproven"
      : "not_configured";

  return {
    scope: "authenticated_organization" as const,
    containsPii: false,
    evidenceState: "measured" as const,
    lines: {
      registered,
      connected,
      pendingApproval,
      disconnected,
      recordingEnabled,
    },
    conversations: {
      total: conversations,
      linkedToLead: linkedConversations,
      unlinkedToLead: conversations - linkedConversations,
      assigned: assignedConversations,
      unassigned: conversations - assignedConversations,
      leadLinkRate: percent(linkedConversations, conversations),
    },
    messages: {
      total: messages,
      inbound: inboundMessages,
      outbound: outboundMessages,
      delivered: Math.min(messages, count(input.counts.deliveredMessages)),
      read: Math.min(messages, count(input.counts.readMessages)),
      failed: Math.min(messages, count(input.counts.failedMessages)),
      externallyConfirmed: externallyConfirmedMessages,
      latestInboundAt: input.latestInboundAt ?? null,
      latestOutboundAt: input.latestOutboundAt ?? null,
      latestExternalEvidenceAt: input.latestExternalEvidenceAt ?? null,
    },
    connection: {
      state: connectionState,
      configured,
      trafficProven,
      explanation:
        connectionState === "proven"
          ? "O CRM possui mensagem com identificador externo registrado."
          : connectionState === "configured_unproven"
            ? "Há linha cadastrada como conectada, mas ainda não há tráfego externo comprovado no CRM."
            : "Nenhuma linha conectada ou mensagem externa comprovada foi encontrada.",
    },
    learning: {
      linkedConversations,
      coveragePercent: percent(linkedConversations, conversations),
      readyForLearning: linkedConversations > 0 && inboundMessages > 0,
    },
    measuredAt: input.measuredAt ?? new Date().toISOString(),
    limitations: [
      "Linha cadastrada não comprova, sozinha, conexão ativa com a Meta.",
      "A leitura usa somente contagens e datas; telefones e conteúdo das mensagens não são retornados.",
      "O aprendizado só é considerado pronto quando há conversa vinculada à lead e mensagem recebida.",
    ],
  };
}
