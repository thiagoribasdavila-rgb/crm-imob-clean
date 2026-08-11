import type { BehavioralSignal } from "./behavioral-signals";
import type { ProjectCompatibility } from "./project-compatibility";

export type DecisiveObstacleKind =
  | "price"
  | "credit"
  | "deadline"
  | "region"
  | "typology"
  | "no-return";

export type DecisiveObjectionStatus =
  | "active_objection"
  | "qualification_gap"
  | "clear";

export type DecisiveObjectionSnapshot = {
  actionLabel: string;
  detail: string;
  eyebrow: string;
  headline: string;
  kind: DecisiveObstacleKind | null;
  question: string | null;
  source:
    | "Metadados estruturados"
    | "Compatibilidade do projeto"
    | "Continuidade da conversa"
    | "Nenhuma";
  status: DecisiveObjectionStatus;
  tone: "danger" | "warning" | "info" | "success";
};

type DecisiveObjectionInput = {
  behavioralSignals?: BehavioralSignal[];
  metadata?: Record<string, unknown> | null;
  projectCompatibility?: ProjectCompatibility | null;
};

type ObstacleCopy = Pick<
  DecisiveObjectionSnapshot,
  "actionLabel" | "headline" | "question"
>;

const EXPLICIT_OBJECTION_KEYS = [
  "active_objection",
  "current_objection",
  "objection_type",
  "qualification_objection",
  "objection",
] as const;

const RESOLVED_OBJECTION_STATES = new Set([
  "closed",
  "dismissed",
  "resolved",
  "resolvida",
  "resolvido",
]);

const OBSTACLE_COPY: Record<DecisiveObstacleKind, ObstacleCopy> = {
  price: {
    actionLabel: "Validar faixa e condição",
    headline: "Preço exige validação",
    question: "Qual faixa ou condição tornaria a compra viável?",
  },
  credit: {
    actionLabel: "Confirmar condição de crédito",
    headline: "Crédito exige confirmação",
    question: "O financiamento já foi aprovado ou precisa de pré-análise?",
  },
  deadline: {
    actionLabel: "Definir prazo de compra",
    headline: "Prazo de compra indefinido",
    question: "Quando o cliente pretende comprar?",
  },
  region: {
    actionLabel: "Confirmar região",
    headline: "Região precisa ser confirmada",
    question: "Quais regiões são prioridade e por quê?",
  },
  typology: {
    actionLabel: "Validar tipologia",
    headline: "Tipologia precisa ser validada",
    question: "Qual tipologia atende à necessidade real?",
  },
  "no-return": {
    actionLabel: "Retomar contato agora",
    headline: "Retorno pendente",
    question: "Qual canal e horário têm mais chance de resposta?",
  },
};

export const DECISIVE_OBJECTION_CONTRACT = {
  allowedKinds: [
    "price",
    "credit",
    "deadline",
    "region",
    "typology",
    "no-return",
  ] as const,
  freeTextNotesAreEvidence: false,
  maxVisible: 1,
  priority: [
    "explicit-objection",
    "project-mismatch",
    "no-return",
    "missing-qualification",
  ] as const,
  registeredFactsOnly: true,
} as const;

function normalize(value: unknown) {
  return typeof value === "string"
    ? value
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
    : "";
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function classifyObstacle(value: unknown): DecisiveObstacleKind | null {
  const normalized = normalize(value);
  if (!normalized) return null;
  if (/sem retorno|nao respondeu|silencio/.test(normalized)) return "no-return";
  if (/credito|financiamento|aprovacao/.test(normalized)) return "credit";
  if (/prazo|timing|compra futura|agora nao/.test(normalized)) return "deadline";
  if (/regiao|bairro|localizacao/.test(normalized)) return "region";
  if (/tipologia|dormitorio|metragem|planta/.test(normalized)) return "typology";
  if (/preco|valor|custo/.test(normalized)) return "price";
  return null;
}

function explicitObjection(metadata: Record<string, unknown> | null | undefined) {
  for (const key of EXPLICIT_OBJECTION_KEYS) {
    const value = metadata?.[key];
    if (typeof value === "string") {
      const kind = classifyObstacle(value);
      if (kind) return { kind, label: value.trim() };
      continue;
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const record = value as Record<string, unknown>;
    const state = normalize(record.status ?? record.state);
    if (RESOLVED_OBJECTION_STATES.has(state)) continue;

    const label =
      text(record.label) ||
      text(record.value) ||
      text(record.type) ||
      text(record.category);
    const kind = classifyObstacle(
      [record.type, record.category, record.label, record.value]
        .map(text)
        .filter(Boolean)
        .join(" "),
    );
    if (kind && label) return { kind, label };
  }
  return null;
}

function snapshot(
  kind: DecisiveObstacleKind,
  input: Pick<
    DecisiveObjectionSnapshot,
    "detail" | "eyebrow" | "source" | "status" | "tone"
  > & { question?: string | null },
): DecisiveObjectionSnapshot {
  const copy = OBSTACLE_COPY[kind];
  return {
    ...copy,
    ...input,
    kind,
    question: input.question || copy.question,
  };
}

function compatibilityKind(key: string): DecisiveObstacleKind | null {
  if (key === "budget") return "price";
  if (key === "timeline") return "deadline";
  if (key === "region") return "region";
  if (key === "typology") return "typology";
  return null;
}

/**
 * Selects one decisive obstacle from registered, structured evidence.
 * Free-form notes are deliberately ignored to avoid labeling an observation
 * as an objection without an explicit commercial record.
 */
export function buildDecisiveObjection(
  input: DecisiveObjectionInput,
): DecisiveObjectionSnapshot {
  const explicit = explicitObjection(input.metadata);
  if (explicit) {
    return snapshot(explicit.kind, {
      detail: `Objeção ativa registrada: ${explicit.label}.`,
      eyebrow: "Objeção ativa",
      source: "Metadados estruturados",
      status: "active_objection",
      tone: "danger",
    });
  }

  const mismatch = input.projectCompatibility?.signals.find(
    (signal) =>
      signal.state === "attention" && Boolean(compatibilityKind(signal.key)),
  );
  const mismatchKind = mismatch ? compatibilityKind(mismatch.key) : null;
  if (mismatch && mismatchKind) {
    return snapshot(mismatchKind, {
      detail: mismatch.evidence,
      eyebrow: "Compatibilidade em atenção",
      source: "Compatibilidade do projeto",
      status: "active_objection",
      tone: "warning",
    });
  }

  const silence = input.behavioralSignals?.find(
    (signal) => signal.kind === "silence",
  );
  if (silence) {
    return snapshot("no-return", {
      detail: silence.detail,
      eyebrow: "Continuidade pendente",
      source: "Continuidade da conversa",
      status: "active_objection",
      tone: silence.tone === "danger" ? "danger" : "warning",
    });
  }

  const missing = input.projectCompatibility?.missing;
  const missingKind = missing ? compatibilityKind(missing.key) : null;
  if (missing && missingKind) {
    return snapshot(missingKind, {
      detail: `${missing.label} impede confirmar o próximo avanço.`,
      eyebrow: "Lacuna de qualificação",
      question: missing.question,
      source: "Compatibilidade do projeto",
      status: "qualification_gap",
      tone: "info",
    });
  }

  return {
    actionLabel: "",
    detail: "Nenhuma objeção ou lacuna decisiva foi registrada.",
    eyebrow: "Sem bloqueio registrado",
    headline: "Próximo avanço disponível",
    kind: null,
    question: null,
    source: "Nenhuma",
    status: "clear",
    tone: "success",
  };
}
