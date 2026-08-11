export type BehavioralSignalKind =
  | "customer-return"
  | "silence"
  | "visit"
  | "material-open"
  | "preference-change";

export type BehavioralSignalTone =
  | "danger"
  | "warning"
  | "success"
  | "info";

export type BehavioralSignal = {
  decisionImpact: string;
  detail: string;
  kind: BehavioralSignalKind;
  label: string;
  occurredAt: string | null;
  source: "Conversa registrada" | "CRM" | "Metadados do CRM";
  tone: BehavioralSignalTone;
};

export type BehavioralSignalsInput = {
  conversationContinuity?: {
    channel?: string | null;
    channelConfirmed?: boolean;
    lastContactAt?: string | null;
    responseState?:
      | "customer_replied"
      | "waiting_customer"
      | "recorded"
      | null;
  } | null;
  createdAt?: string | null;
  evaluatedAt?: string | null;
  firstContactedAt?: string | null;
  lastInteractionAt?: string | null;
  metadata?: Record<string, unknown> | null;
  status?: string | null;
  updatedAt?: string | null;
};

const MAX_SIGNALS = 3 as const;
const SILENCE_THRESHOLD_HOURS = 72 as const;

const PRIORITY: Record<BehavioralSignalKind, number> = {
  "customer-return": 100,
  silence: 90,
  visit: 80,
  "preference-change": 70,
  "material-open": 60,
};

function validIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function metadataDate(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[],
) {
  for (const key of keys) {
    const value = validIso(metadata?.[key]);
    if (value) return value;
  }
  return null;
}

function metadataText(
  metadata: Record<string, unknown> | null | undefined,
  keys: string[],
) {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function latestDate(values: Array<string | null | undefined>) {
  return values
    .map(validIso)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
}

function hoursBetween(older: string, newer: string) {
  return Math.max(
    0,
    Math.floor((Date.parse(newer) - Date.parse(older)) / 3_600_000),
  );
}

function channelLabel(channel: string | null | undefined) {
  const normalized = String(channel || "").trim().toLowerCase();
  if (normalized === "whatsapp") return "WhatsApp";
  if (["phone", "voice", "call"].includes(normalized)) return "ligação";
  if (normalized === "email") return "e-mail";
  if (normalized === "sms") return "SMS";
  return "conversa";
}

export function buildBehavioralSignals(
  input: BehavioralSignalsInput,
): BehavioralSignal[] {
  const signals: BehavioralSignal[] = [];
  const metadata = input.metadata ?? null;
  const evaluatedAt =
    validIso(input.evaluatedAt) ?? new Date().toISOString();
  const continuity = input.conversationContinuity;
  const lastConversationAt = validIso(continuity?.lastContactAt);

  if (
    continuity?.channelConfirmed === true &&
    continuity.responseState === "customer_replied" &&
    lastConversationAt
  ) {
    signals.push({
      decisionImpact: "Responder mantendo o contexto da conversa.",
      detail: `Cliente retornou por ${channelLabel(continuity.channel)}.`,
      kind: "customer-return",
      label: "Retorno confirmado",
      occurredAt: lastConversationAt,
      source: "Conversa registrada",
      tone: "success",
    });
  }

  const lastActivityAt = latestDate([
    lastConversationAt,
    input.lastInteractionAt,
    input.firstContactedAt,
    input.createdAt,
  ]);
  if (
    continuity?.responseState !== "customer_replied" &&
    lastActivityAt &&
    hoursBetween(lastActivityAt, evaluatedAt) >= SILENCE_THRESHOLD_HOURS
  ) {
    const silentDays = Math.max(
      3,
      Math.floor(hoursBetween(lastActivityAt, evaluatedAt) / 24),
    );
    signals.push({
      decisionImpact: "Definir contato agora antes de manter a oportunidade na fila.",
      detail: `Sem interação registrada há ${silentDays} dias.`,
      kind: "silence",
      label: "Silêncio operacional",
      occurredAt: lastActivityAt,
      source: "CRM",
      tone: silentDays >= 7 ? "danger" : "warning",
    });
  }

  const visitAt = metadataDate(metadata, [
    "visit_completed_at",
    "last_visit_at",
    "visit_at",
    "visit_scheduled_at",
  ]);
  if (visitAt) {
    signals.push({
      decisionImpact: "Confirmar resultado da visita e registrar o próximo passo.",
      detail: "Visita registrada no histórico comercial.",
      kind: "visit",
      label: "Visita registrada",
      occurredAt: visitAt,
      source: "Metadados do CRM",
      tone: "info",
    });
  } else if (String(input.status || "").toLowerCase() === "visita") {
    signals.push({
      decisionImpact: "Registrar o resultado antes de avançar a etapa.",
      detail: "Oportunidade está na etapa de visita; conclusão não presumida.",
      kind: "visit",
      label: "Etapa de visita",
      occurredAt: validIso(input.updatedAt),
      source: "CRM",
      tone: "info",
    });
  }

  const materialOpenedAt = metadataDate(metadata, [
    "material_opened_at",
    "last_material_opened_at",
    "material_viewed_at",
    "last_material_view_at",
  ]);
  if (materialOpenedAt) {
    signals.push({
      decisionImpact: "Retomar pelo material consultado e validar interesse.",
      detail:
        metadataText(metadata, ["material_name", "last_material_name"]) ??
        "Material comercial aberto pelo cliente.",
      kind: "material-open",
      label: "Material consultado",
      occurredAt: materialOpenedAt,
      source: "Metadados do CRM",
      tone: "info",
    });
  }

  const preferenceChangedAt = metadataDate(metadata, [
    "preference_changed_at",
    "preferences_updated_at",
  ]);
  if (preferenceChangedAt) {
    signals.push({
      decisionImpact: "Revalidar o projeto sugerido antes do próximo contato.",
      detail:
        metadataText(metadata, [
          "preference_change_summary",
          "last_preference_change",
        ]) ?? "Preferências comerciais atualizadas no CRM.",
      kind: "preference-change",
      label: "Preferência alterada",
      occurredAt: preferenceChangedAt,
      source: "Metadados do CRM",
      tone: "warning",
    });
  }

  return signals
    .sort((left, right) => {
      const priorityDifference = PRIORITY[right.kind] - PRIORITY[left.kind];
      if (priorityDifference !== 0) return priorityDifference;
      return (
        Date.parse(right.occurredAt || "") -
        Date.parse(left.occurredAt || "")
      );
    })
    .slice(0, MAX_SIGNALS);
}

export const BEHAVIORAL_SIGNALS_CONTRACT = {
  maxSignals: MAX_SIGNALS,
  silenceThresholdHours: SILENCE_THRESHOLD_HOURS,
  source: "registered-crm-facts-only",
  timelineInCard: false,
} as const;
