"use client";

import Link from "next/link";
import Image from "next/image";
import {
  DragEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import {
  ATLAS_ADAPTIVE_DENSITY_CONTRACT,
  ATLAS_DECISION_CARD_CONTRACT,
  ATLAS_PROGRESSIVE_DECISION_CONTRACT,
  AtlasCard,
  AtlasCardHeader,
  AtlasMetric,
} from "@/components/ui/AtlasCard";
import { AtlasDetailDisclosure } from "@/components/atlas/information-primitives";
import {
  ATLAS_RELIABLE_STATE_CONTRACT,
  ReliableState,
} from "@/components/atlas/reliable-state";
import {
  DEFAULT_PIPELINE_STAGES,
  type PipelineStageDefinition,
  type PipelineStageKey,
} from "@/lib/atlas/pipeline-stages";
import {
  buildRecommendationEvidence,
  type RecommendationEvidence,
} from "@/lib/atlas/recommendation-confidence";
import {
  buildBehavioralSignals,
  type BehavioralSignal,
} from "@/lib/atlas/behavioral-signals";
import {
  buildOpportunityAttribution,
  type OpportunityAttributionSnapshot,
} from "@/lib/atlas/opportunity-attribution";
import {
  buildDecisiveObjection,
  type DecisiveObjectionSnapshot,
} from "@/lib/atlas/decisive-objection";
import { buildRoleOrientedCard } from "@/lib/atlas/role-oriented-card";
import {
  buildKanbanStageDecisionHeader,
  validLeadValue,
} from "@/lib/atlas/kanban-decision-board";
import { buildKanbanCardAccessibility } from "@/lib/atlas/kanban-accessibility";
import {
  buildDecisionPerformanceEvent,
  groupRecordsByStage,
  type DecisionPerformanceEvent,
  type DecisionPerformancePayload,
} from "@/lib/atlas/decision-performance";
import {
  readAtlasAuthContext,
  type AtlasAuthContext,
} from "@/lib/auth/atlas-auth-context";

const defaultStages = DEFAULT_PIPELINE_STAGES.filter(
  (stage) =>
    stage.visible &&
    stage.outcome !== "lost" &&
    stage.outcome !== "buyer_profile",
);
const KANBAN_VISIBLE_PRIORITY_LIMIT = 3;
type StageKey = PipelineStageKey;
type FocusKey =
  "prioridade" | "sla" | "atrasadas" | "sem_acao" | "quentes" | "todas";
type SortKey = "prioridade" | "score" | "valor" | "recente";
type KanbanLensKey = "auto" | "broker" | "manager" | "director";
type CopilotIntent = "follow_up" | "summary" | "objections";
type ExecutionIntent = "task" | "calendar" | "proposal";
type PendingPipelineMove = {
  from: StageKey;
  leadId: string;
  leadName: string;
  notes: string;
  to: StageKey;
};
type PipelineMovementMethod =
  "drag" | "keyboard" | "selector" | "quick_action" | "undo" | "decision";
type PipelineMovementFeedback = {
  from: StageKey;
  leadId: string;
  leadName: string;
  method: PipelineMovementMethod;
  state: "saving" | "success" | "error";
  to: StageKey;
};

const PIPELINE_MOVEMENT_METHOD_LABEL: Record<PipelineMovementMethod, string> = {
  drag: "Arrastar",
  keyboard: "Teclado",
  selector: "Seletor",
  quick_action: "Avanço rápido",
  undo: "Desfazer",
  decision: "Decisão confirmada",
};
type PipelinePreferences = {
  focus?: FocusKey;
  sort?: SortKey;
  kanbanLens?: KanbanLensKey;
  compact?: boolean;
  focusMode?: boolean;
  hideEmpty?: boolean;
  mobileStage?: StageKey;
};
type PipelineScope = {
  loaded: number;
  totalOperational: number;
  archivedMemoryExcluded: boolean;
  limit: number;
};
type ConversationContinuity = {
  channel: string | null;
  channel_confirmed: boolean;
  conversation_status: string | null;
  last_contact_at: string | null;
  response_state: "customer_replied" | "waiting_customer" | "recorded";
};
type ProjectCompatibilitySignal = {
  key: "budget" | "region" | "typology" | "timeline" | "purpose";
  label: string;
  state: "aligned" | "attention" | "known";
  evidence: string;
};
type ProjectCompatibility = {
  status: "evidence_available" | "needs_qualification" | "project_unavailable";
  project_id: string | null;
  project_name: string | null;
  signals: ProjectCompatibilitySignal[];
  evidence_count: number;
  missing: {
    key: ProjectCompatibilitySignal["key"] | "project";
    label: string;
    question: string;
  } | null;
  evaluated_without_ai: true;
};
type Lead = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  project: string | null;
  project_name?: string | null;
  development_name?: string | null;
  development_id?: string | null;
  status: string | null;
  score: number | null;
  temperature: string | null;
  budget_min: number | null;
  budget_max: number | null;
  source: string | null;
  campaign_id: string | null;
  preferred_regions: string[] | null;
  bedrooms: number | null;
  purpose: string | null;
  last_interaction_at: string | null;
  next_action_at: string | null;
  first_contact_due_at: string | null;
  first_contacted_at: string | null;
  first_contact_sla_minutes: number | null;
  first_response_minutes: number | null;
  first_contact_sla_met: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  assigned_to: string | null;
  assigned_name?: string | null;
  conversation_continuity?: ConversationContinuity | null;
  project_compatibility?: ProjectCompatibility | null;
  metadata: Record<string, unknown> | null;
};
type LeadSignalTone = "danger" | "warning" | "success" | "info";
type KanbanPlaybookTone = LeadSignalTone | "neutral";
type KanbanPlaybookStep = {
  label: string;
  detail: string;
  tone: KanbanPlaybookTone;
  href: string;
  cta: string;
};
type KanbanFocusItem = {
  key: string;
  label: string;
  value: number;
  detail: string;
  tone: LeadSignalTone;
  action: string;
  focus: FocusKey;
  stage?: StageKey;
};
type KanbanV30NextMoveItem = {
  actionLabel: string;
  copilotIntent: CopilotIntent;
  decision: string;
  executionIntent: ExecutionIntent;
  focus: FocusKey;
  key: string;
  lead: Lead;
  nextStage?: PipelineStageDefinition;
  priority: "critical" | "high" | "medium" | "watch";
  reason: string;
  signal: string;
  stageLabel: string;
  valueLabel: string;
  weight: number;
};
type KanbanV30PrioritySignal = {
  label: string;
  priority: KanbanV30NextMoveItem["priority"];
  rank: number;
  tone: LeadSignalTone;
};
type KanbanV30HeatlineItem = KanbanV30NextMoveItem & {
  currentStage: StageKey;
  rank: number;
  tone: LeadSignalTone;
};
type KanbanCardEssentials = {
  urgencyLabel: string;
  urgencyTone: LeadSignalTone;
  primaryMeta: string;
  secondaryMeta: string;
  contactLabel: string;
  contactHref: string;
  contactExternal: boolean;
};
type KanbanV30CardAction = {
  detail: string;
  external: boolean;
  href: string;
  kind: "advance" | "contact" | "detail" | "material" | "record" | "schedule";
  label: string;
  targetStage?: StageKey;
};
type KanbanV30QuickSignal = {
  label: string;
  tone: LeadSignalTone;
  value: string;
};
type KanbanV30RecoveryMode =
  "error" | "empty_base" | "empty_filter" | "empty_board";
type KanbanV30RecoveryState = {
  action: string;
  detail: string;
  mode: KanbanV30RecoveryMode;
  steps: string[];
  title: string;
  tone: LeadSignalTone;
};
type KanbanV30MobileDecision = {
  actionHref: string;
  actionLabel: string;
  detail: string;
  external: boolean;
  lead?: Lead;
  stageLabel: string;
  targetStage?: StageKey;
  title: string;
  tone: LeadSignalTone;
};
type KanbanV30DetailPreview = {
  contactCall: string | null;
  contactWhatsApp: string | null;
  facts: Array<{ label: string; value: string }>;
  guidanceReason: string;
  lead: Lead;
  nextStage?: PipelineStageDefinition;
  playbook: KanbanPlaybookStep[];
  primaryAction: KanbanV30CardAction;
  risk: string;
  secondaryAction: KanbanV30CardAction;
  stage: PipelineStageDefinition;
  title: string;
  tone: LeadSignalTone;
};
type KanbanV30CardSnapshot = {
  behavioralSignals: BehavioralSignal[];
  decisiveObjection: DecisiveObjectionSnapshot;
  decisionLabel: string;
  facts: Array<{ label: string; value: string }>;
  headline: string;
  nextStage?: PipelineStageDefinition;
  opportunityAttribution: OpportunityAttributionSnapshot;
  primaryAction: KanbanV30CardAction;
  quickSignals: KanbanV30QuickSignal[];
  recommendationEvidence: RecommendationEvidence;
  secondaryAction: KanbanV30CardAction;
  subline: string;
  tone: LeadSignalTone;
};
type KanbanV30CommercialClock = {
  action: string;
  cause: string;
  deadline: string;
  impact: string;
  state: "closed" | "overdue" | "due_soon" | "scheduled" | "unplanned";
  tone: LeadSignalTone;
};
type KanbanV30StageActionLead = {
  actionHref: string;
  actionLabel: string;
  detail: string;
  external: boolean;
  lead: Lead;
  scoreLabel: string;
  targetStage?: StageKey;
  tone: LeadSignalTone;
  valueLabel: string;
};
type StageBottleneckGuideInput = {
  action: string;
  count: number;
  label: string;
  noAction: number;
  stalled: number;
  urgent: number;
  waitLabel: string;
};
type StageActionMicrocopy = {
  cta: string;
  detail: string;
  title: string;
  tone: LeadSignalTone;
};
type KanbanV30StageCommand = {
  actionLabel: string;
  detail: string;
  focus: FocusKey;
  label: string;
  tone: LeadSignalTone;
};
type EffectiveKanbanLens = Exclude<KanbanLensKey, "auto">;

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const compactBrl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 1,
  notation: "compact",
});
const PIPELINE_PREFERENCES_KEY = "atlas:pipeline-preferences:v1";
const KANBAN_PROGRESSIVE_VISIBLE_LIMIT = 8;
const KANBAN_LENS_KEYS: KanbanLensKey[] = [
  "auto",
  "broker",
  "manager",
  "director",
];
const KANBAN_LENS_LABEL: Record<KanbanLensKey, string> = {
  auto: "Automático",
  broker: "Corretor",
  manager: "Gerente",
  director: "Diretor",
};
const KANBAN_FOCUS_LABEL: Record<FocusKey, string> = {
  prioridade: "Prioridade",
  sla: "SLA",
  atrasadas: "Atrasadas",
  sem_acao: "Sem ação",
  quentes: "Quentes",
  todas: "Todas",
};
const KANBAN_SORT_LABEL: Record<SortKey, string> = {
  prioridade: "Prioridade IA",
  score: "Maior score",
  valor: "Maior valor",
  recente: "Mais recente",
};
const KANBAN_V30_PRIORITY_TONE: Record<
  KanbanV30NextMoveItem["priority"],
  LeadSignalTone
> = {
  critical: "danger",
  high: "success",
  medium: "warning",
  watch: "info",
};
const KANBAN_V30_QUALIFICATION_SIGNAL: Record<
  string,
  { impact: string; label: string; question: string }
> = {
  objetivo: {
    impact: "Define moradia, investimento e argumento comercial.",
    label: "Objetivo",
    question: "É para morar ou investir?",
  },
  investimento: {
    impact: "Evita indicar produto incompatível com orçamento.",
    label: "Investimento",
    question: "Qual faixa de investimento fica confortável?",
  },
  região: {
    impact: "Melhora matching de projeto, bairro e campanha.",
    label: "Região",
    question: "Quais regiões são prioridade e por quê?",
  },
  tipologia: {
    impact: "Filtra unidades e acelera simulação/proposta.",
    label: "Tipologia",
    question: "Quantos dormitórios atendem melhor?",
  },
};
const KANBAN_V30_INTERACTION_GUIDE = [
  {
    detail: "Com o card em foco, avance ou volte etapa sem abrir menu.",
    label: "Mover etapa",
    shortcut: "Alt + ←/→",
  },
  {
    detail:
      "Abra contexto só quando precisar de roteiro, histórico ou execução.",
    label: "Ver contexto",
    shortcut: "Enter",
  },
  {
    detail: "Arraste cards e solte apenas quando a coluna indicar segurança.",
    label: "Drag seguro",
    shortcut: "Soltar",
  },
  {
    detail: "Limpe filtros em 1 toque se o quadro esconder oportunidades.",
    label: "Recuperar visão",
    shortcut: "Reset",
  },
];

function isKanbanLensKey(value: unknown): value is KanbanLensKey {
  return KANBAN_LENS_KEYS.includes(value as KanbanLensKey);
}

function resolveKanbanLens(
  context: AtlasAuthContext | null,
): EffectiveKanbanLens {
  const role = String(
    context?.profile.commercialRole ||
      context?.profile.accessRole ||
      context?.profile.role ||
      "",
  ).toLowerCase();
  if (["manager", "superintendent"].includes(role)) return "manager";
  if (["admin", "owner", "director", "director_decisor"].includes(role))
    return "director";
  return "broker";
}

function kanbanLensIntent(lens: EffectiveKanbanLens) {
  if (lens === "director")
    return {
      title: "Decisão executiva",
      detail:
        "Prioriza valor, forecast e oportunidades que mudam o resultado do mês.",
    };
  if (lens === "manager")
    return {
      title: "Gestão de gargalos",
      detail:
        "Destaca etapas pressionadas, atrasos e leads sem próxima ação para o time destravar.",
    };
  return {
    title: "Execução do corretor",
    detail:
      "Organiza quem ligar, qual mensagem enviar e qual compromisso registrar agora.",
  };
}

function bottleneckRoleIntro(lens: EffectiveKanbanLens) {
  if (lens === "director")
    return "Prioridade executiva: proteger receita, forecast e velocidade do funil.";
  if (lens === "manager")
    return "Prioridade de gestão: destravar equipe, cadência e distribuição.";
  return "Prioridade do corretor: executar próxima ação com o menor atrito possível.";
}

function bottleneckRoleGuide(
  lens: EffectiveKanbanLens,
  item: StageBottleneckGuideInput,
) {
  if (lens === "director") {
    if (item.urgent > 0)
      return {
        label: "Cobrar plano",
        detail: `${item.urgent} urgência(s) em ${item.label}; valide impacto no forecast.`,
      };
    if (item.stalled > 0)
      return {
        label: "Risco de receita",
        detail: `${item.stalled} lead(s) parados; peça plano de avanço da liderança.`,
      };
    return {
      label: "Monitorar conversão",
      detail: `${item.count} oportunidade(s); acompanhe velocidade e VGV.`,
    };
  }

  if (lens === "manager") {
    if (item.urgent > 0)
      return {
        label: "Atacar com o time",
        detail: `Reorganize ${item.label}: ${item.urgent} urgência(s) exigem dono hoje.`,
      };
    if (item.noAction > 0)
      return {
        label: "Cobrar agenda",
        detail: `${item.noAction} sem próxima ação; distribua follow-up e horário.`,
      };
    return {
      label: "Destravar cadência",
      detail: `${item.waitLabel}; revise carga e prioridade dos corretores.`,
    };
  }

  if (item.urgent > 0)
    return {
      label: "Ligar agora",
      detail: `Abra ${item.label} e resolva o contato vencido primeiro.`,
    };
  if (item.noAction > 0)
    return {
      label: "Agendar ação",
      detail: `${item.noAction} lead(s) sem compromisso futuro nesta etapa.`,
    };
  return {
    label: item.action,
    detail: `${item.waitLabel}; registre o próximo passo para a IA aprender.`,
  };
}

function leadRisk(lead: Lead) {
  const score = Number(lead.score ?? 0);
  const overdue = lead.next_action_at
    ? new Date(lead.next_action_at).getTime() < Date.now()
    : false;
  const stale = lead.updated_at
    ? Date.now() - new Date(lead.updated_at).getTime() > 3 * 86_400_000
    : false;
  if (overdue || (stale && score >= 60)) return "alto";
  if (stale || score < 35) return "medio";
  return "baixo";
}

function riskTone(risk: string): "success" | "warning" | "danger" {
  if (risk === "alto") return "danger";
  if (risk === "medio") return "warning";
  return "success";
}

function metaCampaign(lead: Lead) {
  const meta = lead.metadata?.meta;
  if (!meta || typeof meta !== "object") return lead.campaign_id;
  const record = meta as Record<string, unknown>;
  return String(
    record.campaignName || record.campaignId || lead.campaign_id || "",
  );
}

function relativeTime(value: string | null) {
  if (!value) return "Sem contato";
  const hours = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 3_600_000),
  );
  if (hours < 1) return "Agora";
  if (hours < 24) return `${hours}h atrás`;
  return `${Math.floor(hours / 24)}d atrás`;
}

function hoursSince(value: string | null) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 3_600_000));
}

function stageStallSignal(lead: Lead): { label: string; tone: LeadSignalTone } {
  const reference =
    lead.updated_at || lead.last_interaction_at || lead.created_at;
  const hours = hoursSince(reference);
  if (hours === null) return { label: "Sem histórico", tone: "warning" };
  if (hours >= 168)
    return { label: `${Math.floor(hours / 24)}d parado`, tone: "danger" };
  if (hours >= 72)
    return { label: `${Math.floor(hours / 24)}d sem avanço`, tone: "warning" };
  if (hours >= 24)
    return { label: `${Math.floor(hours / 24)}d na etapa`, tone: "info" };
  if (hours >= 1) return { label: `${hours}h na etapa`, tone: "success" };
  return { label: "Movimento recente", tone: "success" };
}

function stageStallHours(lead: Lead) {
  return (
    hoursSince(
      lead.updated_at || lead.last_interaction_at || lead.created_at,
    ) ?? 0
  );
}

function stageStallLabelFromHours(hours: number) {
  if (hours >= 168) return `${Math.floor(hours / 24)}d maior espera`;
  if (hours >= 24) return `${Math.floor(hours / 24)}d maior espera`;
  if (hours >= 1) return `${hours}h maior espera`;
  return "Fluxo recente";
}

function dateLabel(value: string | null) {
  if (!value) return "Não agendado";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function conversationChannelLabel(channel: string | null) {
  const normalized = String(channel || "")
    .trim()
    .toLowerCase();
  if (normalized === "whatsapp") return "WhatsApp comprovado";
  if (["phone", "voice", "call"].includes(normalized))
    return "Ligação registrada";
  if (normalized === "email") return "E-mail comprovado";
  if (normalized === "sms") return "SMS comprovado";
  return normalized ? "Canal comprovado" : "Canal não comprovado";
}

function kanbanV30ConversationContinuity(lead: Lead) {
  const continuity = lead.conversation_continuity;
  const channelConfirmed = continuity?.channel_confirmed === true;
  const lastContactAt =
    continuity?.last_contact_at || lead.last_interaction_at || null;
  const responseState = continuity?.response_state || "recorded";

  if (!continuity && !lastContactAt) {
    return {
      channelConfirmed: false,
      channelLabel: "Canal não comprovado",
      lastContactLabel: "Sem contato registrado",
      nextCommitmentLabel: dateLabel(lead.next_action_at),
      state: "no_evidence",
      statusLabel: "Sem conversa comprovada",
      tone: "info" as const,
    };
  }

  return {
    channelConfirmed,
    channelLabel: channelConfirmed
      ? conversationChannelLabel(continuity?.channel || null)
      : "Canal não comprovado",
    lastContactLabel: lastContactAt
      ? relativeTime(lastContactAt)
      : "Sem contato registrado",
    nextCommitmentLabel: dateLabel(lead.next_action_at),
    state: continuity ? responseState : "history_only",
    statusLabel:
      responseState === "customer_replied"
        ? "Cliente respondeu"
        : responseState === "waiting_customer"
          ? "Aguardando resposta"
          : continuity
            ? "Interação registrada"
            : "Contato no histórico",
    tone:
      responseState === "customer_replied"
        ? ("success" as const)
        : responseState === "waiting_customer"
          ? ("warning" as const)
          : ("info" as const),
  };
}

function pipelineStageLabel(
  key: StageKey,
  stages: PipelineStageDefinition[] = DEFAULT_PIPELINE_STAGES,
) {
  return (
    stages.find((stage) => stage.key === key)?.label ||
    DEFAULT_PIPELINE_STAGES.find((stage) => stage.key === key)?.label ||
    key
  );
}

function firstContactSla(lead: Lead) {
  if (lead.first_contacted_at) {
    const minutes =
      lead.first_response_minutes ??
      (lead.created_at
        ? Math.max(
            0,
            Math.round(
              (new Date(lead.first_contacted_at).getTime() -
                new Date(lead.created_at).getTime()) /
                60_000,
            ),
          )
        : null);
    return {
      label:
        minutes === null
          ? "Contato realizado"
          : `${lead.first_contact_sla_met === false ? "Fora do SLA" : "No SLA"} · ${minutes} min`,
      tone:
        lead.first_contact_sla_met === false
          ? ("warning" as const)
          : ("success" as const),
      overdue: false,
    };
  }
  if (!lead.first_contact_due_at) return null;
  const remaining = Math.ceil(
    (new Date(lead.first_contact_due_at).getTime() - Date.now()) / 60_000,
  );
  if (remaining < 0)
    return {
      label: `SLA vencido há ${Math.abs(remaining)} min`,
      tone: "danger" as const,
      overdue: true,
    };
  return {
    label: `1º contato em até ${remaining} min`,
    tone: remaining <= 2 ? ("warning" as const) : ("info" as const),
    overdue: false,
  };
}

function isOpenLead(lead: Lead) {
  return !["ganho", "perdido", "comprou_outro"].includes(lead.status ?? "novo");
}

function isNextActionOverdue(lead: Lead) {
  return Boolean(
    lead.next_action_at && new Date(lead.next_action_at).getTime() < Date.now(),
  );
}

function priorityWeight(lead: Lead) {
  const sla = firstContactSla(lead);
  let weight = Number(lead.score ?? 0);
  if (sla?.overdue) weight += 300;
  if (isNextActionOverdue(lead)) weight += 220;
  if (!lead.next_action_at) weight += 80;
  if (lead.temperature === "quente") weight += 100;
  if (leadRisk(lead) === "alto") weight += 120;
  return weight;
}

function kanbanLensPriorityWeight(
  lead: Lead,
  lens: EffectiveKanbanLens,
  stageProbability = 5,
) {
  const score = Number(lead.score ?? 0);
  const value = Number(lead.budget_max ?? 0);
  const forecast = value * (stageProbability / 100);
  const slaOverdue = Boolean(firstContactSla(lead)?.overdue);
  const nextOverdue = isNextActionOverdue(lead);
  const noAction = !lead.next_action_at;
  const hot = lead.temperature === "quente" || score >= 70;
  const highRisk = leadRisk(lead) === "alto";
  const base = priorityWeight(lead);

  if (lens === "manager") {
    return (
      base +
      (slaOverdue ? 260 : 0) +
      (nextOverdue ? 220 : 0) +
      (noAction ? 160 : 0) +
      (highRisk ? 180 : 0)
    );
  }

  if (lens === "director") {
    return (
      forecast / 10_000 +
      value / 50_000 +
      score * 2 +
      (hot ? 180 : 0) +
      ((lead.status ?? "novo") === "proposta" ? 220 : 0) +
      (highRisk ? 80 : 0)
    );
  }

  return base + (phoneLinks(lead.phone) ? 18 : 0) + (lead.email ? 8 : 0);
}

function kanbanLensRankLabel(
  lead: Lead,
  lens: EffectiveKanbanLens,
  stageProbability = 5,
) {
  const score = Number(lead.score ?? 0);
  const value = Number(lead.budget_max ?? 0);
  const forecast = value * (stageProbability / 100);
  const slaOverdue = Boolean(firstContactSla(lead)?.overdue);
  const nextOverdue = isNextActionOverdue(lead);
  const noAction = !lead.next_action_at;
  const hot = lead.temperature === "quente" || score >= 70;
  const highRisk = leadRisk(lead) === "alto";

  if (lens === "manager") {
    if (slaOverdue || nextOverdue) return "gargalo";
    if (noAction) return "sem ação";
    if (highRisk) return "risco";
    return "cadência";
  }

  if (lens === "director") {
    if ((lead.status ?? "novo") === "proposta" || stageProbability >= 45)
      return "receita";
    if (value >= 1_000_000 || forecast >= 350_000) return "alto VGV";
    if (hot) return "quente";
    return "pipeline";
  }

  if (slaOverdue) return "ligar já";
  if (nextOverdue) return "retomar";
  if (noAction) return "agendar";
  if (hot) return "avançar";
  return "acompanhar";
}

function brokerGuidance(lead: Lead) {
  const sla = firstContactSla(lead);
  if (sla?.overdue)
    return {
      action: "Fazer o primeiro contato agora",
      reason: "O SLA venceu e a janela de resposta se reduz com o tempo.",
      tone: "danger" as const,
    };
  if (isNextActionOverdue(lead))
    return {
      action: "Retomar o combinado",
      reason: `A próxima ação estava prevista para ${dateLabel(lead.next_action_at)}.`,
      tone: "warning" as const,
    };
  if (!lead.next_action_at)
    return {
      action: "Definir a próxima ação",
      reason: "A oportunidade está sem compromisso futuro registrado.",
      tone: "warning" as const,
    };
  if ((lead.status ?? "novo") === "proposta")
    return {
      action: "Validar proposta e objeções",
      reason: "Confirme preço, fluxo, prazo e quem participa da decisão.",
      tone: "info" as const,
    };
  if ((lead.status ?? "novo") === "visita")
    return {
      action: "Preparar a visita",
      reason: "Reconfirme horário, interesse principal e unidade disponível.",
      tone: "info" as const,
    };
  if (lead.temperature === "quente" || Number(lead.score ?? 0) >= 70)
    return {
      action: "Avançar a oportunidade",
      reason: "A lead combina intenção e sinais comerciais fortes.",
      tone: "success" as const,
    };
  return {
    action: "Manter o acompanhamento",
    reason: `Próxima ação em ${dateLabel(lead.next_action_at)}.`,
    tone: "info" as const,
  };
}

function stageEfficiency(items: Lead[]) {
  const open = items.filter(isOpenLead);
  const urgent = open.filter(
    (lead) => firstContactSla(lead)?.overdue || isNextActionOverdue(lead),
  ).length;
  const hot = open.filter(
    (lead) => lead.temperature === "quente" || Number(lead.score ?? 0) >= 70,
  ).length;
  const noAction = open.filter((lead) => !lead.next_action_at).length;
  const stallHours = open.map(stageStallHours);
  const stalled = stallHours.filter((hours) => hours >= 72).length;
  const maxStallHours = stallHours.length ? Math.max(...stallHours) : 0;
  const avgStallHours = stallHours.length
    ? Math.round(
        stallHours.reduce((sum, hours) => sum + hours, 0) / stallHours.length,
      )
    : 0;
  const avgScore = open.length
    ? Math.round(
        open.reduce((sum, lead) => sum + Number(lead.score ?? 0), 0) /
          open.length,
      )
    : 0;
  return {
    urgent,
    hot,
    noAction,
    avgScore,
    stalled,
    maxStallHours,
    avgStallHours,
  };
}

function stageDecision(
  health: ReturnType<typeof stageEfficiency>,
  count: number,
) {
  if (!count)
    return {
      label: "Pronta para receber",
      detail: "Etapa limpa",
      tone: "info" as const,
    };
  if (health.urgent > 0)
    return {
      label: "Resolver urgências",
      detail: `${health.urgent} ação(ões) críticas`,
      tone: "danger" as const,
    };
  if (health.stalled > 0)
    return {
      label: "Destravar etapa",
      detail: `${health.stalled} parado(s)`,
      tone: "warning" as const,
    };
  if (health.noAction > 0)
    return {
      label: "Agendar próximos passos",
      detail: `${health.noAction} sem compromisso`,
      tone: "warning" as const,
    };
  if (health.hot > 0)
    return {
      label: "Avançar leads quentes",
      detail: `${health.hot} com sinal forte`,
      tone: "success" as const,
    };
  return {
    label: "Manter cadência",
    detail: "Etapa saudável",
    tone: "info" as const,
  };
}

function stageActionMicrocopy(
  lens: EffectiveKanbanLens,
  stageLabel: string,
  health: ReturnType<typeof stageEfficiency>,
  count: number,
  firstLeadName: string | null | undefined,
): StageActionMicrocopy {
  const leadName = firstLeadName || "lead principal";

  if (!count) {
    return {
      cta: "Monitorar entrada",
      detail:
        "A etapa está limpa e pronta para receber oportunidades qualificadas.",
      title: "Fluxo livre",
      tone: "info",
    };
  }

  if (lens === "director") {
    if (health.urgent > 0)
      return {
        cta: "Cobrar plano",
        detail: `${health.urgent} ação crítica em ${stageLabel}; valide impacto no forecast.`,
        title: "Risco de receita",
        tone: "danger",
      };
    if (health.stalled > 0)
      return {
        cta: "Ver VGV parado",
        detail: `${health.stalled} lead(s) sem avanço. Priorize destrave com liderança.`,
        title: "Receita travada",
        tone: "warning",
      };
    if (health.hot > 0)
      return {
        cta: "Acelerar fechamento",
        detail: `${health.hot} oportunidade(s) quentes. Peça plano de visita, proposta ou reserva.`,
        title: "Receita possível",
        tone: "success",
      };
    return {
      cta: "Acompanhar ritmo",
      detail: `${count} oportunidade(s) em ${stageLabel} com cadência operacional aceitável.`,
      title: "Forecast em controle",
      tone: "info",
    };
  }

  if (lens === "manager") {
    if (health.urgent > 0)
      return {
        cta: "Acionar time",
        detail: `${health.urgent} pendência(s) críticas. Redistribua ou cobre atendimento agora.`,
        title: "Fila exige gestão",
        tone: "danger",
      };
    if (health.noAction > 0)
      return {
        cta: "Criar cadência",
        detail: `${health.noAction} lead(s) sem próxima ação. Organize responsáveis por prioridade.`,
        title: "Cadência descoberta",
        tone: "warning",
      };
    if (health.stalled > 0)
      return {
        cta: "Destravar etapa",
        detail: `${health.stalled} lead(s) parado(s). Remova gargalo antes de puxar novos leads.`,
        title: "Etapa congestionada",
        tone: "warning",
      };
    return {
      cta: "Manter pressão",
      detail: `Equipe com ${count} lead(s) em ${stageLabel}. Revise os próximos movimentos.`,
      title: "Time em rota",
      tone: "info",
    };
  }

  if (health.urgent > 0)
    return {
      cta: "Ligar agora",
      detail: `Comece por ${leadName}. Resolver o atraso recupera a janela de resposta.`,
      title: "Ação imediata",
      tone: "danger",
    };
  if (health.noAction > 0)
    return {
      cta: "Criar tarefa",
      detail: `${health.noAction} lead(s) sem compromisso. Defina o próximo passo antes de sair.`,
      title: "Próximo passo",
      tone: "warning",
    };
  if (health.hot > 0)
    return {
      cta: "Avançar lead",
      detail: `${health.hot} lead(s) com sinal forte. Leve para visita, proposta ou reserva.`,
      title: "Oportunidade quente",
      tone: "success",
    };
  return {
    cta: "Atualizar histórico",
    detail: `${leadName} lidera a etapa. Registre a evolução para manter a IA aprendendo.`,
    title: "Acompanhamento ativo",
    tone: "info",
  };
}

function kanbanV30StageCommand(
  stageLabel: string,
  health: ReturnType<typeof stageEfficiency>,
  count: number,
): KanbanV30StageCommand {
  if (!count) {
    return {
      actionLabel: "Acompanhar entradas",
      detail:
        "Sem lead parado aqui. Mantenha a etapa limpa para novas oportunidades.",
      focus: "todas",
      label: "Etapa livre",
      tone: "info",
    };
  }

  if (health.urgent > 0) {
    return {
      actionLabel: "Ver urgentes",
      detail: `${health.urgent} lead(s) com SLA ou próxima ação vencida em ${stageLabel}.`,
      focus: "atrasadas",
      label: "Recuperar agora",
      tone: "danger",
    };
  }

  if (health.stalled > 0) {
    return {
      actionLabel: "Destravar etapa",
      detail: `${health.stalled} lead(s) parado(s) há mais de 72h. Priorize decisão ou descarte.`,
      focus: "sla",
      label: "Remover gargalo",
      tone: "warning",
    };
  }

  if (health.noAction > 0) {
    return {
      actionLabel: "Definir ações",
      detail: `${health.noAction} lead(s) sem próximo passo. O Kanban precisa de compromisso claro.`,
      focus: "sem_acao",
      label: "Agendar próximo passo",
      tone: "warning",
    };
  }

  if (health.hot > 0) {
    return {
      actionLabel: "Ver quentes",
      detail: `${health.hot} oportunidade(s) com sinal forte. Acelere visita, proposta ou reserva.`,
      focus: "quentes",
      label: "Acelerar conversão",
      tone: "success",
    };
  }

  return {
    actionLabel: "Revisar etapa",
    detail: `${count} lead(s) em ${stageLabel} com cadência saudável. Mantenha histórico atualizado.`,
    focus: "prioridade",
    label: "Manter ritmo",
    tone: "info",
  };
}

function leadSignals(
  lead: Lead,
): Array<{ label: string; tone: LeadSignalTone }> {
  const signals: Array<{ label: string; tone: LeadSignalTone }> = [];
  const sla = firstContactSla(lead);
  if (sla?.overdue) signals.push({ label: "SLA vencido", tone: "danger" });
  if (isNextActionOverdue(lead))
    signals.push({ label: "Ação atrasada", tone: "warning" });
  if (!lead.next_action_at)
    signals.push({ label: "Sem próxima ação", tone: "warning" });
  if (lead.temperature === "quente" || Number(lead.score ?? 0) >= 70)
    signals.push({ label: "Quente", tone: "success" });
  if (!signals.length)
    signals.push({ label: "Em acompanhamento", tone: "info" });
  return signals.slice(0, 3);
}

function primaryContactLabel(lead: Lead) {
  const contact = phoneLinks(lead.phone);
  if (contact) return "WhatsApp";
  if (lead.email) return "E-mail";
  return "Qualificar contato";
}

function phoneLinks(phone: string | null) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const international = digits.startsWith("55") ? digits : `55${digits}`;
  return {
    call: `tel:+${international}`,
    whatsapp: `https://wa.me/${international}`,
  };
}

/**
 * Project identity and campaign origin are different commercial facts.
 * A campaign may change while the lead remains interested in the same project.
 */
function leadProjectLabel(
  lead: Pick<Lead, "project" | "project_name" | "development_name">,
) {
  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const project = [lead.project_name, lead.development_name, lead.project]
    .map((value) => value?.trim() || "")
    .find((value) => value && !uuidLike.test(value));

  return project || "Projeto não vinculado";
}

function copilotIntentUrl(lead: Lead, intent: CopilotIntent) {
  const guidance = brokerGuidance(lead);
  const params = new URLSearchParams({
    from: "pipeline",
    intent,
    lead: lead.name || "Lead",
    stage: lead.status || "novo",
    action: guidance.action,
    temperature: lead.temperature || "frio",
    score: String(lead.score ?? 0),
  });

  const project = leadProjectLabel(lead);
  const campaign = metaCampaign(lead);
  if (project !== "Projeto não vinculado") params.set("project", project);
  if (campaign) params.set("campaign", campaign);

  return `/leads/${lead.id}/messages?${params.toString()}`;
}

function executionIntentUrl(lead: Lead, intent: ExecutionIntent) {
  const guidance = brokerGuidance(lead);
  const params = new URLSearchParams({
    from: "pipeline",
    intent,
    leadId: lead.id,
    lead: lead.name || "Lead",
    stage: lead.status || "novo",
    action: guidance.action,
    temperature: lead.temperature || "frio",
    score: String(lead.score ?? 0),
  });

  const project = leadProjectLabel(lead);
  const campaign = metaCampaign(lead);
  if (project !== "Projeto não vinculado") params.set("project", project);
  if (campaign) params.set("campaign", campaign);
  if (lead.next_action_at) params.set("suggestedAt", lead.next_action_at);

  const routes: Record<ExecutionIntent, string> = {
    task: "/tasks",
    calendar: "/calendar",
    proposal: "/sales",
  };

  return `${routes[intent]}?${params.toString()}`;
}

function missingLeadData(lead: Lead) {
  const missing: string[] = [];
  if (!lead.purpose) missing.push("objetivo");
  if (!lead.budget_min && !lead.budget_max) missing.push("investimento");
  if (!lead.preferred_regions?.length) missing.push("região");
  if (!lead.bedrooms) missing.push("tipologia");
  return missing;
}

function kanbanActionPlaybook(lead: Lead): KanbanPlaybookStep[] {
  const stage = lead.status ?? "novo";
  const score = Number(lead.score ?? 0);
  const isHot = lead.temperature === "quente" || score >= 70;
  const sla = firstContactSla(lead);
  const missing = missingLeadData(lead);

  let contactStep: KanbanPlaybookStep;
  if (sla?.overdue) {
    contactStep = {
      label: "Contato imediato",
      detail: "SLA vencido: faça a abordagem agora e registre o resultado.",
      tone: "danger",
      href: copilotIntentUrl(lead, "follow_up"),
      cta: "Mensagem IA",
    };
  } else if (isNextActionOverdue(lead)) {
    contactStep = {
      label: "Retomar combinado",
      detail: `A próxima ação venceu em ${dateLabel(lead.next_action_at)}.`,
      tone: "warning",
      href: executionIntentUrl(lead, "task"),
      cta: "Registrar ação",
    };
  } else if (!lead.next_action_at) {
    contactStep = {
      label: "Registrar próxima ação",
      detail: "Sem compromisso futuro: proteja a lead contra esquecimento.",
      tone: "warning",
      href: executionIntentUrl(lead, "task"),
      cta: "Criar tarefa",
    };
  } else {
    contactStep = {
      label: isHot ? "Acelerar contato" : "Manter cadência",
      detail: isHot
        ? "Lead quente: confirme interesse e conduza para visita ou proposta."
        : `Próximo passo em ${dateLabel(lead.next_action_at)}.`,
      tone: isHot ? "success" : "info",
      href: copilotIntentUrl(lead, "summary"),
      cta: "Preparar",
    };
  }

  const qualificationStep: KanbanPlaybookStep = missing.length
    ? {
        label: "Completar qualificação",
        detail: `Faltam: ${missing.join(", ")}. Pergunte antes de indicar produto.`,
        tone: "info",
        href: `/leads/${lead.id}`,
        cta: "Lead 360",
      }
    : stage === "visita"
      ? {
          label: "Confirmar visita",
          detail: "Reforce horário, endereço, unidade e motivação principal.",
          tone: "success",
          href: executionIntentUrl(lead, "calendar"),
          cta: "Agenda",
        }
      : {
          label: "Enviar material certo",
          detail:
            "Use projeto, região e orçamento para enviar tabela ou book compatível.",
          tone: "info",
          href: copilotIntentUrl(lead, "follow_up"),
          cta: "Material IA",
        };

  const advanceStep: KanbanPlaybookStep =
    stage === "proposta"
      ? {
          label: "Preparar fechamento",
          detail: "Valide fluxo, objeções, decisores e prazo de assinatura.",
          tone: "success",
          href: executionIntentUrl(lead, "proposal"),
          cta: "Proposta",
        }
      : isHot
        ? {
            label: "Agendar visita",
            detail:
              "Sinal forte: transforme interesse em compromisso presencial ou online.",
            tone: "success",
            href: executionIntentUrl(lead, "calendar"),
            cta: "Agendar",
          }
        : {
            label: "Registrar aprendizado",
            detail:
              "Salve objeção, preferência e próximo gatilho para a IA evoluir.",
            tone: "neutral",
            href: `/leads/${lead.id}`,
            cta: "Atualizar",
          };

  return [contactStep, qualificationStep, advanceStep];
}

function commercialClock(
  lead: Lead,
  guidance: ReturnType<typeof brokerGuidance>,
): KanbanV30CommercialClock {
  const sla = firstContactSla(lead);

  if (!isOpenLead(lead)) {
    return {
      action: "Revisar o resultado registrado",
      cause: "Ciclo comercial encerrado",
      deadline: "Sem prazo operacional",
      impact: "Histórico preservado para análise",
      state: "closed",
      tone: "success",
    };
  }

  if (sla?.overdue) {
    return {
      action: guidance.action,
      cause: "Primeiro contato ainda não registrado",
      deadline: sla.label,
      impact: "A janela de resposta se reduz com o tempo",
      state: "overdue",
      tone: "danger",
    };
  }

  if (!lead.first_contacted_at && sla) {
    return {
      action: "Fazer o primeiro contato",
      cause: "Lead aguardando atendimento inicial",
      deadline: sla.label,
      impact: "Responder no prazo protege a conversão",
      state: "due_soon",
      tone: sla.tone,
    };
  }

  if (isNextActionOverdue(lead)) {
    return {
      action: guidance.action,
      cause: "Compromisso comercial não concluído",
      deadline: `Venceu em ${dateLabel(lead.next_action_at)}`,
      impact: "O cliente ficou sem continuidade",
      state: "overdue",
      tone: "danger",
    };
  }

  if (lead.next_action_at) {
    return {
      action: guidance.action,
      cause: "Próximo compromisso registrado",
      deadline: dateLabel(lead.next_action_at),
      impact: "Cadência comercial protegida",
      state: "scheduled",
      tone: "success",
    };
  }

  return {
    action: guidance.action,
    cause: "Oportunidade sem compromisso futuro",
    deadline: "Definir agora",
    impact: "Risco de esquecimento e perda de timing",
    state: "unplanned",
    tone: "warning",
  };
}

function kanbanCardEssentials(
  lead: Lead,
  guidance: ReturnType<typeof brokerGuidance>,
): KanbanCardEssentials {
  const contact = phoneLinks(lead.phone);
  const sla = firstContactSla(lead);
  const isHot = lead.temperature === "quente" || Number(lead.score ?? 0) >= 70;
  const hasOverdueAction = Boolean(sla?.overdue || isNextActionOverdue(lead));

  return {
    urgencyLabel: hasOverdueAction
      ? "Atacar agora"
      : isHot
        ? "Alta prioridade"
        : !lead.next_action_at
          ? "Definir ação"
          : "Acompanhar",
    urgencyTone: hasOverdueAction
      ? "danger"
      : isHot
        ? "success"
        : !lead.next_action_at
          ? "warning"
          : guidance.tone,
    primaryMeta: lead.budget_max
      ? brl.format(lead.budget_max)
      : "Valor não informado",
    secondaryMeta: leadProjectLabel(lead),
    contactLabel: contact ? primaryContactLabel(lead) : "Abordagem IA",
    contactHref: contact?.whatsapp || copilotIntentUrl(lead, "follow_up"),
    contactExternal: Boolean(contact),
  };
}

function kanbanV30PrimaryAction(
  lead: Lead,
  guidance: ReturnType<typeof brokerGuidance>,
  nextStage?: PipelineStageDefinition,
): KanbanV30CardAction {
  const contact = phoneLinks(lead.phone);
  const sla = firstContactSla(lead);
  const nextActionOverdue = isNextActionOverdue(lead);
  const score = Number(lead.score ?? 0);
  const status = lead.status ?? "novo";

  if (sla?.overdue && contact) {
    return {
      detail:
        "O primeiro contato venceu; abra a conversa sem trocar de contexto.",
      external: true,
      href: contact.whatsapp,
      kind: "contact",
      label: "WhatsApp agora",
    };
  }

  if (nextActionOverdue && contact) {
    return {
      detail:
        "O follow-up está atrasado; retome a conversa antes que a intenção esfrie.",
      external: true,
      href: contact.whatsapp,
      kind: "contact",
      label: "Retomar agora",
    };
  }

  if (!lead.next_action_at) {
    return {
      detail:
        "Defina dono, horário e resultado esperado para manter a oportunidade previsível.",
      external: false,
      href: executionIntentUrl(lead, "task"),
      kind: "record",
      label: "Registrar próxima ação",
    };
  }

  if (status === "proposta") {
    return {
      detail:
        "Revise preço, fluxo de pagamento e objeções antes do próximo contato.",
      external: false,
      href: executionIntentUrl(lead, "proposal"),
      kind: "material",
      label: "Revisar proposta",
    };
  }

  if (status === "visita") {
    return {
      detail: "Confirme horário, endereço, unidade e presença do cliente.",
      external: false,
      href: executionIntentUrl(lead, "calendar"),
      kind: "schedule",
      label: "Confirmar visita",
    };
  }

  if ((lead.temperature === "quente" || score >= 70) && nextStage) {
    return {
      detail: `A oportunidade tem intenção suficiente para avançar até ${nextStage.label}.`,
      external: false,
      href: `/leads/${lead.id}`,
      kind: "advance",
      label: `Avançar para ${nextStage.label}`,
      targetStage: nextStage.key,
    };
  }

  if (contact) {
    return {
      detail: guidance.reason,
      external: true,
      href: contact.whatsapp,
      kind: "contact",
      label: "Falar com cliente",
    };
  }

  return {
    detail:
      "A IA prepara uma abordagem contextual antes de registrar o contato.",
    external: false,
    href: copilotIntentUrl(lead, "follow_up"),
    kind: "record",
    label: "Preparar abordagem",
  };
}

function kanbanV30CardSnapshot(
  lead: Lead,
  guidance: ReturnType<typeof brokerGuidance>,
  stage: PipelineStageDefinition,
  nextStage: PipelineStageDefinition | undefined,
  lens: EffectiveKanbanLens,
): KanbanV30CardSnapshot {
  const score = Number(lead.score ?? 0);
  const sla = firstContactSla(lead);
  const stall = stageStallSignal(lead);
  const nextActionOverdue = isNextActionOverdue(lead);
  const primaryAction = kanbanV30PrimaryAction(lead, guidance, nextStage);
  const secondaryAction: KanbanV30CardAction = {
    detail: "Ver histórico, preferências e pendências.",
    external: false,
    href: `/leads/${lead.id}`,
    kind: "detail",
    label: "Abrir Lead 360",
  };
  const recommendationEvidence = buildRecommendationEvidence({
    assignedTo: lead.assigned_to,
    campaignId: lead.campaign_id,
    evaluatedAt: lead.updated_at || lead.last_interaction_at || lead.created_at,
    firstContactSlaMet: lead.first_contact_sla_met,
    firstResponseMinutes: lead.first_response_minutes,
    lastInteractionAt: lead.last_interaction_at,
    nextActionAt: lead.next_action_at,
    operationalPriorityLabel: guidance.action,
    operationalPriorityReason: guidance.reason,
    projectEvidenceCount: lead.project_compatibility?.evidence_count,
    score: lead.score,
    source: lead.source,
    status: lead.status,
    temperature: lead.temperature,
  });
  const behavioralSignals = buildBehavioralSignals({
    conversationContinuity: lead.conversation_continuity
      ? {
          channel: lead.conversation_continuity.channel,
          channelConfirmed: lead.conversation_continuity.channel_confirmed,
          lastContactAt: lead.conversation_continuity.last_contact_at,
          responseState: lead.conversation_continuity.response_state,
        }
      : null,
    createdAt: lead.created_at,
    evaluatedAt: new Date().toISOString(),
    firstContactedAt: lead.first_contacted_at,
    lastInteractionAt: lead.last_interaction_at,
    metadata: lead.metadata,
    status: lead.status,
    updatedAt: lead.updated_at,
  });
  const decisiveObjection = buildDecisiveObjection({
    behavioralSignals,
    metadata: lead.metadata,
    projectCompatibility: lead.project_compatibility,
  });
  const projectLabel = leadProjectLabel(lead);
  const opportunityAttribution = buildOpportunityAttribution({
    assignedName: lead.assigned_name,
    assignedTo: lead.assigned_to,
    campaignId: lead.campaign_id,
    campaignName: metaCampaign(lead),
    leadId: lead.id,
    leadName: lead.name,
    metadata: lead.metadata,
    projectId: lead.development_id,
    projectName: projectLabel === "Projeto não vinculado" ? null : projectLabel,
    source: lead.source,
    stageKey: stage.key,
    stageLabel: stage.label,
  });
  const decisionLabel =
    lens === "director"
      ? "Decisão de receita"
      : lens === "manager"
        ? "Destravar time"
        : "Fazer agora";
  const valueLabel = lead.budget_max
    ? brl.format(lead.budget_max)
    : "Valor não informado";
  const contactLabel = lead.next_action_at
    ? dateLabel(lead.next_action_at)
    : relativeTime(lead.last_interaction_at);
  const quickSignals: KanbanV30QuickSignal[] = [
    {
      label: "Intenção",
      tone:
        lead.temperature === "quente" || score >= 70
          ? "success"
          : score >= 45
            ? "info"
            : "warning",
      value: lead.temperature
        ? `${lead.temperature} · Score ${lead.score ?? "não informado"}`
        : typeof lead.score === "number"
          ? `Score ${lead.score}`
          : "Score não informado",
    },
    {
      label: sla ? "SLA" : nextActionOverdue ? "Follow-up" : "Agenda",
      tone:
        sla?.tone ??
        (nextActionOverdue
          ? "danger"
          : lead.next_action_at
            ? "success"
            : "warning"),
      value:
        sla?.label ??
        (nextActionOverdue
          ? "Vencido"
          : lead.next_action_at
            ? dateLabel(lead.next_action_at)
            : "Sem próxima ação"),
    },
    {
      label: "Etapa",
      tone: stall.tone,
      value: stall.label,
    },
  ];

  return {
    behavioralSignals,
    decisiveObjection,
    decisionLabel,
    facts: [
      { label: "Projeto", value: leadProjectLabel(lead) },
      { label: "Potencial", value: valueLabel },
      {
        label: lead.next_action_at ? "Próxima ação" : "Último contato",
        value: contactLabel,
      },
    ],
    headline: guidance.action,
    nextStage,
    opportunityAttribution,
    primaryAction,
    quickSignals,
    recommendationEvidence,
    secondaryAction,
    subline: `${stage.label} · ${guidance.reason}`,
    tone: guidance.tone,
  };
}

function kanbanV30StageActionLead(
  lead: Lead | undefined,
  stage: PipelineStageDefinition,
  nextStage: PipelineStageDefinition | undefined,
  lens: EffectiveKanbanLens,
): KanbanV30StageActionLead | null {
  if (!lead) return null;

  const guidance = brokerGuidance(lead);
  const card = kanbanV30CardSnapshot(lead, guidance, stage, nextStage, lens);
  const score = Number(lead.score ?? 0);
  const valueLabel = lead.budget_max
    ? brl.format(lead.budget_max)
    : "Valor aberto";
  const lensDetail =
    lens === "director"
      ? `Proteja forecast: ${stage.label} · ${valueLabel}.`
      : lens === "manager"
        ? `Direcione o time: ${stage.label} · ${guidance.reason}`
        : guidance.reason;

  return {
    actionHref: card.primaryAction.href,
    actionLabel: card.primaryAction.label,
    detail: lensDetail,
    external: card.primaryAction.external,
    lead,
    scoreLabel: score ? `${score} score` : "sem score",
    targetStage: card.primaryAction.targetStage,
    tone: guidance.tone,
    valueLabel,
  };
}

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] =
    useState<PipelineStageDefinition[]>(defaultStages);
  const [canConfigureStages, setCanConfigureStages] = useState(false);
  const [pipelineScope, setPipelineScope] = useState<PipelineScope>({
    loaded: 0,
    totalOperational: 0,
    archivedMemoryExcluded: true,
    limit: 500,
  });
  const [mobileStage, setMobileStage] = useState<StageKey>(
    defaultStages[0]?.key || "novo",
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<FocusKey>("prioridade");
  const [sort, setSort] = useState<SortKey>("prioridade");
  const [identityLens, setIdentityLens] =
    useState<EffectiveKanbanLens>("broker");
  const [kanbanLens, setKanbanLens] = useState<KanbanLensKey>("auto");
  const [compact, setCompact] = useState(true);
  const [focusMode, setFocusMode] = useState(true);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<StageKey | null>(null);
  const [movementIntentLeadId, setMovementIntentLeadId] = useState<
    string | null
  >(null);
  const [emptyStageIntentKey, setEmptyStageIntentKey] =
    useState<StageKey | null>(null);
  const [lastMove, setLastMove] = useState<{
    moveId: string;
    leadId: string;
    leadName: string;
    from: StageKey;
    to: StageKey;
  } | null>(null);
  const [movementFeedback, setMovementFeedback] =
    useState<PipelineMovementFeedback | null>(null);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);
  const [expandedStages, setExpandedStages] = useState<Record<string, boolean>>(
    {},
  );
  const [previewLeadId, setPreviewLeadId] = useState<string | null>(null);
  const [kanbanV30BatchSelection, setKanbanV30BatchSelection] = useState<
    string[]
  >([]);
  const [pendingMove, setPendingMove] = useState<PendingPipelineMove | null>(
    null,
  );
  const pageEnteredAtRef = useRef(Date.now());
  const decisionCycleStartedAtRef = useRef<number | null>(null);
  const priorityTelemetrySentRef = useRef(false);

  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(PIPELINE_PREFERENCES_KEY);
      if (saved) {
        const preferences = JSON.parse(saved) as PipelinePreferences;
        if (preferences.focus) setFocus(preferences.focus);
        if (preferences.sort) setSort(preferences.sort);
        if (isKanbanLensKey(preferences.kanbanLens))
          setKanbanLens(preferences.kanbanLens);
        if (typeof preferences.compact === "boolean")
          setCompact(preferences.compact);
        if (typeof preferences.focusMode === "boolean")
          setFocusMode(preferences.focusMode);
        if (typeof preferences.hideEmpty === "boolean")
          setHideEmpty(preferences.hideEmpty);
        if (preferences.mobileStage) setMobileStage(preferences.mobileStage);
      }
    } catch {
      window.sessionStorage.removeItem(PIPELINE_PREFERENCES_KEY);
    } finally {
      setPreferencesHydrated(true);
    }
  }, []);

  useEffect(() => {
    setIdentityLens(resolveKanbanLens(readAtlasAuthContext()));
  }, []);

  useEffect(() => {
    if (!preferencesHydrated) return;
    window.sessionStorage.setItem(
      PIPELINE_PREFERENCES_KEY,
      JSON.stringify({
        focus,
        sort,
        kanbanLens,
        compact,
        focusMode,
        hideEmpty,
        mobileStage,
      }),
    );
  }, [
    compact,
    focus,
    focusMode,
    hideEmpty,
    kanbanLens,
    mobileStage,
    preferencesHydrated,
    sort,
  ]);

  const authenticatedFetch = useCallback(
    async (input: RequestInfo, init?: RequestInit) => {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente.");
      return fetch(input, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          ...(init?.headers || {}),
        },
      });
    },
    [],
  );

  const emitDecisionPerformance = useCallback(
    (
      event: DecisionPerformanceEvent,
      payload: DecisionPerformancePayload & Record<string, unknown>,
    ) => {
      const body = buildDecisionPerformanceEvent(event, payload);
      void authenticatedFetch("/api/v3/events/ingest", {
        method: "POST",
        body: JSON.stringify(body),
        keepalive: true,
      }).catch(() => {
        // Telemetria nunca bloqueia a operação comercial.
      });
    },
    [authenticatedFetch],
  );

  const openLeadPreview = useCallback(
    (leadId: string, method: "card" | "queue" | "preview" = "card") => {
      const cycleStartedAt = decisionCycleStartedAtRef.current;
      emitDecisionPerformance("opportunityOpened", {
        durationMs: cycleStartedAt ? Date.now() - cycleStartedAt : 0,
        method,
      });
      decisionCycleStartedAtRef.current = Date.now();
      setPreviewLeadId(leadId);
    },
    [emitDecisionPerformance],
  );

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/v1/pipeline");
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          "O pipeline não pôde ser carregado agora. Tente novamente em instantes.",
        );
      setLeads((payload.leads ?? []) as Lead[]);
      if (Array.isArray(payload.stages))
        setStages(
          (payload.stages as PipelineStageDefinition[]).filter(
            (stage) =>
              stage.visible &&
              stage.outcome !== "lost" &&
              stage.outcome !== "buyer_profile",
          ),
        );
      setCanConfigureStages(payload.canConfigureStages === true);
      if (payload.pagination && typeof payload.pagination === "object") {
        setPipelineScope({
          loaded: Number(payload.pagination.loaded || 0),
          totalOperational: Number(payload.pagination.totalOperational || 0),
          archivedMemoryExcluded:
            payload.pagination.archivedMemoryExcluded !== false,
          limit: Number(payload.pagination.limit || 500),
        });
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "O pipeline não pôde ser carregado agora.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function moveLead(
    id: string,
    stage: StageKey,
    reversalOf?: string,
    approvedMove?: { notes?: string },
    movementMethod: PipelineMovementMethod = "quick_action",
  ) {
    if (savingId) {
      setError(
        "Aguarde a movimentação atual ser confirmada antes de mover outra lead.",
      );
      return;
    }
    const currentLead = leadById.get(id);
    const previousStage = (currentLead?.status || "novo") as StageKey;
    if (previousStage === stage) {
      setDraggedId(null);
      setDragOverStage(null);
      return;
    }
    const requiresDecision =
      !reversalOf && ["ganho", "perdido", "comprou_outro"].includes(stage);
    if (requiresDecision && !approvedMove) {
      setPendingMove({
        from: previousStage,
        leadId: id,
        leadName: currentLead?.name || "Esta lead",
        notes: "",
        to: stage,
      });
      setDraggedId(null);
      setDragOverStage(null);
      return;
    }
    const followUpDescription = approvedMove?.notes?.trim() || "";
    if (stage === "comprou_outro" && followUpDescription.length < 10) {
      setError(
        "Registre um acompanhamento com pelo menos 10 caracteres para preservar o aprendizado comercial.",
      );
      return;
    }
    const previous = leads;
    const movement = {
      from: previousStage,
      leadId: id,
      leadName: currentLead?.name || "Lead",
      method: movementMethod,
      to: stage,
    };
    const actionStartedAt = Date.now();
    emitDecisionPerformance("actionStarted", {
      durationMs:
        actionStartedAt -
        (decisionCycleStartedAtRef.current || actionStartedAt),
      fromStage: previousStage,
      method: movementMethod,
      toStage: stage,
    });
    setSavingId(id);
    setMovementFeedback({ ...movement, state: "saving" });
    setError("");
    setLeads((current) =>
      current.map((lead) =>
        lead.id === id
          ? { ...lead, status: stage, updated_at: new Date().toISOString() }
          : lead,
      ),
    );
    setMobileStage(stage);
    try {
      const response = await authenticatedFetch("/api/v1/pipeline", {
        method: "PATCH",
        body: JSON.stringify({
          leadId: id,
          stage,
          expectedFromStage: previousStage,
          followUpDescription,
          reversalOf: reversalOf || null,
        }),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          "A movimentação não foi confirmada. A lead permaneceu na etapa anterior.",
        );
      if (!reversalOf && payload.move?.moveId)
        setLastMove({
          moveId: payload.move.moveId,
          leadId: id,
          leadName: currentLead?.name || "Lead",
          from: previousStage,
          to: stage,
        });
      setMovementFeedback({ ...movement, state: "success" });
      emitDecisionPerformance("resultRegistered", {
        durationMs: Date.now() - actionStartedAt,
        fromStage: previousStage,
        method: movementMethod,
        result: "success",
        toStage: stage,
      });
      decisionCycleStartedAtRef.current = Date.now();
    } catch (moveError) {
      setLeads(previous);
      setMovementFeedback({ ...movement, state: "error" });
      emitDecisionPerformance("resultRegistered", {
        durationMs: Date.now() - actionStartedAt,
        fromStage: previousStage,
        method: movementMethod,
        result: "error",
        toStage: stage,
      });
      setError(
        moveError instanceof Error ? moveError.message : "Falha ao mover lead.",
      );
    } finally {
      setSavingId(null);
      setDraggedId(null);
      setDragOverStage(null);
      setMovementIntentLeadId(null);
    }
  }

  function onDrop(event: DragEvent<HTMLElement>, stage: StageKey) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/lead-id") || draggedId;
    if (id) void moveLead(id, stage, undefined, undefined, "drag");
  }

  function moveByKeyboard(lead: Lead, direction: -1 | 1) {
    const current =
      stageIndexByKey.get((lead.status || "novo") as StageKey) ?? -1;
    const destination = stages[current + direction];
    if (destination)
      void moveLead(lead.id, destination.key, undefined, undefined, "keyboard");
  }

  async function undoLastMove() {
    if (!lastMove) return;
    const move = lastMove;
    setLastMove(null);
    await moveLead(move.leadId, move.from, move.moveId, undefined, "undo");
    setLastMove(null);
  }

  const effectiveKanbanLens: EffectiveKanbanLens =
    kanbanLens === "auto" ? identityLens : kanbanLens;
  const lensIntent = kanbanLensIntent(effectiveKanbanLens);
  const leadById = useMemo(
    () => new Map(leads.map((lead) => [lead.id, lead])),
    [leads],
  );
  const stageByKey = useMemo(
    () => new Map(stages.map((stage) => [stage.key, stage])),
    [stages],
  );
  const stageIndexByKey = useMemo(
    () => new Map(stages.map((stage, index) => [stage.key, index])),
    [stages],
  );

  const visibleLeads = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const searched = normalized
      ? leads.filter((lead) =>
          [
            lead.name,
            lead.email,
            lead.phone,
            leadProjectLabel(lead),
            lead.temperature,
            lead.source,
            lead.purpose,
            metaCampaign(lead),
            ...(lead.preferred_regions ?? []),
          ].some((value) => value?.toLowerCase().includes(normalized)),
        )
      : leads;
    const filtered = searched.filter((lead) => {
      if (focus === "todas") return true;
      if (!isOpenLead(lead)) return false;
      if (focus === "sla") return Boolean(firstContactSla(lead)?.overdue);
      if (focus === "atrasadas") return isNextActionOverdue(lead);
      if (focus === "sem_acao") return !lead.next_action_at;
      if (focus === "quentes")
        return lead.temperature === "quente" || Number(lead.score ?? 0) >= 70;
      return (
        Boolean(firstContactSla(lead)?.overdue) ||
        isNextActionOverdue(lead) ||
        !lead.next_action_at ||
        lead.temperature === "quente" ||
        Number(lead.score ?? 0) >= 70 ||
        leadRisk(lead) === "alto"
      );
    });
    return [...filtered].sort((a, b) => {
      if (sort === "score") return Number(b.score ?? 0) - Number(a.score ?? 0);
      if (sort === "valor")
        return Number(b.budget_max ?? 0) - Number(a.budget_max ?? 0);
      if (sort === "recente")
        return (
          new Date(b.updated_at || 0).getTime() -
          new Date(a.updated_at || 0).getTime()
        );
      return priorityWeight(b) - priorityWeight(a);
    });
  }, [focus, leads, query, sort]);
  const visibleOpenLeadCount = useMemo(
    () =>
      visibleLeads.reduce((count, lead) => count + Number(isOpenLead(lead)), 0),
    [visibleLeads],
  );

  useEffect(() => {
    if (
      loading ||
      priorityTelemetrySentRef.current ||
      !visibleLeads.some(isOpenLead)
    )
      return;

    priorityTelemetrySentRef.current = true;
    decisionCycleStartedAtRef.current = Date.now();
    emitDecisionPerformance("priorityIdentified", {
      durationMs: Date.now() - pageEnteredAtRef.current,
      loadedLeadCount: leads.length,
      visibleStageCount: stages.length,
    });
  }, [
    emitDecisionPerformance,
    leads.length,
    loading,
    stages.length,
    visibleLeads,
  ]);

  useEffect(() => {
    if (
      previewLeadId &&
      !visibleLeads.some((lead) => lead.id === previewLeadId)
    ) {
      setPreviewLeadId(null);
    }
  }, [previewLeadId, visibleLeads]);

  const stageTotalCounts = useMemo(() => {
    const counts = new Map<StageKey, number>();
    for (const lead of leads) {
      if (!isOpenLead(lead)) continue;
      const key = (lead.status ?? "novo") as StageKey;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [leads]);

  const destinationOptions = useMemo<
    Array<{ key: StageKey; label: string }>
  >(() => {
    const configured = new Map(stages.map((stage) => [stage.key, stage.label]));
    return DEFAULT_PIPELINE_STAGES.map((stage) => ({
      key: stage.key,
      label: configured.get(stage.key) || stage.label,
    }));
  }, [stages]);
  const movingLead = useMemo(
    () => (savingId ? leadById.get(savingId) || null : null),
    [leadById, savingId],
  );
  const draggedLead = useMemo(
    () => (draggedId ? leadById.get(draggedId) || null : null),
    [draggedId, leadById],
  );
  const movementIntentLead = useMemo(
    () =>
      movementIntentLeadId ? leadById.get(movementIntentLeadId) || null : null,
    [leadById, movementIntentLeadId],
  );
  const movementIntentStageIndex = movementIntentLead
    ? (stageIndexByKey.get((movementIntentLead.status || "novo") as StageKey) ??
      -1)
    : -1;
  const movementIntentPreviousStage =
    movementIntentStageIndex > 0 ? stages[movementIntentStageIndex - 1] : null;
  const movementIntentNextStage =
    movementIntentStageIndex >= 0
      ? stages[movementIntentStageIndex + 1] || null
      : null;
  const dragTargetStage = dragOverStage ? stageByKey.get(dragOverStage) : null;

  const metrics = useMemo(() => {
    const open = leads.filter(
      (lead) =>
        !["ganho", "perdido", "comprou_outro"].includes(lead.status ?? "novo"),
    );
    const pipeline = open.reduce(
      (sum, lead) => sum + Number(lead.budget_max ?? 0),
      0,
    );
    const forecast = open.reduce((sum, lead) => {
      const stage = stageByKey.get((lead.status ?? "novo") as StageKey);
      return (
        sum + Number(lead.budget_max ?? 0) * ((stage?.probability ?? 5) / 100)
      );
    }, 0);
    const hot = open.filter(
      (lead) => lead.temperature === "quente" || Number(lead.score ?? 0) >= 70,
    ).length;
    const highRisk = open.filter((lead) => leadRisk(lead) === "alto").length;
    const won = leads
      .filter((lead) => lead.status === "ganho")
      .reduce((sum, lead) => sum + Number(lead.budget_max ?? 0), 0);
    const buyerProfiles = leads.filter(
      (lead) => lead.status === "comprou_outro",
    ).length;
    const firstContactOverdue = open.filter(
      (lead) => firstContactSla(lead)?.overdue,
    ).length;
    return {
      open: open.length,
      pipeline,
      forecast,
      hot,
      highRisk,
      won,
      buyerProfiles,
      firstContactOverdue,
    };
  }, [leads, stageByKey]);

  const pipelineQuality = useMemo(() => {
    const open = leads.filter(isOpenLead);
    const hot = open.filter(
      (lead) => lead.temperature === "quente" || Number(lead.score ?? 0) >= 70,
    );
    const withNextAction = open.filter((lead) =>
      Boolean(lead.next_action_at),
    ).length;
    const urgent = open.filter(
      (lead) => firstContactSla(lead)?.overdue || isNextActionOverdue(lead),
    ).length;
    const slaProtected = open.filter(
      (lead) => !firstContactSla(lead)?.overdue,
    ).length;
    const hotWithAction = hot.filter((lead) =>
      Boolean(lead.next_action_at),
    ).length;
    const actionCoverage = open.length
      ? Math.round((withNextAction / open.length) * 100)
      : 100;
    const slaCoverage = open.length
      ? Math.round((slaProtected / open.length) * 100)
      : 100;
    const hotCoverage = hot.length
      ? Math.round((hotWithAction / hot.length) * 100)
      : 100;
    const qualityScore = Math.round(
      actionCoverage * 0.45 + slaCoverage * 0.35 + hotCoverage * 0.2,
    );
    const withoutNextAction = Math.max(0, open.length - withNextAction);
    const decision =
      urgent > 0
        ? "Atacar urgências agora"
        : withoutNextAction > 0
          ? "Agendar próximas ações"
          : hot.length > 0
            ? "Avançar oportunidades quentes"
            : "Manter cadência comercial";
    const tone =
      qualityScore >= 82
        ? "success"
        : qualityScore >= 62
          ? "warning"
          : "danger";
    return {
      actionCoverage,
      slaCoverage,
      hotCoverage,
      qualityScore,
      urgent,
      withoutNextAction,
      decision,
      tone,
    };
  }, [leads]);

  const leadsByStage = useMemo(
    () => groupRecordsByStage(visibleLeads),
    [visibleLeads],
  );
  const stageData = useMemo(
    () =>
      stages.map((stage, stageIndex) => {
        const items = [...(leadsByStage.get(stage.key) ?? [])].sort((a, b) => {
          const lensDelta =
            kanbanLensPriorityWeight(
              b,
              effectiveKanbanLens,
              stage.probability,
            ) -
            kanbanLensPriorityWeight(a, effectiveKanbanLens, stage.probability);
          if (lensDelta !== 0) return lensDelta;
          return priorityWeight(b) - priorityWeight(a);
        });
        const health = stageEfficiency(items);
        const decision = stageDecision(health, items.length);
        const microcopy = stageActionMicrocopy(
          effectiveKanbanLens,
          stage.label,
          health,
          items.length,
          items[0]?.name,
        );
        const v30Command = kanbanV30StageCommand(
          stage.label,
          health,
          items.length,
        );
        const stageActionLead = kanbanV30StageActionLead(
          items[0],
          stage,
          stages[stageIndex + 1],
          effectiveKanbanLens,
        );
        const validValue = items.reduce(
          (sum, lead) => sum + validLeadValue(lead.budget_max),
          0,
        );
        const decisionHeader = buildKanbanStageDecisionHeader({
          stageLabel: stage.label,
          volume: items.length,
          validValue,
          urgent: health.urgent,
          noAction: health.noAction,
          stalled: health.stalled,
          hot: health.hot,
        });
        return {
          ...stage,
          items,
          value: validValue,
          health,
          decision,
          decisionHeader,
          microcopy,
          v30Command,
          stageActionLead,
        };
      }),
    [effectiveKanbanLens, leadsByStage, stages],
  );
  const boardStages = useMemo(
    () =>
      hideEmpty
        ? stageData.filter((stage) => stage.items.length > 0)
        : stageData,
    [hideEmpty, stageData],
  );
  const expandedEmptyStageKeys = useMemo(() => {
    const keys = new Set<StageKey>();
    if (emptyStageIntentKey) keys.add(emptyStageIntentKey);
    if (dragOverStage) keys.add(dragOverStage);
    if (movementIntentPreviousStage) keys.add(movementIntentPreviousStage.key);
    if (movementIntentNextStage) keys.add(movementIntentNextStage.key);
    if (draggedId) {
      boardStages.forEach((stage) => {
        if (stage.items.length === 0) keys.add(stage.key);
      });
    }
    return keys;
  }, [
    boardStages,
    draggedId,
    dragOverStage,
    emptyStageIntentKey,
    movementIntentNextStage,
    movementIntentPreviousStage,
  ]);
  const kanbanTrackTemplate = boardStages
    .map((stage) =>
      stage.items.length === 0 && !expandedEmptyStageKeys.has(stage.key)
        ? "minmax(148px, 0.46fr)"
        : "minmax(270px, 1fr)",
    )
    .join(" ");
  const kanbanBoardMinimumWidth = boardStages.reduce(
    (width, stage) =>
      width +
      (stage.items.length === 0 && !expandedEmptyStageKeys.has(stage.key)
        ? 148
        : 270),
    Math.max(0, boardStages.length - 1) * 12,
  );
  const kanbanV30DetailPreview = useMemo<KanbanV30DetailPreview | null>(() => {
    const lead = previewLeadId ? leadById.get(previewLeadId) : null;
    if (!lead) return null;

    const stage =
      stageByKey.get((lead.status ?? "novo") as StageKey) || stages[0];
    if (!stage) return null;
    const stageIndex = stageIndexByKey.get(stage.key) ?? -1;

    const guidance = brokerGuidance(lead);
    const snapshot = kanbanV30CardSnapshot(
      lead,
      guidance,
      stage,
      stageIndex >= 0 ? stages[stageIndex + 1] : undefined,
      effectiveKanbanLens,
    );
    const contact = phoneLinks(lead.phone);

    return {
      contactCall: contact?.call ?? null,
      contactWhatsApp: contact?.whatsapp ?? null,
      facts: [
        ...snapshot.facts,
        { label: "Origem", value: lead.source || "Não informada" },
        {
          label: "Região",
          value: lead.preferred_regions?.join(", ") || "A definir",
        },
      ].slice(0, 5),
      guidanceReason: guidance.reason,
      lead,
      nextStage: snapshot.nextStage,
      playbook: kanbanActionPlaybook(lead).slice(0, 3),
      primaryAction: snapshot.primaryAction,
      risk: leadRisk(lead),
      secondaryAction: snapshot.secondaryAction,
      stage,
      title: snapshot.headline,
      tone: snapshot.tone,
    };
  }, [
    effectiveKanbanLens,
    leadById,
    previewLeadId,
    stageByKey,
    stageIndexByKey,
    stages,
  ]);
  const stageBottleneckRanking = useMemo(
    () =>
      stageData
        .filter((stage) => stage.items.length > 0)
        .map((stage) => {
          const pressure =
            stage.health.urgent * 5 +
            stage.health.stalled * 3 +
            stage.health.noAction * 2 +
            Math.min(stage.items.length, 20);
          const tone: LeadSignalTone =
            stage.health.urgent > 0
              ? "danger"
              : stage.health.stalled > 0 || stage.health.noAction > 0
                ? "warning"
                : stage.health.hot > 0
                  ? "success"
                  : "info";
          const action =
            stage.health.urgent > 0
              ? "Resolver urgências"
              : stage.health.stalled > 0
                ? "Destravar parados"
                : stage.health.noAction > 0
                  ? "Agendar ações"
                  : stage.health.hot > 0
                    ? "Avançar quentes"
                    : "Monitorar";
          const guide = bottleneckRoleGuide(effectiveKanbanLens, {
            action,
            count: stage.items.length,
            label: stage.label,
            noAction: stage.health.noAction,
            stalled: stage.health.stalled,
            urgent: stage.health.urgent,
            waitLabel: stageStallLabelFromHours(stage.health.maxStallHours),
          });

          return {
            action,
            count: stage.items.length,
            focus:
              stage.health.urgent > 0
                ? ("sla" as FocusKey)
                : stage.health.stalled > 0
                  ? ("atrasadas" as FocusKey)
                  : stage.health.noAction > 0
                    ? ("sem_acao" as FocusKey)
                    : stage.health.hot > 0
                      ? ("quentes" as FocusKey)
                      : ("prioridade" as FocusKey),
            guideDetail: guide.detail,
            guideLabel: guide.label,
            hot: stage.health.hot,
            key: stage.key,
            label: stage.label,
            noAction: stage.health.noAction,
            pressure,
            stalled: stage.health.stalled,
            tone,
            urgent: stage.health.urgent,
            waitLabel: stageStallLabelFromHours(stage.health.maxStallHours),
          };
        })
        .sort((a, b) => b.pressure - a.pressure)
        .slice(0, 3),
    [effectiveKanbanLens, stageData],
  );

  const pipelineExperience = useMemo(() => {
    const topBottleneck = stageBottleneckRanking[0];

    if (pipelineQuality.urgent > 0) {
      return {
        cta: "Filtrar urgências",
        detail: `${pipelineQuality.urgent} lead(s) com SLA ou ação vencida. O corretor precisa de uma fila curta, clara e executável.`,
        focus: "sla" as FocusKey,
        label: "Atendimento crítico",
        stage: topBottleneck?.key,
        title: "Comece pelo que pode esfriar agora",
        tone: "danger" as LeadSignalTone,
      };
    }

    if (pipelineQuality.withoutNextAction > 0) {
      return {
        cta: "Ver sem ação",
        detail: `${pipelineQuality.withoutNextAction} lead(s) precisam de compromisso futuro. Sem próxima ação, a IA perde previsibilidade.`,
        focus: "sem_acao" as FocusKey,
        label: "Cadência comercial",
        stage: topBottleneck?.key,
        title: "Feche as próximas ações antes de mover cards",
        tone: "warning" as LeadSignalTone,
      };
    }

    if (metrics.hot > 0) {
      return {
        cta: "Ver quentes",
        detail: `${metrics.hot} oportunidade(s) com alta intenção. A melhor experiência é acelerar visita, proposta ou reserva.`,
        focus: "quentes" as FocusKey,
        label: "Oportunidade ativa",
        stage: topBottleneck?.key,
        title: "Acelere quem já demonstrou intenção",
        tone: "success" as LeadSignalTone,
      };
    }

    return {
      cta: "Ver prioridade",
      detail:
        "O quadro está saudável. Trabalhe a fila inteligente e registre resultado para ampliar a memória da IA.",
      focus: "prioridade" as FocusKey,
      label: "Operação em controle",
      stage: topBottleneck?.key,
      title: "Execute com ritmo e baixa fricção",
      tone: "info" as LeadSignalTone,
    };
  }, [
    metrics.hot,
    pipelineQuality.urgent,
    pipelineQuality.withoutNextAction,
    stageBottleneckRanking,
  ]);

  const activeMobileStage = boardStages.some(
    (stage) => stage.key === mobileStage,
  )
    ? mobileStage
    : boardStages[0]?.key;
  const activeMobileStageData = useMemo(
    () =>
      boardStages.find((stage) => stage.key === activeMobileStage) ||
      boardStages[0],
    [activeMobileStage, boardStages],
  );
  const kanbanV30MobileDecision = useMemo<KanbanV30MobileDecision>(() => {
    const stage = activeMobileStageData;
    const stageLabel = stage?.label || "Pipeline";
    const candidate = stage?.stageActionLead?.lead || stage?.items[0];

    if (candidate) {
      const contact = phoneLinks(candidate.phone);
      const score = Number(candidate.score ?? 0);
      const tone: LeadSignalTone =
        firstContactSla(candidate)?.overdue || isNextActionOverdue(candidate)
          ? "danger"
          : score >= 70 || candidate.temperature === "quente"
            ? "success"
            : !candidate.next_action_at
              ? "warning"
              : "info";

      return {
        actionHref:
          stage?.stageActionLead?.actionHref ||
          contact?.whatsapp ||
          executionIntentUrl(candidate, "task"),
        actionLabel:
          stage?.stageActionLead?.actionLabel ||
          (contact ? "WhatsApp agora" : "Criar ação"),
        detail: `${candidate.name || "Lead sem nome"} · ${candidate.temperature || "frio"} · score ${candidate.score ?? 0}`,
        external: Boolean(stage?.stageActionLead?.external || contact),
        lead: candidate,
        stageLabel,
        targetStage: stage?.stageActionLead?.targetStage,
        title: stage?.stageActionLead?.detail || "Executar próxima melhor ação",
        tone,
      };
    }

    return {
      actionHref: "/leads/new",
      actionLabel: "Novo lead",
      detail:
        "Nenhuma oportunidade visível nesta etapa. Cadastre, reative ou limpe filtros para recuperar o fluxo.",
      external: false,
      stageLabel,
      title: "Etapa pronta para operar",
      tone: "info",
    };
  }, [activeMobileStageData]);
  const kanbanRecoveryState = useMemo<KanbanV30RecoveryState | null>(() => {
    if (loading) return null;
    if (error) {
      return {
        action: "Recarregar pipeline",
        detail:
          "A sessão permanece protegida. Tente recarregar o quadro ou abra a base de leads enquanto o Atlas registra a inconsistência.",
        mode: "error",
        steps: [
          "Sessão preservada",
          "Dados protegidos",
          "Nova tentativa segura",
        ],
        title: "O Kanban não confirmou os dados agora",
        tone: "danger",
      };
    }

    if (leads.length === 0) {
      return {
        action: "Criar primeiro lead",
        detail:
          "Cadastre ou importe leads para o Atlas montar prioridade, score, SLA e próxima ação automaticamente.",
        mode: "empty_base",
        steps: [
          "Cadastrar lead",
          "Distribuir responsável",
          "Registrar próxima ação",
        ],
        title: "Pipeline pronto para receber oportunidades",
        tone: "info",
      };
    }

    if (visibleLeads.length === 0) {
      return {
        action: "Limpar filtros",
        detail: `Existem ${leads.length} lead(s) na base, mas a busca, o foco ou o recorte atual esconderam o quadro.`,
        mode: "empty_filter",
        steps: [
          query.trim() ? "Busca restringindo resultado" : "Busca livre",
          `Foco atual: ${KANBAN_FOCUS_LABEL[focus]}`,
          "Voltar para prioridade",
        ],
        title: "Nenhum card no recorte atual",
        tone: "warning",
      };
    }

    if (boardStages.length === 0) {
      return {
        action: "Mostrar todas as etapas",
        detail:
          "A visão está mostrando apenas etapas com cards; ao limpar o recorte, o Kanban volta a exibir o funil completo.",
        mode: "empty_board",
        steps: [
          "Etapas vazias ocultas",
          "Foco pode estar restrito",
          "Funil completo preservado",
        ],
        title: "As etapas ativas foram ocultadas",
        tone: "warning",
      };
    }

    return null;
  }, [
    boardStages.length,
    error,
    focus,
    leads.length,
    loading,
    query,
    visibleLeads.length,
  ]);
  const kanbanA11yStatus = useMemo(() => {
    if (movementFeedback?.state === "saving")
      return `Movendo ${movementFeedback.leadName}: ${pipelineStageLabel(movementFeedback.from, stages)} para ${pipelineStageLabel(movementFeedback.to, stages)}.`;
    if (movementFeedback?.state === "success")
      return `Etapa atualizada para ${movementFeedback.leadName}: ${pipelineStageLabel(movementFeedback.from, stages)} para ${pipelineStageLabel(movementFeedback.to, stages)}.`;
    if (movementFeedback?.state === "error")
      return `Movimento não confirmado para ${movementFeedback.leadName}. A etapa anterior foi restaurada.`;
    if (draggedLead)
      return dragTargetStage
        ? `Movendo ${draggedLead.name || "lead"} para ${dragTargetStage.label}.`
        : `Movendo ${draggedLead.name || "lead"}. Escolha uma etapa para soltar.`;
    if (kanbanRecoveryState)
      return `${kanbanRecoveryState.title}. ${kanbanRecoveryState.action}.`;
    return `Kanban pronto com ${visibleOpenLeadCount} oportunidades visíveis em ${boardStages.length} etapas.`;
  }, [
    boardStages.length,
    dragTargetStage,
    draggedLead,
    kanbanRecoveryState,
    movementFeedback,
    movingLead,
    savingId,
    stages,
    visibleOpenLeadCount,
  ]);
  const kanbanLensQueue = useMemo(() => {
    return visibleLeads
      .filter(isOpenLead)
      .map((lead) => {
        const stage = stageByKey.get((lead.status ?? "novo") as StageKey);
        const stageProbability = stage?.probability ?? 5;
        const guidance = brokerGuidance(lead);
        return {
          guidance,
          lead,
          label: kanbanLensRankLabel(
            lead,
            effectiveKanbanLens,
            stageProbability,
          ),
          rank: kanbanLensPriorityWeight(
            lead,
            effectiveKanbanLens,
            stageProbability,
          ),
          stage,
        };
      })
      .sort((a, b) => {
        const lensDelta = b.rank - a.rank;
        if (lensDelta !== 0) return lensDelta;
        return priorityWeight(b.lead) - priorityWeight(a.lead);
      })
      .slice(0, 5);
  }, [effectiveKanbanLens, stageByKey, visibleLeads]);
  const dailyFocus = useMemo(
    () =>
      kanbanLensQueue
        .slice(0, KANBAN_VISIBLE_PRIORITY_LIMIT)
        .map((item) => item.lead),
    [kanbanLensQueue],
  );
  const priorityCandidateCount = visibleOpenLeadCount;

  const kanbanFocusStrip = useMemo<KanbanFocusItem[]>(() => {
    const open = leads.filter(isOpenLead);
    const urgent = open.filter(
      (lead) => firstContactSla(lead)?.overdue || isNextActionOverdue(lead),
    );
    const hotWithoutAction = open.filter(
      (lead) =>
        (lead.temperature === "quente" || Number(lead.score ?? 0) >= 70) &&
        !lead.next_action_at,
    );
    const proposals = open.filter(
      (lead) => (lead.status ?? "novo") === "proposta",
    );
    const pressureStage = stageData
      .filter((stage) => stage.items.length > 0)
      .map((stage) => ({
        stage,
        pressure:
          stage.health.urgent * 4 +
          stage.health.noAction * 2 +
          stage.health.hot +
          stage.items.length,
      }))
      .sort((a, b) => b.pressure - a.pressure)[0]?.stage;

    return [
      {
        key: "urgencias",
        label: "Resolver agora",
        value: urgent.length,
        detail: urgent.length
          ? "SLA ou follow-up vencido"
          : "Sem urgência crítica",
        tone: urgent.length ? "danger" : "success",
        action: urgent.length ? "Filtrar urgências" : "Manter cadência",
        focus: urgent.length ? "sla" : "prioridade",
      },
      {
        key: "quentes-sem-acao",
        label: "Quentes sem ação",
        value: hotWithoutAction.length,
        detail: hotWithoutAction.length
          ? "Alta prioridade precisa compromisso"
          : "Quentes protegidos",
        tone: hotWithoutAction.length ? "warning" : "success",
        action: "Ver oportunidades",
        focus: hotWithoutAction.length ? "sem_acao" : "quentes",
      },
      {
        key: "propostas",
        label: "Fechar propostas",
        value: proposals.length,
        detail: proposals.length
          ? "Validar objeção, fluxo e prazo"
          : "Sem proposta parada",
        tone: proposals.length ? "info" : "success",
        action: "Abrir propostas",
        focus: "todas",
        stage: "proposta",
      },
      {
        key: "gargalo",
        label: "Gargalo do funil",
        value: pressureStage?.items.length ?? 0,
        detail: pressureStage
          ? `${pressureStage.label}: ${pressureStage.decision.label}`
          : "Etapas sem pressão",
        tone:
          pressureStage?.decision.tone === "danger"
            ? "danger"
            : pressureStage?.decision.tone === "warning"
              ? "warning"
              : pressureStage
                ? "info"
                : "success",
        action: pressureStage ? "Abrir etapa" : "Ver quadro",
        focus: "prioridade",
        stage: pressureStage?.key,
      },
    ];
  }, [leads, stageData]);

  const focusOptions = useMemo(() => {
    const open = leads.filter(isOpenLead);
    return [
      {
        key: "prioridade" as const,
        label: "Minha prioridade",
        count: open.filter(
          (lead) =>
            firstContactSla(lead)?.overdue ||
            isNextActionOverdue(lead) ||
            !lead.next_action_at ||
            lead.temperature === "quente" ||
            Number(lead.score ?? 0) >= 70 ||
            leadRisk(lead) === "alto",
        ).length,
      },
      {
        key: "sla" as const,
        label: "SLA vencido",
        count: open.filter((lead) => firstContactSla(lead)?.overdue).length,
      },
      {
        key: "atrasadas" as const,
        label: "Ações atrasadas",
        count: open.filter(isNextActionOverdue).length,
      },
      {
        key: "sem_acao" as const,
        label: "Sem próxima ação",
        count: open.filter((lead) => !lead.next_action_at).length,
      },
      {
        key: "quentes" as const,
        label: "Leads quentes",
        count: open.filter(
          (lead) =>
            lead.temperature === "quente" || Number(lead.score ?? 0) >= 70,
        ).length,
      },
      { key: "todas" as const, label: "Todos", count: leads.length },
    ];
  }, [leads]);

  const pipelineAttention = useMemo(() => {
    const open = Array.from(
      new Map(
        leads.filter(isOpenLead).map((lead) => [lead.id, lead] as const),
      ).values(),
    );
    const critical = open.filter(
      (lead) => firstContactSla(lead)?.overdue || isNextActionOverdue(lead),
    );
    const needsDecision = open.filter(
      (lead) =>
        firstContactSla(lead)?.overdue ||
        isNextActionOverdue(lead) ||
        !lead.next_action_at ||
        leadRisk(lead) === "alto",
    );
    const hotUnprotected = open.filter(
      (lead) =>
        (lead.temperature === "quente" || Number(lead.score ?? 0) >= 70) &&
        !lead.next_action_at,
    );
    const valueAtRisk = needsDecision.reduce(
      (total, lead) => total + Number(lead.budget_max ?? lead.budget_min ?? 0),
      0,
    );

    return {
      critical: critical.length,
      hotUnprotected: hotUnprotected.length,
      needsDecision: needsDecision.length,
      valueAtRisk,
    };
  }, [leads]);

  const decisionCommand = useMemo(() => {
    if (metrics.firstContactOverdue > 0) {
      return {
        compact: true,
        focus: "sla" as FocusKey,
        focusMode: true,
        hideEmpty: true,
        sort: "prioridade" as SortKey,
        tone: "critical",
        label: "Recuperar primeiro contato agora",
        detail: `${metrics.firstContactOverdue} lead(s) já passaram do SLA inicial. Priorize contato humano antes de olhar o restante do quadro.`,
        actionLabel: "Filtrar SLA",
        metricLabel: "SLA vencido",
        primaryCount: metrics.firstContactOverdue,
      };
    }
    if (pipelineAttention.critical > 0) {
      return {
        compact: true,
        focus: "atrasadas" as FocusKey,
        focusMode: true,
        hideEmpty: true,
        sort: "prioridade" as SortKey,
        tone: "critical",
        label: "Retomar compromissos vencidos",
        detail: `${pipelineAttention.critical} lead(s) distintos têm SLA ou próxima ação vencida. Resolva o combinado antes de analisar o restante do funil.`,
        actionLabel: "Abrir atrasadas",
        metricLabel: "atrasos únicos",
        primaryCount: pipelineAttention.critical,
      };
    }
    if (pipelineAttention.needsDecision > 0) {
      return {
        compact: true,
        focus: "prioridade" as FocusKey,
        focusMode: true,
        hideEmpty: true,
        sort: "prioridade" as SortKey,
        tone: "risk",
        label: "Destravar oportunidades em risco",
        detail: `${pipelineAttention.needsDecision} lead(s) distintos exigem decisão por atraso, risco ou falta de próxima ação. A fila abaixo já ordena quem vem primeiro.`,
        actionLabel: "Ver prioridade",
        metricLabel: "exigem decisão",
        primaryCount: pipelineAttention.needsDecision,
      };
    }
    if (metrics.hot > 0) {
      return {
        compact: true,
        focus: "quentes" as FocusKey,
        focusMode: true,
        hideEmpty: true,
        sort: "score" as SortKey,
        tone: "hot",
        label: "Avançar leads quentes para visita ou proposta",
        detail: `${metrics.hot} lead(s) têm temperatura alta ou score forte. Use o contexto do Copilot e leve para a próxima etapa com velocidade.`,
        actionLabel: "Filtrar quentes",
        metricLabel: "quentes",
        primaryCount: metrics.hot,
      };
    }
    if (dailyFocus.length > 0) {
      return {
        compact: true,
        focus: "prioridade" as FocusKey,
        focusMode: true,
        hideEmpty: true,
        sort: "prioridade" as SortKey,
        tone: "calm",
        label: "Executar a fila de hoje com calma",
        detail:
          "Sem alerta crítico no recorte atual. Siga as três melhores próximas ações e registre o resultado para alimentar a inteligência.",
        actionLabel: "Começar pela fila",
        metricLabel: "ações agora",
        primaryCount: dailyFocus.length,
      };
    }
    return {
      compact: false,
      focus: "prioridade" as FocusKey,
      focusMode: false,
      hideEmpty: false,
      sort: "recente" as SortKey,
      tone: "calm",
      label: "Pipeline sem urgência operacional",
      detail:
        "Mantenha cadência, revise tarefas e confirme se novos leads estão entrando com origem e projeto corretos.",
      actionLabel: "Revisar rotina",
      metricLabel: "ações agora",
      primaryCount: 0,
    };
  }, [
    dailyFocus.length,
    metrics.firstContactOverdue,
    metrics.hot,
    pipelineAttention.critical,
    pipelineAttention.needsDecision,
  ]);

  const pipelineV30Decision = useMemo(() => {
    const open = leads.filter(isOpenLead);
    const urgent = open
      .filter(
        (lead) => firstContactSla(lead)?.overdue || isNextActionOverdue(lead),
      )
      .sort((a, b) => priorityWeight(b) - priorityWeight(a));
    const hot = open
      .filter(
        (lead) =>
          lead.temperature === "quente" || Number(lead.score ?? 0) >= 70,
      )
      .sort((a, b) => priorityWeight(b) - priorityWeight(a));
    const withoutNextAction = open
      .filter((lead) => !lead.next_action_at)
      .sort((a, b) => priorityWeight(b) - priorityWeight(a));
    const proposals = open
      .filter((lead) => (lead.status ?? "novo") === "proposta")
      .sort((a, b) => Number(b.budget_max ?? 0) - Number(a.budget_max ?? 0));
    const primaryLead =
      urgent[0] ||
      hot[0] ||
      withoutNextAction[0] ||
      proposals[0] ||
      open[0] ||
      null;
    const primaryGuidance = primaryLead ? brokerGuidance(primaryLead) : null;
    const primaryStage = primaryLead
      ? stages.find((stage) => stage.key === (primaryLead.status ?? "novo"))
      : null;
    const primaryContact = primaryLead ? phoneLinks(primaryLead.phone) : null;
    const frictionScore = Math.min(
      100,
      Math.round(
        pipelineQuality.urgent * 14 +
          pipelineQuality.withoutNextAction * 4 +
          metrics.highRisk * 7,
      ),
    );
    const clarityScore = Math.max(
      0,
      Math.min(
        100,
        pipelineQuality.qualityScore - Math.round(frictionScore * 0.18),
      ),
    );
    const mode =
      urgent.length > 0
        ? {
            label: "Atendimento crítico",
            detail: "resolver atraso antes de analisar o restante",
            tone: "danger" as LeadSignalTone,
            focus: "sla" as FocusKey,
          }
        : withoutNextAction.length > 0
          ? {
              label: "Cadência descoberta",
              detail: "criar próxima ação para proteger a carteira",
              tone: "warning" as LeadSignalTone,
              focus: "sem_acao" as FocusKey,
            }
          : hot.length > 0
            ? {
                label: "Conversão ativa",
                detail: "avançar intenção quente para visita/proposta",
                tone: "success" as LeadSignalTone,
                focus: "quentes" as FocusKey,
              }
            : {
                label: "Fluxo sob controle",
                detail: "manter ritmo e registrar aprendizados",
                tone: "info" as LeadSignalTone,
                focus: "prioridade" as FocusKey,
              };

    return {
      actions: [
        {
          cta: urgent.length ? "Atacar atrasos" : "Manter SLA",
          detail: urgent.length
            ? "SLA/follow-up vencido"
            : "sem vencimento crítico",
          focus: urgent.length
            ? ("sla" as FocusKey)
            : ("prioridade" as FocusKey),
          label: "Responder",
          tone: urgent.length
            ? ("danger" as LeadSignalTone)
            : ("success" as LeadSignalTone),
          value: urgent.length,
        },
        {
          cta: hot.length ? "Avançar quentes" : "Buscar oportunidade",
          detail: "score alto ou temperatura quente",
          focus: hot.length
            ? ("quentes" as FocusKey)
            : ("prioridade" as FocusKey),
          label: "Converter",
          tone: hot.length
            ? ("success" as LeadSignalTone)
            : ("info" as LeadSignalTone),
          value: hot.length,
        },
        {
          cta: withoutNextAction.length
            ? "Agendar agora"
            : "Carteira protegida",
          detail: "sem compromisso futuro",
          focus: withoutNextAction.length
            ? ("sem_acao" as FocusKey)
            : ("prioridade" as FocusKey),
          label: "Proteger",
          tone: withoutNextAction.length
            ? ("warning" as LeadSignalTone)
            : ("success" as LeadSignalTone),
          value: withoutNextAction.length,
        },
        {
          cta: proposals.length ? "Fechar proposta" : "Criar proposta",
          detail: "etapa de maior decisão",
          focus: "todas" as FocusKey,
          label: "Fechar",
          stage: "proposta" as StageKey,
          tone: proposals.length
            ? ("info" as LeadSignalTone)
            : ("success" as LeadSignalTone),
          value: proposals.length,
        },
      ],
      clarityScore,
      frictionScore,
      mode,
      primaryContact,
      primaryGuidance,
      primaryLead,
      primaryStage,
    };
  }, [
    leads,
    metrics.highRisk,
    pipelineQuality.qualityScore,
    pipelineQuality.urgent,
    pipelineQuality.withoutNextAction,
    stages,
  ]);

  const kanbanV30NextMoveQueue = useMemo<KanbanV30NextMoveItem[]>(() => {
    const open = visibleLeads.filter(isOpenLead);

    return open
      .map((lead) => {
        const stageIndex =
          stageIndexByKey.get((lead.status || "novo") as StageKey) ?? -1;
        const stage = stageIndex >= 0 ? stages[stageIndex] : undefined;
        const nextStage = stageIndex >= 0 ? stages[stageIndex + 1] : undefined;
        const sla = firstContactSla(lead);
        const score = Number(lead.score ?? 0);
        const budget = Number(lead.budget_max ?? 0);
        const hot = lead.temperature === "quente" || score >= 70;
        const noAction = !lead.next_action_at;
        const nextOverdue = isNextActionOverdue(lead);
        const stageHours = stageStallHours(lead);
        const proposal = (lead.status ?? "novo") === "proposta";
        const stageProbability = stage?.probability ?? 5;
        const baseWeight = kanbanLensPriorityWeight(
          lead,
          effectiveKanbanLens,
          stageProbability,
        );
        let item: Omit<
          KanbanV30NextMoveItem,
          "lead" | "stageLabel" | "valueLabel" | "weight"
        >;
        let boost = 0;

        if (sla?.overdue) {
          item = {
            actionLabel: "Responder em 1 toque",
            copilotIntent: "follow_up",
            decision: "Contato antes de mover",
            executionIntent: "task",
            focus: "sla",
            key: `${lead.id}-sla`,
            nextStage,
            priority: "critical",
            reason:
              "SLA inicial vencido: a lead esfria se virar apenas mais um card no quadro.",
            signal: "SLA vencido",
          };
          boost = 900;
        } else if (nextOverdue) {
          item = {
            actionLabel: "Retomar combinado",
            copilotIntent: "follow_up",
            decision: "Reabrir conversa",
            executionIntent: "task",
            focus: "atrasadas",
            key: `${lead.id}-follow-up`,
            nextStage,
            priority: "critical",
            reason: `Próxima ação venceu em ${dateLabel(lead.next_action_at)}. O corretor precisa registrar resultado ou reagendar.`,
            signal: "Follow-up vencido",
          };
          boost = 780;
        } else if (proposal) {
          item = {
            actionLabel: "Fechar objeção",
            copilotIntent: "objections",
            decision: "Proposta precisa de decisão",
            executionIntent: "proposal",
            focus: "todas",
            key: `${lead.id}-proposal`,
            nextStage,
            priority: "high",
            reason:
              "Proposta aberta deve virar fechamento, ajuste de fluxo ou motivo claro de perda.",
            signal: "Proposta em aberto",
          };
          boost = 640;
        } else if (hot && noAction) {
          item = {
            actionLabel: "Agendar avanço",
            copilotIntent: "summary",
            decision: "Lead quente sem agenda",
            executionIntent: "calendar",
            focus: "sem_acao",
            key: `${lead.id}-hot-no-action`,
            nextStage,
            priority: "high",
            reason:
              "Score forte sem próximo compromisso é perda silenciosa de conversão.",
            signal: "Quente sem ação",
          };
          boost = 590;
        } else if (noAction) {
          item = {
            actionLabel: "Criar próxima ação",
            copilotIntent: "summary",
            decision: "Proteger cadência",
            executionIntent: "task",
            focus: "sem_acao",
            key: `${lead.id}-no-action`,
            nextStage,
            priority: "medium",
            reason:
              "Sem compromisso futuro, a oportunidade fica invisível para a rotina do corretor.",
            signal: "Sem próxima ação",
          };
          boost = 430;
        } else if (stageHours >= 72) {
          item = {
            actionLabel: "Destravar etapa",
            copilotIntent: "summary",
            decision: "Card parado demais",
            executionIntent: "task",
            focus: "prioridade",
            key: `${lead.id}-stalled`,
            nextStage,
            priority: "medium",
            reason: `${stageStallLabelFromHours(stageHours)}. O quadro precisa de avanço, pausa justificada ou perda registrada.`,
            signal: "Etapa travada",
          };
          boost = 320;
        } else {
          item = {
            actionLabel: hot ? "Avançar com contexto" : "Manter ritmo",
            copilotIntent: hot ? "follow_up" : "summary",
            decision: hot ? "Acelerar oportunidade" : "Acompanhar sem ruído",
            executionIntent: hot ? "calendar" : "task",
            focus: hot ? "quentes" : "prioridade",
            key: `${lead.id}-watch`,
            nextStage,
            priority: hot ? "high" : "watch",
            reason: hot
              ? "Sinal comercial forte: transforme intenção em visita, proposta ou decisão."
              : "Oportunidade em cadência; mantenha registro para a IA aprender.",
            signal: hot ? "Sinal forte" : "Cadência ativa",
          };
          boost = hot ? 260 : 80;
        }

        return {
          ...item,
          lead,
          stageLabel:
            stage?.label ||
            pipelineStageLabel((lead.status ?? "novo") as StageKey, stages),
          valueLabel: budget ? brl.format(budget) : "Valor não informado",
          weight: baseWeight + boost + budget / 100_000 + score,
        };
      })
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 4);
  }, [effectiveKanbanLens, stageIndexByKey, stages, visibleLeads]);

  const kanbanV30Heatline = useMemo<KanbanV30HeatlineItem[]>(
    () =>
      kanbanV30NextMoveQueue.map((item, index) => ({
        ...item,
        currentStage: (item.lead.status ?? "novo") as StageKey,
        rank: index + 1,
        tone: KANBAN_V30_PRIORITY_TONE[item.priority],
      })),
    [kanbanV30NextMoveQueue],
  );

  const kanbanV30PriorityIndex = useMemo(
    () =>
      new Map<string, KanbanV30PrioritySignal>(
        kanbanV30Heatline.map((item) => [
          item.lead.id,
          {
            label: item.signal,
            priority: item.priority,
            rank: item.rank,
            tone: item.tone,
          },
        ]),
      ),
    [kanbanV30Heatline],
  );

  useEffect(() => {
    setKanbanV30BatchSelection((current) => {
      const heatlineIds = new Set(
        kanbanV30Heatline.map((item) => item.lead.id),
      );
      const preserved = current
        .filter((leadId) => heatlineIds.has(leadId))
        .slice(0, 4);
      if (preserved.length > 0) return preserved;
      return kanbanV30Heatline.slice(0, 3).map((item) => item.lead.id);
    });
  }, [kanbanV30Heatline]);

  const kanbanV30BatchItems = useMemo(
    () =>
      kanbanV30Heatline.filter((item) =>
        kanbanV30BatchSelection.includes(item.lead.id),
      ),
    [kanbanV30BatchSelection, kanbanV30Heatline],
  );

  const kanbanV30BatchSummary = useMemo(() => {
    const leadIds = kanbanV30BatchItems.map((item) => item.lead.id);
    const estimatedValue = kanbanV30BatchItems.reduce(
      (total, item) =>
        total + (item.lead.budget_max ?? item.lead.budget_min ?? 0),
      0,
    );
    const critical = kanbanV30BatchItems.filter(
      (item) => item.priority === "critical",
    ).length;
    const stagesCount = new Set(
      kanbanV30BatchItems.map((item) => item.currentStage),
    ).size;

    return {
      count: kanbanV30BatchItems.length,
      critical,
      leadIds,
      query: encodeURIComponent(leadIds.join(",")),
      stagesCount,
      valueLabel:
        estimatedValue > 0 ? brl.format(estimatedValue) : "Valor não informado",
    };
  }, [kanbanV30BatchItems]);

  const kanbanV30BatchHasSelection = kanbanV30BatchSummary.count > 0;

  const kanbanV30QualificationMatrix = useMemo(() => {
    const matrix = new Map<
      string,
      {
        count: number;
        impact: string;
        key: string;
        label: string;
        leadNames: string[];
        question: string;
      }
    >();

    for (const item of kanbanV30BatchItems) {
      for (const missing of missingLeadData(item.lead)) {
        const signal = KANBAN_V30_QUALIFICATION_SIGNAL[missing] ?? {
          impact: "Completa a memória comercial antes da próxima decisão.",
          label: missing,
          question: `Confirmar ${missing}`,
        };
        const current = matrix.get(missing) ?? {
          ...signal,
          count: 0,
          key: missing,
          leadNames: [],
        };
        current.count += 1;
        current.leadNames.push(item.lead.name || "Lead sem nome");
        matrix.set(missing, current);
      }
    }

    const signals = Array.from(matrix.values()).sort(
      (a, b) => b.count - a.count,
    );
    const totalPossible = Math.max(
      1,
      kanbanV30BatchItems.length *
        Object.keys(KANBAN_V30_QUALIFICATION_SIGNAL).length,
    );
    const missingTotal = signals.reduce(
      (total, signal) => total + signal.count,
      0,
    );
    const coverage = Math.max(
      0,
      Math.min(
        100,
        Math.round(((totalPossible - missingTotal) / totalPossible) * 100),
      ),
    );

    return {
      coverage,
      missingTotal,
      signals: signals.slice(0, 4),
    };
  }, [kanbanV30BatchItems]);

  const kanbanV30ConversionBrief = useMemo(() => {
    const primary = kanbanV30BatchItems[0];
    const primaryGap = kanbanV30QualificationMatrix.signals[0];
    const hotCount = kanbanV30BatchItems.filter(
      (item) =>
        item.lead.temperature === "quente" ||
        Number(item.lead.score ?? 0) >= 70,
    ).length;
    const urgentCount = kanbanV30BatchItems.filter(
      (item) =>
        firstContactSla(item.lead)?.overdue || isNextActionOverdue(item.lead),
    ).length;
    const preferredChannel = primary
      ? primaryContactLabel(primary.lead)
      : "Definir canal";
    const intent = primaryGap
      ? "Qualificar antes de propor"
      : urgentCount > 0
        ? "Retomar compromisso"
        : hotCount > 0
          ? "Converter oportunidade quente"
          : "Criar próxima ação";
    const opening = primaryGap
      ? `${primaryGap.question} Isso ajuda a separar as melhores opções sem mandar algo fora do perfil.`
      : hotCount > 0
        ? "Tenho uma opção alinhada ao seu perfil e queria validar se faz sentido avançarmos para tabela, simulação ou visita."
        : "Estou organizando seu atendimento para te mostrar opções mais certeiras. Posso confirmar alguns pontos rápidos?";
    const tone: LeadSignalTone = primaryGap
      ? "warning"
      : hotCount > 0
        ? "success"
        : urgentCount > 0
          ? "danger"
          : "info";

    return {
      href: primary
        ? copilotIntentUrl(
            primary.lead,
            primaryGap ? "summary" : hotCount > 0 ? "follow_up" : "objections",
          )
        : "/leads/actions",
      intent,
      leadLabel: primary?.lead.name || "Lote prioritário",
      steps: [
        { detail: opening, label: "Primeira fala" },
        { detail: preferredChannel, label: "Canal indicado" },
        {
          detail: primaryGap
            ? "Registrar resposta e atualizar qualidade antes de proposta."
            : "Sair com próxima ação datada: visita, simulação ou envio de tabela.",
          label: "Saída esperada",
        },
      ],
      tone,
    };
  }, [kanbanV30BatchItems, kanbanV30QualificationMatrix]);

  const kanbanV30AssistedExecutionRunway = useMemo(() => {
    const primary = kanbanV30BatchItems[0]?.lead;
    const hasQualificationGap = kanbanV30QualificationMatrix.missingTotal > 0;
    const selectionQuery = kanbanV30BatchSummary.query;

    return [
      {
        cta: hasQualificationGap ? "Completar dados" : "Abrir Lead 360",
        detail: hasQualificationGap
          ? `${kanbanV30QualificationMatrix.missingTotal} sinais faltando antes de proposta.`
          : "Contexto mínimo pronto para abordagem.",
        href: hasQualificationGap
          ? `/leads/data-quality?source=kanban-v30&leadIds=${selectionQuery}`
          : primary
            ? `/leads/${primary.id}`
            : "/leads",
        label: "Revisar contexto",
        status: hasQualificationGap ? "Atenção" : "Pronto",
      },
      {
        cta: "Preparar fala",
        detail: kanbanV30ConversionBrief.intent,
        href: kanbanV30ConversionBrief.href,
        label: "Preparar contato",
        status:
          kanbanV30ConversionBrief.tone === "success" ? "Quente" : "Assistido",
      },
      {
        cta: "Criar tarefa",
        detail: "Salvar compromisso para impedir lead esquecido no funil.",
        href: `/tasks?source=kanban-v30&leadIds=${selectionQuery}`,
        label: "Agendar próxima ação",
        status: "Obrigatório",
      },
      {
        cta: "Registrar saída",
        detail: "Registrar visita, simulação, proposta ou motivo de descarte.",
        href: `/leads/actions?source=kanban-v30&intent=execution_result&leadIds=${selectionQuery}`,
        label: "Fechar ciclo",
        status: "Aprendizado",
      },
    ];
  }, [
    kanbanV30BatchItems,
    kanbanV30BatchSummary.query,
    kanbanV30ConversionBrief,
    kanbanV30QualificationMatrix,
  ]);

  const kanbanV30BrokerFocus = useMemo(() => {
    const item = kanbanV30BatchItems[0] ?? kanbanV30Heatline[0];
    const lead = item?.lead;
    const contact = lead ? phoneLinks(lead.phone) : null;
    const projectLabel = lead
      ? leadProjectLabel(lead)
      : "Projeto não vinculado";

    return {
      actions: lead
        ? [
            { external: false, href: `/leads/${lead.id}`, label: "Lead 360" },
            {
              external: false,
              href: copilotIntentUrl(lead, item?.copilotIntent ?? "follow_up"),
              label: "Copilot",
            },
            contact
              ? { external: true, href: contact.whatsapp, label: "WhatsApp" }
              : {
                  external: false,
                  href: executionIntentUrl(lead, "task"),
                  label: "Criar tarefa",
                },
          ]
        : [],
      cta: contact ? "Abrir WhatsApp" : "Preparar mensagem",
      href: lead
        ? contact?.whatsapp || copilotIntentUrl(lead, "follow_up")
        : "/leads",
      item,
      lead,
      projectLabel,
      reason: item
        ? `${item.signal} · ${item.reason}`
        : "Sem lead prioritário no recorte atual.",
      title: lead?.name || "Nenhum foco ativo",
      valueLabel: item?.valueLabel || "Valor não informado",
    };
  }, [kanbanV30BatchItems, kanbanV30Heatline]);

  const kanbanLensOptions = useMemo(() => {
    const pressureStage = stageData
      .filter((stage) => stage.items.length > 0)
      .map((stage) => ({
        stage,
        pressure:
          stage.health.urgent * 4 +
          stage.health.noAction * 2 +
          stage.health.hot +
          stage.items.length,
      }))
      .sort((a, b) => b.pressure - a.pressure)[0]?.stage;

    return [
      {
        key: "auto" as const,
        label: "Automático",
        title: `Perfil ${KANBAN_LENS_LABEL[identityLens]}`,
        detail:
          "O Atlas ajusta a visão conforme o papel comercial autenticado.",
        action: "Usar meu perfil",
        tone: "info",
      },
      {
        key: "broker" as const,
        label: "Corretor",
        title: "Execução agora",
        detail: `${pipelineQuality.withoutNextAction} sem próxima ação · ${pipelineQuality.urgent} urgentes`,
        action: "Atender fila",
        tone: "success",
      },
      {
        key: "manager" as const,
        label: "Gerente",
        title: "Destravar gargalos",
        detail: pressureStage
          ? `${pressureStage.label}: ${pressureStage.decision.label}`
          : "Sem gargalo crítico visível",
        action: "Ver pressão",
        tone: "warning",
      },
      {
        key: "director" as const,
        label: "Diretor",
        title: "Decidir por receita",
        detail: `${metrics.open} abertos · ${brl.format(metrics.forecast)} forecast`,
        action: "Ver valor",
        tone: "violet",
      },
    ];
  }, [
    identityLens,
    metrics.forecast,
    metrics.open,
    pipelineQuality.urgent,
    pipelineQuality.withoutNextAction,
    stageData,
  ]);

  function applyKanbanLens(next: KanbanLensKey) {
    const effective = next === "auto" ? identityLens : next;
    const firstStage = stages[0]?.key || defaultStages[0]?.key || "novo";
    const pressureStage = stageData
      .filter((stage) => stage.items.length > 0)
      .map((stage) => ({
        stage,
        pressure:
          stage.health.urgent * 4 +
          stage.health.noAction * 2 +
          stage.health.hot +
          stage.items.length,
      }))
      .sort((a, b) => b.pressure - a.pressure)[0]?.stage;

    setKanbanLens(next);

    if (effective === "manager") {
      setFocus(
        pipelineQuality.urgent > 0
          ? "atrasadas"
          : pipelineQuality.withoutNextAction > 0
            ? "sem_acao"
            : "prioridade",
      );
      setSort("prioridade");
      setCompact(true);
      setFocusMode(true);
      setHideEmpty(true);
      setMobileStage(pressureStage?.key || firstStage);
      return;
    }

    if (effective === "director") {
      setFocus(metrics.hot > 0 ? "quentes" : "todas");
      setSort("valor");
      setCompact(true);
      setFocusMode(false);
      setHideEmpty(true);
      setMobileStage(
        stages.find((stage) => stage.key === "proposta")?.key ||
          pressureStage?.key ||
          firstStage,
      );
      return;
    }

    setFocus("prioridade");
    setSort("prioridade");
    setCompact(false);
    setFocusMode(true);
    setHideEmpty(false);
    setMobileStage(
      stages.find((stage) => stage.key === "novo")?.key || firstStage,
    );
  }

  function resetKanbanFilters() {
    setQuery("");
    setFocus("prioridade");
    setSort("prioridade");
    setHideEmpty(false);
    setFocusMode(true);
    setCompact(true);
    setMobileStage(stages[0]?.key || defaultStages[0]?.key || "novo");
  }

  function toggleKanbanV30BatchLead(leadId: string) {
    setKanbanV30BatchSelection((current) => {
      if (current.includes(leadId))
        return current.filter((id) => id !== leadId);
      return [...current, leadId].slice(-4);
    });
  }

  return (
    <div
      className="atlas-decision-page space-y-5 pb-8"
      data-reliable-state-contract={ATLAS_RELIABLE_STATE_CONTRACT}
      data-phase="37-pipeline-movement-workspace 102-decision-first-layout 108-decision-kanban 109-kanban-copilot-bridge 110-kanban-execution-handoff 112-kanban-action-playbook 113-kanban-focus-strip 116-kanban-role-lenses 125-pipeline-decision-os 128-pipeline-v30-kanban-decision-board 143-kanban-v30-recovery-states"
      data-pipeline-layout="movement-first"
      data-layout-principle="decision-first-ui"
      data-redesign="phase-125"
      data-v30-pipeline="decision-board"
    >
      <section
        className={`atlas-pipeline-hero atlas-grid-glow ${focusMode ? "is-focus-mode" : ""}`}
        data-page-header="decision"
        data-primary-action-count="1"
      >
        <Image
          className="atlas-pipeline-robot"
          src="/brand/atlas-robot-broker.png"
          alt="Robô-corretor Atlas acompanhando o pipeline comercial"
          width={210}
          height={315}
          priority
        />
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap gap-2">
              <AtlasBadge tone="success">PIPELINE AO VIVO</AtlasBadge>
              <AtlasBadge tone="info">{metrics.open} NEGÓCIOS</AtlasBadge>
              {pipelineScope.totalOperational > 0 ? (
                <AtlasBadge tone="info">
                  {pipelineScope.loaded}/{pipelineScope.totalOperational}{" "}
                  CARREGADOS
                </AtlasBadge>
              ) : null}
            </div>
            {/* prettier-ignore */}
            <h1 className="mt-3 text-3xl font-semibold tracking-[-.05em] text-white sm:text-5xl">Pipeline inteligente</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
              Menos quadro, mais decisão: o Atlas prioriza ações, mostra risco e
              mantém detalhes recolhidos para o corretor vender com velocidade.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar lead, projeto, região, origem ou campanha..."
              className="min-w-72 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-sky-400/30"
            />
            <button
              type="button"
              onClick={() => setFocusMode((value) => !value)}
              aria-pressed={focusMode}
              className={`atlas-button-secondary ${focusMode ? "border-sky-400/20 !text-sky-200" : ""}`}
            >
              {focusMode ? "Expandir inteligência" : "✦ Ativar modo foco"}
            </button>
            {canConfigureStages ? (
              <Link
                href="/pipeline/settings"
                className="atlas-button-secondary"
              >
                Configurar etapas
              </Link>
            ) : null}
            <Link href="/leads/new" className="atlas-button-primary">
              + Novo lead
            </Link>
          </div>
        </div>
      </section>

      <section
        className="atlas-decision-command-strip"
        data-tone={decisionCommand.tone}
        data-pipeline-decision-contract="unique-attention"
        aria-label="Decisão prioritária do Kanban"
        aria-live="polite"
      >
        <div className="atlas-decision-command-main">
          <span>Decisão agora</span>
          <h3>{decisionCommand.label}</h3>
          <p>{decisionCommand.detail}</p>
        </div>
        <div
          className="atlas-decision-command-metrics"
          aria-label="Resumo de foco comercial"
        >
          <div>
            <strong>{loading ? "—" : decisionCommand.primaryCount}</strong>
            <span>{decisionCommand.metricLabel}</span>
          </div>
          <div>
            <strong>{loading ? "—" : pipelineAttention.critical}</strong>
            <span>atrasos únicos</span>
          </div>
          <div>
            <strong>{loading ? "—" : pipelineAttention.hotUnprotected}</strong>
            <span>quentes sem ação</span>
          </div>
          <div>
            <strong
              title={
                loading ? undefined : brl.format(pipelineAttention.valueAtRisk)
              }
            >
              {loading ? "—" : compactBrl.format(pipelineAttention.valueAtRisk)}
            </strong>
            <span>valor em atenção</span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            setFocus(decisionCommand.focus);
            setSort(decisionCommand.sort);
            setFocusMode(decisionCommand.focusMode);
            setCompact(decisionCommand.compact);
            setHideEmpty(decisionCommand.hideEmpty);
          }}
          className="atlas-decision-command-action"
        >
          {decisionCommand.actionLabel}
        </button>
      </section>

      <AtlasDetailDisclosure
        label="Ver diagnóstico e clareza do pipeline"
        group="pipeline-secondary-analysis"
      >
        <section
          className="atlas-pipeline-os-cockpit"
          data-pipeline-redesign="phase-125"
          data-tone={pipelineExperience.tone}
          aria-label="Pipeline OS orientado à próxima melhor ação"
        >
          <div className="atlas-pipeline-os-primary">
            <span>{pipelineExperience.label}</span>
            <h3>{pipelineExperience.title}</h3>
            <p>{pipelineExperience.detail}</p>
            <div className="atlas-pipeline-os-actions">
              <button
                type="button"
                onClick={() => {
                  setFocus(pipelineExperience.focus);
                  if (pipelineExperience.stage)
                    setMobileStage(pipelineExperience.stage);
                  setFocusMode(true);
                  setCompact(true);
                }}
              >
                {pipelineExperience.cta}
              </button>
              <button type="button" onClick={() => applyKanbanLens("broker")}>
                Modo corretor
              </button>
            </div>
          </div>
          <div className="atlas-pipeline-os-grid">
            <article>
              <span>Qualidade</span>
              <strong>
                {loading ? "—" : `${pipelineQuality.qualityScore}%`}
              </strong>
              <small>saúde do quadro</small>
            </article>
            <article>
              <span>Ações</span>
              <strong>
                {loading ? "—" : pipelineQuality.withoutNextAction}
              </strong>
              <small>sem próximo passo</small>
            </article>
            <article>
              <span>Receita</span>
              <strong>{loading ? "—" : brl.format(metrics.forecast)}</strong>
              <small>forecast ponderado</small>
            </article>
            <article>
              <span>IA</span>
              <strong>
                {effectiveKanbanLens === "broker"
                  ? "execução"
                  : effectiveKanbanLens === "manager"
                    ? "gestão"
                    : "decisão"}
              </strong>
              <small>lente ativa</small>
            </article>
          </div>
        </section>
      </AtlasDetailDisclosure>

      <AtlasDetailDisclosure
        label="Ver briefing ampliado do Kanban"
        group="pipeline-secondary-analysis"
      >
        <section
          className="atlas-pipeline-v30-decision-layer"
          data-phase="128-pipeline-v30-kanban-decision-board"
          data-tone={pipelineV30Decision.mode.tone}
          aria-label="Kanban V30 orientado à próxima decisão"
        >
          <div className="atlas-pipeline-v30-now">
            <div>
              <span>Kanban V30 · próxima decisão</span>
              <h3>{pipelineV30Decision.mode.label}</h3>
              <p>{pipelineV30Decision.mode.detail}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setFocus(pipelineV30Decision.mode.focus);
                setFocusMode(true);
                setCompact(true);
              }}
            >
              Aplicar visão inteligente
            </button>
          </div>
          <div className="atlas-pipeline-v30-lead">
            {pipelineV30Decision.primaryLead &&
            pipelineV30Decision.primaryGuidance ? (
              <>
                <div className="atlas-pipeline-v30-lead-head">
                  <div>
                    <span>Lead que merece atenção</span>
                    <Link href={`/leads/${pipelineV30Decision.primaryLead.id}`}>
                      {pipelineV30Decision.primaryLead.name || "Lead sem nome"}
                    </Link>
                  </div>
                  <strong>{pipelineV30Decision.primaryLead.score ?? 0}</strong>
                </div>
                <p>{pipelineV30Decision.primaryGuidance.action}</p>
                <small>
                  {pipelineV30Decision.primaryStage?.label || "Etapa atual"} ·{" "}
                  {pipelineV30Decision.primaryGuidance.reason}
                </small>
                <div className="atlas-pipeline-v30-lead-actions">
                  <Link href={`/leads/${pipelineV30Decision.primaryLead.id}`}>
                    Abrir Lead 360
                  </Link>
                  <Link
                    href={copilotIntentUrl(
                      pipelineV30Decision.primaryLead,
                      "follow_up",
                    )}
                  >
                    IA: preparar abordagem
                  </Link>
                  {pipelineV30Decision.primaryContact ? (
                    <a
                      href={pipelineV30Decision.primaryContact.whatsapp}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  ) : (
                    <Link
                      href={executionIntentUrl(
                        pipelineV30Decision.primaryLead,
                        "task",
                      )}
                    >
                      Criar tarefa
                    </Link>
                  )}
                </div>
              </>
            ) : (
              <>
                <span>Fila limpa</span>
                <p>Nenhuma oportunidade aberta exige intervenção agora.</p>
                <small>
                  Quando novas leads entrarem, o Atlas prioriza a próxima melhor
                  ação.
                </small>
              </>
            )}
          </div>
          <div className="atlas-pipeline-v30-actions">
            {pipelineV30Decision.actions.map((item) => (
              <button
                key={item.label}
                type="button"
                data-tone={item.tone}
                onClick={() => {
                  setFocus(item.focus);
                  if (item.stage) setMobileStage(item.stage);
                  setFocusMode(true);
                  setCompact(true);
                }}
              >
                <span>{item.label}</span>
                <strong>{loading ? "—" : item.value}</strong>
                <small>{item.detail}</small>
                <em>{item.cta}</em>
              </button>
            ))}
          </div>
          <div className="atlas-pipeline-v30-health">
            <span>Clareza do quadro</span>
            <strong>
              {loading ? "—" : `${pipelineV30Decision.clarityScore}%`}
            </strong>
            <small>
              Ruído estimado:{" "}
              {loading ? "—" : `${pipelineV30Decision.frictionScore}%`}
            </small>
          </div>
        </section>

        <section
          className="atlas-kanban-v30-next-move-strip"
          data-v30-phase="134-kanban-v30-next-move-queue"
          data-next-move-count={kanbanV30NextMoveQueue.length}
          aria-label="Próximo movimento do Kanban"
        >
          <div className="atlas-kanban-v30-next-move-head">
            <div>
              <span>V30 NEXT MOVE · KANBAN</span>
              <h3>Próximo movimento do Kanban</h3>
              <p>
                Uma fila curta para decidir e agir: SLA, score, valor, etapa e
                próxima ação compactados em ordem de impacto.
              </p>
            </div>
            <div className="atlas-kanban-v30-next-move-copilot">
              <span>Copilot proativo</span>
              <strong>
                {kanbanV30NextMoveQueue[0]?.signal || "Fila limpa"}
              </strong>
              <small>
                {kanbanV30NextMoveQueue[0]
                  ? "Sugestão pronta para executar sem poluir o quadro."
                  : "O Atlas mantém o quadro monitorado para a próxima entrada."}
              </small>
            </div>
          </div>
          {kanbanV30NextMoveQueue.length > 0 ? (
            <div className="atlas-kanban-v30-next-move-grid">
              {kanbanV30NextMoveQueue.map((item, index) => {
                const contact = phoneLinks(item.lead.phone);
                const leadName = item.lead.name || "Lead sem nome";
                const isSavingLead = savingId === item.lead.id;
                const nextStage = item.nextStage;

                return (
                  <article key={item.key} data-priority={item.priority}>
                    <div className="atlas-kanban-v30-next-move-rank">
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <em>{item.signal}</em>
                    </div>
                    <div className="atlas-kanban-v30-next-move-body">
                      <Link href={`/leads/${item.lead.id}`}>{leadName}</Link>
                      <strong>{item.decision}</strong>
                      <p>{item.reason}</p>
                    </div>
                    <div className="atlas-kanban-v30-next-move-facts">
                      <span>
                        <small>Etapa</small>
                        <b>{item.stageLabel}</b>
                      </span>
                      <span>
                        <small>Score</small>
                        <b>{item.lead.score ?? 0}</b>
                      </span>
                      <span>
                        <small>Valor</small>
                        <b>{item.valueLabel}</b>
                      </span>
                    </div>
                    <div className="atlas-kanban-v30-next-move-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setFocus(item.focus);
                          setMobileStage(
                            (item.lead.status ?? "novo") as StageKey,
                          );
                          setFocusMode(true);
                          setCompact(true);
                        }}
                      >
                        Ver no quadro
                      </button>
                      <Link
                        href={copilotIntentUrl(item.lead, item.copilotIntent)}
                      >
                        IA preparar
                      </Link>
                      {contact ? (
                        <a
                          href={contact.whatsapp}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {item.actionLabel}
                        </a>
                      ) : (
                        <Link
                          href={executionIntentUrl(
                            item.lead,
                            item.executionIntent,
                          )}
                        >
                          {item.actionLabel}
                        </Link>
                      )}
                      {nextStage ? (
                        <button
                          type="button"
                          disabled={isSavingLead}
                          onClick={() =>
                            void moveLead(item.lead.id, nextStage.key)
                          }
                        >
                          {isSavingLead
                            ? "Salvando..."
                            : `Avançar p/ ${nextStage.label}`}
                        </button>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <AtlasEmpty
              reason="completed"
              eyebrow="Kanban em controle"
              title="Nenhum movimento crítico agora"
              description="Quando houver SLA vencido, lead quente sem ação, proposta parada ou card travado, o Atlas cria a fila automaticamente."
            />
          )}
        </section>
      </AtlasDetailDisclosure>

      <AtlasDetailDisclosure
        label="Ver atalhos de análise do Kanban"
        group="pipeline-secondary-analysis"
      >
        <section
          className="atlas-kanban-focus-strip"
          data-focus-strip="phase-113"
          aria-label="Foco operacional do Kanban"
        >
          {kanbanFocusStrip.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setFocus(item.focus);
                if (item.stage) setMobileStage(item.stage);
              }}
              className="atlas-kanban-focus-card"
              data-tone={item.tone}
            >
              <span>{item.label}</span>
              <strong>{loading ? "—" : item.value}</strong>
              <small>{item.detail}</small>
              <em>{item.action}</em>
            </button>
          ))}
        </section>
      </AtlasDetailDisclosure>

      {kanbanRecoveryState ? (
        <section
          className="atlas-kanban-v30-recovery-panel"
          data-v30-phase="143-kanban-v30-recovery-states"
          data-state={kanbanRecoveryState.mode}
          data-tone={kanbanRecoveryState.tone}
          data-reliable-state-contract={ATLAS_RELIABLE_STATE_CONTRACT}
          data-zero-meaning={
            kanbanRecoveryState.mode === "empty_base"
              ? "verified-empty"
              : undefined
          }
          role={kanbanRecoveryState.mode === "error" ? undefined : "status"}
        >
          {kanbanRecoveryState.mode !== "error" ? (
            <>
              <div className="atlas-kanban-v30-recovery-copy">
                <span>Kanban V30 · orientação automática</span>
                <h3>{kanbanRecoveryState.title}</h3>
                <p>{kanbanRecoveryState.detail}</p>
              </div>
              <div className="atlas-kanban-v30-recovery-steps">
                {kanbanRecoveryState.steps.map((step, index) => (
                  <span key={`${kanbanRecoveryState.mode}-${step}`}>
                    <small>{String(index + 1).padStart(2, "0")}</small>
                    <b>{step}</b>
                  </span>
                ))}
              </div>
            </>
          ) : null}
          <div className="atlas-kanban-v30-recovery-actions">
            {kanbanRecoveryState.mode === "error" ? (
              <ReliableState
                kind="recoverable-error"
                title={kanbanRecoveryState.title}
                description={kanbanRecoveryState.detail}
                action={
                  <button
                    type="button"
                    onClick={() => void load()}
                    disabled={loading}
                  >
                    {loading ? "Atualizando..." : kanbanRecoveryState.action}
                  </button>
                }
                secondaryAction={<Link href="/leads">Abrir base de leads</Link>}
              />
            ) : kanbanRecoveryState.mode === "empty_base" ? (
              <>
                <Link href="/leads/new">{kanbanRecoveryState.action}</Link>
                <Link href="/leads/reactivation-governance">
                  Importar/reativar base
                </Link>
                <button type="button" onClick={() => void load()}>
                  Atualizar
                </button>
              </>
            ) : kanbanRecoveryState.mode === "empty_board" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setHideEmpty(false);
                    setFocus("todas");
                    setFocusMode(false);
                  }}
                >
                  {kanbanRecoveryState.action}
                </button>
                <button type="button" onClick={resetKanbanFilters}>
                  Voltar para prioridade
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={resetKanbanFilters}>
                  {kanbanRecoveryState.action}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFocus("todas");
                    setHideEmpty(false);
                    setFocusMode(false);
                  }}
                >
                  Ver todos
                </button>
              </>
            )}
          </div>
        </section>
      ) : null}
      {!loading && pipelineScope.totalOperational > pipelineScope.loaded ? (
        <div
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/[0.07] px-4 py-3 text-xs text-amber-100"
          role="status"
        >
          <span>
            Este quadro mostra {pipelineScope.loaded} de{" "}
            {pipelineScope.totalOperational} oportunidades operacionais. A
            memória arquivada continua isolada.
          </span>
          <Link
            href="/leads"
            className="font-semibold text-amber-50 underline decoration-amber-300/40 underline-offset-4"
          >
            Pesquisar a base completa
          </Link>
        </div>
      ) : null}
      {movementFeedback ? (
        <div
          className="atlas-kanban-feedback-stack"
          data-movement-feedback="phase-35-safe-stage-movement"
          data-ux-phase="35-safe-stage-movement"
          data-unified-movement="phase-36"
          aria-live="polite"
        >
          <div
            className="atlas-kanban-move-feedback"
            data-interaction-method={movementFeedback.method}
            data-state={movementFeedback.state}
            role={movementFeedback.state === "error" ? "alert" : "status"}
          >
            <span>
              {movementFeedback.state === "saving"
                ? "Movendo oportunidade"
                : movementFeedback.state === "success"
                  ? "Etapa atualizada"
                  : "Movimento não confirmado"}
              {" · "}
              {PIPELINE_MOVEMENT_METHOD_LABEL[movementFeedback.method]}
            </span>
            <strong>{movementFeedback.leadName}</strong>
            <small>
              {pipelineStageLabel(movementFeedback.from, stages)} →{" "}
              {pipelineStageLabel(movementFeedback.to, stages)}
              {movementFeedback.state === "saving"
                ? " · salvando histórico"
                : movementFeedback.state === "error"
                  ? " · etapa anterior restaurada"
                  : " · histórico preservado"}
            </small>
            <div className="atlas-kanban-move-feedback-actions">
              {movementFeedback.state === "success" && lastMove ? (
                <button
                  type="button"
                  onClick={() => void undoLastMove()}
                  disabled={Boolean(savingId)}
                >
                  Desfazer
                </button>
              ) : null}
              {movementFeedback.state !== "saving" ? (
                <button
                  type="button"
                  onClick={() => {
                    setMovementFeedback(null);
                    if (movementFeedback.state === "success") setLastMove(null);
                  }}
                >
                  Fechar
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <AtlasDetailDisclosure
        label="Ver saúde e indicadores do pipeline"
        group="pipeline-secondary-analysis"
      >
        <section
          className="atlas-kanban-pulse"
          aria-label="Pulso decisivo do Kanban"
          data-kanban-pulse="action-coverage"
        >
          <article data-tone={pipelineQuality.tone}>
            <span>Qualidade do quadro</span>
            <strong>
              {loading ? "—" : `${pipelineQuality.qualityScore}%`}
            </strong>
            <p>{pipelineQuality.decision}</p>
          </article>
          <article
            data-tone={
              pipelineQuality.actionCoverage >= 80 ? "success" : "warning"
            }
          >
            <span>Com próxima ação</span>
            <strong>
              {loading ? "—" : `${pipelineQuality.actionCoverage}%`}
            </strong>
            <p>{pipelineQuality.withoutNextAction} precisam de compromisso</p>
          </article>
          <article
            data-tone={pipelineQuality.urgent > 0 ? "danger" : "success"}
          >
            <span>Urgência real</span>
            <strong>{loading ? "—" : pipelineQuality.urgent}</strong>
            <p>SLA ou ação vencida</p>
          </article>
          <article
            data-tone={pipelineQuality.hotCoverage >= 80 ? "success" : "info"}
          >
            <span>Quentes protegidos</span>
            <strong>{loading ? "—" : `${pipelineQuality.hotCoverage}%`}</strong>
            <p>Leads fortes com próximo passo</p>
          </article>
        </section>

        {!focusMode ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
            <AtlasMetric
              label="Negócios abertos"
              value={loading ? "—" : metrics.open}
              detail="Oportunidades em andamento"
              trend="LIVE"
              tone="blue"
            />
            <AtlasMetric
              label="Pipeline bruto"
              value={loading ? "—" : brl.format(metrics.pipeline)}
              detail="Potencial comercial total"
              trend="VGV"
              tone="violet"
            />
            <AtlasMetric
              label="Forecast"
              value={loading ? "—" : brl.format(metrics.forecast)}
              detail="Ponderado por etapa"
              trend="AI"
              tone="green"
            />
            <AtlasMetric
              label="Leads quentes"
              value={loading ? "—" : metrics.hot}
              detail="Prioridade imediata"
              trend="HOT"
              tone="rose"
            />
            <AtlasMetric
              label="Risco alto"
              value={loading ? "—" : metrics.highRisk}
              detail={`${metrics.firstContactOverdue} SLA inicial vencido(s)`}
              trend="RISK"
              tone="amber"
            />
            <AtlasMetric
              label="Perfis compradores"
              value={loading ? "—" : metrics.buyerProfiles}
              detail="Compraram em outro lugar"
              trend="LEARN"
              tone="green"
            />
          </section>
        ) : null}
      </AtlasDetailDisclosure>

      <section
        className="atlas-pipeline-priority-queue"
        data-ux-phase="32-single-short-priority-queue"
        aria-labelledby="atlas-pipeline-priority-title"
        aria-live="polite"
        data-priority-source="authorized-loaded-pipeline"
        data-priority-limit={KANBAN_VISIBLE_PRIORITY_LIMIT}
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.14em] text-sky-300">
              Movimentação prioritária
            </p>
            <h3
              id="atlas-pipeline-priority-title"
              className="mt-1 text-lg font-semibold text-white"
            >
              Comece por aqui
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              No máximo três decisões, ordenadas por impacto, urgência e pela
              lente ativa. O restante permanece no quadro e nas análises.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[.12em]">
            <span className="rounded-full border border-sky-400/20 bg-sky-400/10 px-3 py-1.5 text-sky-200">
              {loading ? "Priorizando" : `${dailyFocus.length} agora`}
            </span>
            {!loading && priorityCandidateCount > dailyFocus.length ? (
              <span className="text-slate-500">
                +{priorityCandidateCount - dailyFocus.length} no quadro
              </span>
            ) : null}
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {dailyFocus.map((lead, index) => {
            const guidance = brokerGuidance(lead);
            const contact = phoneLinks(lead.phone);
            const risk = leadRisk(lead);
            const currentStageIndex =
              stageIndexByKey.get((lead.status || "novo") as StageKey) ?? -1;
            const currentStage = stages[currentStageIndex];
            const nextStage =
              currentStageIndex >= 0
                ? stages[currentStageIndex + 1]
                : undefined;
            return (
              <article key={lead.id} className="atlas-broker-action">
                <div className="flex items-start justify-between gap-3">
                  <span className="atlas-broker-rank">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <AtlasBadge tone={riskTone(risk)}>Risco {risk}</AtlasBadge>
                </div>
                <Link
                  href={`/leads/${lead.id}`}
                  className="mt-3 block truncate text-sm font-semibold text-white hover:text-sky-300"
                >
                  {lead.name || "Lead sem nome"}
                </Link>
                <div className="atlas-broker-stage">
                  <span>{currentStage?.label || "Etapa atual"}</span>
                  <i aria-hidden="true">→</i>
                  <strong>{nextStage?.label || "Revisar fechamento"}</strong>
                </div>
                <p className="mt-3 text-sm font-semibold text-sky-200">
                  {guidance.action}
                </p>
                <p className="mt-1 min-h-10 text-xs leading-5 text-slate-500">
                  {guidance.reason}
                </p>
                <label
                  className="atlas-broker-move-label"
                  htmlFor={`priority-stage-${lead.id}`}
                >
                  Movimentar após validar
                </label>
                <select
                  id={`priority-stage-${lead.id}`}
                  value={lead.status ?? "novo"}
                  disabled={savingId === lead.id}
                  onChange={(event) =>
                    void moveLead(
                      lead.id,
                      event.target.value as StageKey,
                      undefined,
                      undefined,
                      "selector",
                    )
                  }
                  className="atlas-broker-move-select"
                >
                  {destinationOptions.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Link
                    href={`/leads/${lead.id}`}
                    className="atlas-broker-shortcut"
                  >
                    Lead 360
                  </Link>
                  <Link
                    href={executionIntentUrl(lead, "task")}
                    className="atlas-broker-shortcut"
                  >
                    Tarefa
                  </Link>
                  <Link
                    href={copilotIntentUrl(lead, "follow_up")}
                    className="atlas-broker-shortcut"
                  >
                    Mensagem IA
                  </Link>
                  {contact ? (
                    <a href={contact.call} className="atlas-broker-shortcut">
                      Ligar
                    </a>
                  ) : (
                    <span className="atlas-broker-shortcut is-disabled">
                      Sem telefone
                    </span>
                  )}
                </div>
              </article>
            );
          })}
          {!loading && dailyFocus.length === 0 ? (
            <div className="lg:col-span-3">
              <AtlasEmpty
                reason="completed"
                eyebrow="Fila prioritária concluída"
                title="Tudo em dia"
                description="Nenhuma oportunidade aberta exige ação neste momento."
                action={
                  <Link href="/tasks" className="atlas-button-secondary">
                    Revisar tarefas
                  </Link>
                }
              />
            </div>
          ) : null}
        </div>
      </section>

      {!focusMode ? (
        <AtlasDetailDisclosure
          label="Ver resumo visual das etapas"
          group="pipeline-secondary-analysis"
        >
          <section
            className="atlas-pipeline-flow"
            aria-label="Resumo visual das etapas do pipeline"
          >
            {stageData.map((stage, index) => (
              <div
                key={stage.key}
                style={{ "--flow": `${stage.probability}%` } as CSSProperties}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>
                  <strong>{stage.label}</strong>
                  <small>
                    {stage.items.length} leads · {brl.format(stage.value)}
                  </small>
                </p>
                <i>
                  <b />
                </i>
              </div>
            ))}
          </section>
        </AtlasDetailDisclosure>
      ) : null}

      <AtlasCard purpose="work">
        <div className="atlas-kanban-central-surface" aria-hidden="true" />
        <AtlasCardHeader
          eyebrow="Fluxo comercial"
          title="Kanban operacional"
          description="Arraste só quando a realidade do atendimento mudou. O Atlas mostra ação, risco e próximo passo antes do movimento."
          action={
            <div className="flex gap-2">
              <AtlasBadge tone="info">
                {visibleLeads.length} VISÍVEIS
              </AtlasBadge>
              <AtlasBadge tone="violet">
                {brl.format(metrics.forecast)} FORECAST
              </AtlasBadge>
            </div>
          }
        />
        <section
          className="atlas-kanban-v30-command-bar"
          data-v30-phase="136-kanban-v30-command-bar"
          aria-label="Barra de comando do Kanban V30"
        >
          <div className="atlas-kanban-v30-command-bar-head">
            <span>Command bar · V30</span>
            <strong>Escolha o modo de venda sem procurar controles</strong>
            <small>
              {KANBAN_LENS_LABEL[effectiveKanbanLens]} ·{" "}
              {KANBAN_FOCUS_LABEL[focus]} · {KANBAN_SORT_LABEL[sort]}
            </small>
          </div>
          <div
            className="atlas-kanban-v30-command-bar-actions"
            role="group"
            aria-label="Ações rápidas de visão do Kanban"
          >
            <button
              type="button"
              data-active={
                focus === "prioridade" && sort === "prioridade"
                  ? "true"
                  : "false"
              }
              onClick={() => {
                setFocus("prioridade");
                setSort("prioridade");
                setFocusMode(true);
                setCompact(false);
              }}
            >
              <span>Vender agora</span>
              <strong>
                {focusOptions.find((option) => option.key === "prioridade")
                  ?.count ?? 0}
              </strong>
              <small>Leads com maior prioridade, risco ou atraso.</small>
            </button>
            <button
              type="button"
              data-active={focus === "sla" ? "true" : "false"}
              onClick={() => {
                setFocus("sla");
                setSort("prioridade");
                setFocusMode(true);
                setCompact(true);
                setHideEmpty(true);
              }}
            >
              <span>Salvar SLA</span>
              <strong>{metrics.firstContactOverdue}</strong>
              <small>Primeiro contato vencido antes de esfriar.</small>
            </button>
            <button
              type="button"
              data-active={focus === "sem_acao" ? "true" : "false"}
              onClick={() => {
                setFocus("sem_acao");
                setSort("prioridade");
                setFocusMode(true);
                setCompact(true);
                setHideEmpty(true);
              }}
            >
              <span>Definir ação</span>
              <strong>{pipelineQuality.withoutNextAction}</strong>
              <small>Oportunidades que precisam de compromisso.</small>
            </button>
            <button
              type="button"
              data-active={
                effectiveKanbanLens === "director" && sort === "valor"
                  ? "true"
                  : "false"
              }
              onClick={() => {
                applyKanbanLens("director");
                setSort("valor");
              }}
            >
              <span>Ver receita</span>
              <strong>{brl.format(metrics.forecast)}</strong>
              <small>Forecast e valor sem perder risco.</small>
            </button>
            <button
              type="button"
              data-active={!focusMode && focus === "todas" ? "true" : "false"}
              onClick={() => {
                setFocus("todas");
                setSort("recente");
                setFocusMode(false);
                setCompact(false);
                setHideEmpty(false);
              }}
            >
              <span>Mapa completo</span>
              <strong>{metrics.open}</strong>
              <small>Abre a visão ampla para auditoria.</small>
            </button>
          </div>
          <div className="atlas-kanban-v30-command-bar-state">
            <span>
              <small>Cards</small>
              <strong>{compact ? "Compactos" : "Confortáveis"}</strong>
            </span>
            <span>
              <small>Etapas</small>
              <strong>{hideEmpty ? "Ativas" : "Todas"}</strong>
            </span>
            <span>
              <small>Foco</small>
              <strong>{focusMode ? "Ligado" : "Expandido"}</strong>
            </span>
          </div>
        </section>
        <AtlasDetailDisclosure
          label="Ver lentes, fila inteligente e gargalos"
          group="pipeline-secondary-analysis"
        >
          <div
            className="atlas-kanban-lens-shell"
            data-kanban-lens="phase-116"
            data-effective-lens={effectiveKanbanLens}
          >
            <div className="atlas-kanban-lens-summary">
              <span>Lente inteligente</span>
              <strong>{lensIntent.title}</strong>
              <small>{lensIntent.detail}</small>
            </div>
            <div
              className="atlas-kanban-lens-switcher"
              role="group"
              aria-label="Lentes inteligentes do Kanban"
            >
              {kanbanLensOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => applyKanbanLens(option.key)}
                  aria-pressed={kanbanLens === option.key}
                  data-active={kanbanLens === option.key ? "true" : "false"}
                  data-tone={option.tone}
                >
                  <span>{option.label}</span>
                  <strong>{option.title}</strong>
                  <small>{option.detail}</small>
                  <em>{option.action}</em>
                </button>
              ))}
            </div>
          </div>
          <div
            className="atlas-kanban-lens-queue"
            data-lens={effectiveKanbanLens}
            data-lens-queue="phase-118"
            aria-label={`Fila inteligente para ${KANBAN_LENS_LABEL[effectiveKanbanLens]}`}
          >
            <div className="atlas-kanban-lens-queue-head">
              <div>
                <span>Fila inteligente</span>
                <strong>
                  {KANBAN_LENS_LABEL[effectiveKanbanLens]} · próximas 5 ações
                </strong>
              </div>
              <p>{lensIntent.detail}</p>
            </div>
            {kanbanLensQueue.length > 0 ? (
              <div className="atlas-kanban-lens-queue-list">
                {kanbanLensQueue.map((item, index) => {
                  const contact = phoneLinks(item.lead.phone);
                  const leadName = item.lead.name || "Lead sem nome";
                  const currentStageIndex =
                    stageIndexByKey.get(
                      (item.lead.status || "novo") as StageKey,
                    ) ?? -1;
                  const nextStage =
                    currentStageIndex >= 0
                      ? stages[currentStageIndex + 1]
                      : undefined;
                  const isSavingLead = savingId === item.lead.id;
                  const stageStall = stageStallSignal(item.lead);

                  return (
                    <article
                      key={item.lead.id}
                      className="atlas-kanban-lens-queue-item"
                      data-queue-actions="phase-119"
                    >
                      <span className="atlas-kanban-lens-queue-rank">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <Link
                          href={`/leads/${item.lead.id}`}
                          className="atlas-kanban-lens-queue-title"
                        >
                          {leadName}
                        </Link>
                        <small>
                          {item.stage?.label ||
                            pipelineStageLabel(
                              (item.lead.status ?? "novo") as StageKey,
                              stages,
                            )}{" "}
                          · {item.guidance.action}
                        </small>
                      </div>
                      <div
                        className="atlas-kanban-lens-queue-signals"
                        data-stage-stall="phase-121"
                      >
                        <em>{item.label}</em>
                        <span
                          className="atlas-kanban-lens-queue-stall"
                          data-tone={stageStall.tone}
                        >
                          {stageStall.label}
                        </span>
                      </div>
                      <div
                        className="atlas-kanban-lens-queue-actions"
                        aria-label={`Ações rápidas para ${leadName}`}
                      >
                        <Link href={`/leads/${item.lead.id}`}>Lead 360</Link>
                        {contact ? (
                          <>
                            <a href={contact.call}>Ligar</a>
                            <a
                              href={contact.whatsapp}
                              target="_blank"
                              rel="noreferrer"
                            >
                              WhatsApp
                            </a>
                          </>
                        ) : (
                          <span aria-disabled="true">Sem telefone</span>
                        )}
                        <Link href={copilotIntentUrl(item.lead, "follow_up")}>
                          IA
                        </Link>
                        <Link href={executionIntentUrl(item.lead, "task")}>
                          Tarefa
                        </Link>
                      </div>
                      <button
                        type="button"
                        className="atlas-kanban-lens-queue-next"
                        data-queue-advance="phase-120"
                        disabled={!nextStage || isSavingLead}
                        onClick={() => {
                          if (nextStage)
                            void moveLead(item.lead.id, nextStage.key);
                        }}
                        aria-label={
                          nextStage
                            ? `Avançar ${leadName} para ${nextStage.label}`
                            : `Revisar etapa de ${leadName}`
                        }
                      >
                        {isSavingLead
                          ? "Salvando movimento..."
                          : nextStage
                            ? `Avançar: ${nextStage.label}`
                            : "Revisar etapa"}
                      </button>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="atlas-kanban-lens-queue-empty">
                Fila limpa no recorte atual. Ajuste filtros ou acompanhe novas
                entradas.
              </div>
            )}
          </div>
          <div
            className="atlas-kanban-bottleneck-radar"
            data-stage-bottlenecks="phase-122 phase-153"
            data-v30-phase="153-kanban-v30-stage-compression-radar"
            aria-label="Ranking comprimido de gargalos por etapa"
          >
            <div className="atlas-kanban-bottleneck-radar-head">
              <span>Radar de gargalos V30</span>
              <strong>
                {stageBottleneckRanking[0]
                  ? `Foco agora: ${stageBottleneckRanking[0].label}`
                  : "Fluxo saudável"}
              </strong>
              <p>{bottleneckRoleIntro(effectiveKanbanLens)}</p>
            </div>
            <div className="atlas-kanban-bottleneck-radar-list">
              {stageBottleneckRanking.length > 0 ? (
                stageBottleneckRanking.map((item, index) => (
                  <button
                    key={item.key}
                    type="button"
                    data-tone={item.tone}
                    data-role-guide="phase-123"
                    data-v30-phase="153-kanban-v30-stage-compression-radar"
                    onClick={() => {
                      setMobileStage(item.key);
                      setFocus(item.focus);
                      setSort("prioridade");
                      setFocusMode(true);
                      setCompact(true);
                      setHideEmpty(false);
                    }}
                    aria-label={`Ver gargalo em ${item.label}`}
                  >
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{item.label}</strong>
                    <small>
                      {item.count} leads · {item.waitLabel}
                    </small>
                    <em>{item.guideLabel}</em>
                    <i
                      className="atlas-kanban-bottleneck-radar-signals"
                      aria-label={`Sinais de ${item.label}: ${item.urgent} urgentes, ${item.stalled} parados, ${item.noAction} sem ação e ${item.hot} quentes`}
                    >
                      <small>
                        <b>{item.urgent}</b> urg.
                      </small>
                      <small>
                        <b>{item.stalled}</b> par.
                      </small>
                      <small>
                        <b>{item.noAction}</b> sem ação
                      </small>
                      <small>
                        <b>{item.hot}</b> hot
                      </small>
                    </i>
                    <b>{item.guideDetail}</b>
                  </button>
                ))
              ) : (
                <div className="atlas-kanban-bottleneck-empty">
                  Sem gargalo no recorte atual. A operação está fluindo.
                </div>
              )}
            </div>
          </div>
        </AtlasDetailDisclosure>
        <div
          className="flex flex-col gap-3 border-t border-white/[0.06] px-4 py-4 sm:px-6 xl:flex-row xl:items-center xl:justify-between"
          aria-label="Controles do Kanban"
        >
          <div className="flex flex-wrap items-center gap-2">
            <label
              className="text-[10px] font-semibold uppercase tracking-[.12em] text-slate-500"
              htmlFor="pipeline-sort"
            >
              Ordenar
            </label>
            <select
              id="pipeline-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-400/30"
            >
              <option value="prioridade">Prioridade inteligente</option>
              <option value="score">Maior score</option>
              <option value="valor">Maior valor</option>
              <option value="recente">Atualização recente</option>
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setCompact((value) => !value)}
              aria-pressed={compact}
              className={`atlas-kanban-toggle ${compact ? "is-active" : ""}`}
            >
              {compact ? "Visão compacta" : "Visão confortável"}
            </button>
            <button
              type="button"
              onClick={() => setHideEmpty((value) => !value)}
              aria-pressed={hideEmpty}
              className={`atlas-kanban-toggle ${hideEmpty ? "is-active" : ""}`}
            >
              {hideEmpty
                ? "Mostrando etapas ativas"
                : "Mostrar todas as etapas"}
            </button>
          </div>
        </div>
        <AtlasDetailDisclosure
          label="Ver inteligência avançada e ações em lote"
          group="pipeline-secondary-analysis"
        >
          <section
            className="atlas-kanban-v30-heatline"
            data-v30-phase="147-kanban-v30-predictive-heatline"
            aria-label="Mapa de calor preditivo do Kanban"
          >
            <div className="atlas-kanban-v30-heatline-head">
              <div>
                <span>Heatline preditivo</span>
                <strong>
                  {kanbanV30Heatline[0]
                    ? `${kanbanV30Heatline[0].signal}: ${kanbanV30Heatline[0].lead.name || "lead sem nome"}`
                    : "Sem prioridade crítica agora"}
                </strong>
                <small>
                  Prioridade automática por SLA, score, etapa, valor e ausência
                  de próxima ação.
                </small>
              </div>
              <button
                type="button"
                onClick={() => {
                  const first = kanbanV30Heatline[0];
                  if (!first) return;
                  setFocus(first.focus);
                  setMobileStage(first.currentStage);
                  setFocusMode(true);
                  setCompact(true);
                  openLeadPreview(first.lead.id, "queue");
                }}
                disabled={!kanbanV30Heatline[0]}
              >
                Abrir prioridade
              </button>
            </div>
            <div className="atlas-kanban-v30-heatline-list">
              {kanbanV30Heatline.length > 0 ? (
                kanbanV30Heatline.map((item) => (
                  <article
                    key={`heatline-${item.key}`}
                    data-priority={item.priority}
                    data-tone={item.tone}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setFocus(item.focus);
                        setMobileStage(item.currentStage);
                        setFocusMode(true);
                        setCompact(true);
                        openLeadPreview(item.lead.id, "queue");
                      }}
                    >
                      <span>{String(item.rank).padStart(2, "0")}</span>
                      <div>
                        <strong>{item.lead.name || "Lead sem nome"}</strong>
                        <small>
                          {item.signal} · {item.stageLabel}
                        </small>
                      </div>
                      <em>{item.valueLabel}</em>
                    </button>
                    <Link
                      href={copilotIntentUrl(item.lead, item.copilotIntent)}
                    >
                      IA
                    </Link>
                  </article>
                ))
              ) : (
                <div className="atlas-kanban-v30-heatline-empty">
                  <strong>Sem calor crítico no quadro.</strong>
                  <span>
                    O Atlas continuará monitorando novas entradas, SLA e
                    propostas.
                  </span>
                </div>
              )}
            </div>
          </section>
          <section
            className="atlas-kanban-v30-batch-dock"
            data-v30-phase="148-kanban-v30-safe-batch-actions"
            aria-label="Plano de ação seguro em lote do Kanban"
          >
            <div className="atlas-kanban-v30-batch-dock-head">
              <div>
                <span>Execução segura</span>
                <strong>
                  {kanbanV30BatchHasSelection
                    ? `${kanbanV30BatchSummary.count} leads selecionados · ${kanbanV30BatchSummary.valueLabel}`
                    : "Selecione prioridades para executar"}
                </strong>
                <small>
                  Nenhum disparo automático: o Atlas prepara tarefas, mensagens
                  e distribuição para revisão humana.
                </small>
              </div>
              <button
                type="button"
                onClick={() => {
                  const first = kanbanV30BatchItems[0];
                  if (!first) return;
                  setFocus("prioridade");
                  setSort("prioridade");
                  setFocusMode(true);
                  setCompact(true);
                  setMobileStage(first.currentStage);
                  openLeadPreview(first.lead.id, "queue");
                }}
                disabled={!kanbanV30BatchHasSelection}
              >
                Focar lote
              </button>
            </div>
            <div className="atlas-kanban-v30-batch-dock-grid">
              <div
                className="atlas-kanban-v30-batch-selectors"
                aria-label="Selecionar leads do lote seguro"
              >
                {kanbanV30Heatline.length > 0 ? (
                  kanbanV30Heatline.map((item) => {
                    const selected = kanbanV30BatchSelection.includes(
                      item.lead.id,
                    );

                    return (
                      <button
                        key={`batch-${item.key}`}
                        type="button"
                        aria-pressed={selected}
                        data-priority={item.priority}
                        data-selected={selected}
                        onClick={() => toggleKanbanV30BatchLead(item.lead.id)}
                      >
                        <span>
                          {selected ? "✓" : String(item.rank).padStart(2, "0")}
                        </span>
                        <div>
                          <strong>{item.lead.name || "Lead sem nome"}</strong>
                          <small>
                            {item.signal} · {item.stageLabel}
                          </small>
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="atlas-kanban-v30-batch-empty">
                    Sem prioridades suficientes para montar lote agora.
                  </div>
                )}
              </div>
              <div
                className="atlas-kanban-v30-batch-plan"
                aria-label="Resumo do plano seguro"
              >
                <article>
                  <span>Prioridade</span>
                  <strong>
                    {kanbanV30BatchSummary.critical > 0
                      ? `${kanbanV30BatchSummary.critical} crítico(s)`
                      : "Sem crítico"}
                  </strong>
                  <small>
                    Comece por SLA, proposta parada e ausência de próxima ação.
                  </small>
                </article>
                <article>
                  <span>Etapas</span>
                  <strong>{kanbanV30BatchSummary.stagesCount || 0}</strong>
                  <small>
                    O lote respeita o estágio atual antes de sugerir execução.
                  </small>
                </article>
                <article>
                  <span>Governança</span>
                  <strong>Revisão humana</strong>
                  <small>
                    O Atlas recomenda. O time aprova antes de qualquer contato.
                  </small>
                </article>
              </div>
            </div>
            <div
              className="atlas-kanban-v30-qualification-matrix"
              data-v30-phase="149-kanban-v30-qualification-signal-matrix"
              aria-label="Matriz de qualificação do lote prioritário"
            >
              <div className="atlas-kanban-v30-qualification-head">
                <div>
                  <span>Memória comercial</span>
                  <strong>
                    {kanbanV30QualificationMatrix.coverage}% de cobertura no
                    lote
                  </strong>
                  <small>
                    {kanbanV30QualificationMatrix.missingTotal > 0
                      ? `${kanbanV30QualificationMatrix.missingTotal} sinais ainda faltam para melhorar score, abordagem e aprendizado Meta.`
                      : "Lote pronto para abordagem com contexto suficiente."}
                  </small>
                </div>
                <Link
                  aria-disabled={!kanbanV30BatchHasSelection}
                  href={
                    kanbanV30BatchHasSelection
                      ? `/leads/data-quality?source=kanban-v30&leadIds=${kanbanV30BatchSummary.query}`
                      : "/leads/data-quality"
                  }
                >
                  Abrir qualidade
                </Link>
              </div>
              <div className="atlas-kanban-v30-qualification-grid">
                {kanbanV30QualificationMatrix.signals.length > 0 ? (
                  kanbanV30QualificationMatrix.signals.map((signal) => (
                    <article key={`qualification-${signal.key}`}>
                      <span>
                        {signal.label} · {signal.count}
                      </span>
                      <strong>{signal.question}</strong>
                      <small>{signal.impact}</small>
                      <em>
                        {signal.leadNames.slice(0, 2).join(", ")}
                        {signal.leadNames.length > 2
                          ? ` +${signal.leadNames.length - 2}`
                          : ""}
                      </em>
                    </article>
                  ))
                ) : (
                  <article className="atlas-kanban-v30-qualification-ready">
                    <span>Pronto</span>
                    <strong>Sem lacuna crítica no lote.</strong>
                    <small>
                      A IA pode priorizar a abordagem, proposta ou follow-up com
                      menos ruído.
                    </small>
                  </article>
                )}
              </div>
            </div>
            <div
              className="atlas-kanban-v30-conversion-brief"
              data-v30-phase="150-kanban-v30-proactive-conversion-brief"
              data-tone={kanbanV30ConversionBrief.tone}
              aria-label="Brief proativo de conversão do lote prioritário"
            >
              <div className="atlas-kanban-v30-conversion-brief-head">
                <div>
                  <span>Brief proativo</span>
                  <strong>{kanbanV30ConversionBrief.intent}</strong>
                  <small>
                    {kanbanV30ConversionBrief.leadLabel} · sugestão pronta para
                    revisão humana.
                  </small>
                </div>
                <Link
                  aria-disabled={!kanbanV30BatchHasSelection}
                  href={
                    kanbanV30BatchHasSelection
                      ? kanbanV30ConversionBrief.href
                      : "/leads/actions"
                  }
                >
                  Abrir Copilot
                </Link>
              </div>
              <div className="atlas-kanban-v30-conversion-brief-steps">
                {kanbanV30ConversionBrief.steps.map((step) => (
                  <article key={`conversion-brief-${step.label}`}>
                    <span>{step.label}</span>
                    <strong>{step.detail}</strong>
                  </article>
                ))}
              </div>
            </div>
            <div
              className="atlas-kanban-v30-execution-runway"
              data-v30-phase="151-kanban-v30-assisted-execution-runway"
              aria-label="Esteira assistida de execução do lote prioritário"
            >
              <div className="atlas-kanban-v30-execution-runway-head">
                <div>
                  <span>Execução assistida</span>
                  <strong>4 passos para converter sem perder histórico</strong>
                  <small>
                    O Atlas organiza a ação, mas nada é enviado ou movido sem
                    confirmação humana.
                  </small>
                </div>
                <em>
                  {kanbanV30BatchHasSelection
                    ? `${kanbanV30BatchSummary.count} no lote`
                    : "Aguardando seleção"}
                </em>
              </div>
              <div className="atlas-kanban-v30-execution-runway-steps">
                {kanbanV30AssistedExecutionRunway.map((step, index) => (
                  <article key={`execution-runway-${step.label}`}>
                    <div>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <em>{step.status}</em>
                    </div>
                    <strong>{step.label}</strong>
                    <small>{step.detail}</small>
                    <Link
                      aria-disabled={!kanbanV30BatchHasSelection}
                      href={
                        kanbanV30BatchHasSelection
                          ? step.href
                          : "/leads/actions"
                      }
                    >
                      {step.cta}
                    </Link>
                  </article>
                ))}
              </div>
            </div>
            <div
              className="atlas-kanban-v30-broker-focus"
              data-v30-phase="152-kanban-v30-broker-focus-mode"
              aria-label="Modo foco do corretor no Kanban"
            >
              <div className="atlas-kanban-v30-broker-focus-main">
                <span>Modo foco do corretor</span>
                <strong>{kanbanV30BrokerFocus.title}</strong>
                <small>
                  {kanbanV30BrokerFocus.projectLabel} ·{" "}
                  {kanbanV30BrokerFocus.valueLabel}
                </small>
                <p>{kanbanV30BrokerFocus.reason}</p>
              </div>
              <div className="atlas-kanban-v30-broker-focus-actions">
                <button
                  type="button"
                  disabled={!kanbanV30BrokerFocus.item}
                  onClick={() => {
                    const item = kanbanV30BrokerFocus.item;
                    if (!item) return;
                    setFocus(item.focus);
                    setSort("prioridade");
                    setFocusMode(true);
                    setCompact(true);
                    setHideEmpty(true);
                    setMobileStage(item.currentStage);
                    openLeadPreview(item.lead.id, "queue");
                  }}
                >
                  Ativar foco
                </button>
                {kanbanV30BrokerFocus.actions.map((action) =>
                  action.external ? (
                    <a
                      key={`broker-focus-${action.label}`}
                      href={action.href}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {action.label}
                    </a>
                  ) : (
                    <Link
                      key={`broker-focus-${action.label}`}
                      href={action.href}
                    >
                      {action.label}
                    </Link>
                  ),
                )}
              </div>
            </div>
            <div className="atlas-kanban-v30-batch-actions">
              <Link
                aria-disabled={!kanbanV30BatchHasSelection}
                href={
                  kanbanV30BatchHasSelection
                    ? `/tasks?source=kanban-v30&leadIds=${kanbanV30BatchSummary.query}`
                    : "/tasks"
                }
              >
                Criar tarefas
              </Link>
              <Link
                aria-disabled={!kanbanV30BatchHasSelection}
                href={
                  kanbanV30BatchHasSelection
                    ? `/leads/actions?source=kanban-v30&intent=batch_follow_up&leadIds=${kanbanV30BatchSummary.query}`
                    : "/leads/actions"
                }
              >
                Mensagem IA
              </Link>
              <Link
                aria-disabled={!kanbanV30BatchHasSelection}
                href={
                  kanbanV30BatchHasSelection
                    ? `/distribution?source=kanban-v30&leadIds=${kanbanV30BatchSummary.query}`
                    : "/distribution"
                }
              >
                Distribuir com segurança
              </Link>
              <button
                type="button"
                onClick={() =>
                  setKanbanV30BatchSelection(
                    kanbanV30Heatline.slice(0, 3).map((item) => item.lead.id),
                  )
                }
              >
                Resetar top 3
              </button>
            </div>
          </section>
          <section
            className="atlas-kanban-v30-decision-strip"
            data-v30-phase="141-kanban-v30-decision-strip"
            aria-label="Decisões prioritárias do Kanban"
          >
            <div className="atlas-kanban-v30-decision-strip-head">
              <span>Decisões do dia</span>
              <strong>3 ações para mover o funil agora</strong>
              <small>
                O Atlas combina urgência, valor, score e etapa para reduzir
                ruído e transformar o Kanban em execução.
              </small>
            </div>
            <div className="atlas-kanban-v30-decision-grid">
              {kanbanV30NextMoveQueue.length > 0 ? (
                kanbanV30NextMoveQueue.slice(0, 3).map((item, index) => {
                  const leadName = item.lead.name || "Lead sem nome";
                  const currentStage = (item.lead.status ?? "novo") as StageKey;

                  return (
                    <article
                      key={`decision-${item.key}`}
                      className="atlas-kanban-v30-decision-card"
                      data-priority={item.priority}
                    >
                      <div className="atlas-kanban-v30-decision-card-rank">
                        <span>{String(index + 1).padStart(2, "0")}</span>
                        <em>{item.signal}</em>
                      </div>
                      <div className="atlas-kanban-v30-decision-card-body">
                        <strong>{item.decision}</strong>
                        <Link href={`/leads/${item.lead.id}`}>{leadName}</Link>
                        <p>{item.reason}</p>
                      </div>
                      <div className="atlas-kanban-v30-decision-card-facts">
                        <span>
                          <small>Etapa</small>
                          <b>{item.stageLabel}</b>
                        </span>
                        <span>
                          <small>Valor</small>
                          <b>{item.valueLabel}</b>
                        </span>
                        <span>
                          <small>Score</small>
                          <b>{item.lead.score ?? 0}</b>
                        </span>
                      </div>
                      <div className="atlas-kanban-v30-decision-card-actions">
                        <button
                          type="button"
                          onClick={() => {
                            setFocus(item.focus);
                            setMobileStage(currentStage);
                            setFocusMode(true);
                            setCompact(true);
                          }}
                        >
                          Focar no quadro
                        </button>
                        <Link
                          href={executionIntentUrl(
                            item.lead,
                            item.executionIntent,
                          )}
                        >
                          {item.actionLabel}
                        </Link>
                        <Link
                          href={copilotIntentUrl(item.lead, item.copilotIntent)}
                        >
                          Copilot
                        </Link>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="atlas-kanban-v30-decision-empty">
                  <strong>Nenhuma decisão crítica no recorte atual.</strong>
                  <span>
                    O Atlas continua monitorando SLA, etapa parada, score e
                    próxima ação.
                  </span>
                </div>
              )}
            </div>
          </section>
          <div id="atlas-kanban-v30-board-instructions" className="sr-only">
            Use Tab para entrar nos cards. Com um card em foco, Alt mais seta
            para esquerda ou direita move a oportunidade entre etapas. Abra o
            contexto para roteiro, histórico e ações completas.
          </div>
          <div
            className="atlas-kanban-v30-interaction-guide"
            data-v30-phase="144-kanban-v30-accessible-motion"
            aria-label="Guia rápido de uso do Kanban"
          >
            <div>
              <span>Modo de operação</span>
              <strong>
                {KANBAN_LENS_LABEL[effectiveKanbanLens]} ·{" "}
                {KANBAN_FOCUS_LABEL[focus]}
              </strong>
            </div>
            {KANBAN_V30_INTERACTION_GUIDE.map((hint) => (
              <span key={hint.label}>
                <kbd>{hint.shortcut}</kbd>
                <b>{hint.label}</b>
                <small>{hint.detail}</small>
              </span>
            ))}
          </div>
        </AtlasDetailDisclosure>
        <div
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {kanbanA11yStatus}
        </div>
        <div
          className="atlas-kanban-v30-mobile-decision"
          data-v30-phase="145-kanban-v30-mobile-decision-mode"
          data-v3000-phase="44-single-primary-action"
          data-primary-action-count="1"
          data-tone={kanbanV30MobileDecision.tone}
        >
          <div>
            <span>Decisão mobile · {kanbanV30MobileDecision.stageLabel}</span>
            <strong>{kanbanV30MobileDecision.title}</strong>
            <small>{kanbanV30MobileDecision.detail}</small>
          </div>
          <div className="atlas-kanban-v30-mobile-decision-actions">
            {kanbanV30MobileDecision.targetStage &&
            kanbanV30MobileDecision.lead ? (
              <button
                type="button"
                disabled={savingId === kanbanV30MobileDecision.lead.id}
                onClick={() =>
                  void moveLead(
                    kanbanV30MobileDecision.lead!.id,
                    kanbanV30MobileDecision.targetStage!,
                  )
                }
              >
                {savingId === kanbanV30MobileDecision.lead.id
                  ? "Movendo..."
                  : kanbanV30MobileDecision.actionLabel}
              </button>
            ) : kanbanV30MobileDecision.external ? (
              <a
                href={kanbanV30MobileDecision.actionHref}
                target="_blank"
                rel="noreferrer"
              >
                {kanbanV30MobileDecision.actionLabel}
              </a>
            ) : (
              <Link href={kanbanV30MobileDecision.actionHref}>
                {kanbanV30MobileDecision.actionLabel}
              </Link>
            )}
          </div>
          <details
            className="atlas-kanban-v30-mobile-secondary"
            data-secondary-actions="context-only"
          >
            <summary>Outras ações</summary>
            <div>
              {kanbanV30MobileDecision.lead ? (
                <Link href={`/leads/${kanbanV30MobileDecision.lead.id}`}>
                  Abrir Lead 360
                </Link>
              ) : (
                <button type="button" onClick={resetKanbanFilters}>
                  Ver prioridade
                </button>
              )}
              {kanbanV30MobileDecision.lead ? (
                <Link
                  href={copilotIntentUrl(
                    kanbanV30MobileDecision.lead,
                    "follow_up",
                  )}
                >
                  Preparar com IA
                </Link>
              ) : (
                <Link href="/leads/reactivation-governance">Reativar</Link>
              )}
            </div>
          </details>
        </div>
        <div
          className="atlas-kanban-mobile-nav"
          role="tablist"
          aria-label="Escolher etapa no celular"
        >
          {boardStages.map((stage) => (
            <button
              key={stage.key}
              type="button"
              role="tab"
              aria-selected={activeMobileStage === stage.key}
              onClick={() => setMobileStage(stage.key)}
              className={activeMobileStage === stage.key ? "is-active" : ""}
            >
              <span>{stage.label}</span>
              <b>{stage.items.length}</b>
              <small>
                {stage.health.urgent > 0
                  ? `${stage.health.urgent} urg.`
                  : `${stage.health.hot} hot`}
              </small>
            </button>
          ))}
        </div>
        <div
          className="atlas-kanban-scroll p-4 sm:p-6"
          tabIndex={0}
          aria-label="Quadro Kanban com rolagem horizontal"
          aria-describedby="atlas-kanban-v30-board-instructions"
          aria-busy={loading}
        >
          {draggedLead ? (
            <div
              className="atlas-kanban-drag-preview"
              data-drag-preview="phase-115"
              data-motion-purpose="state-change"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span>Movendo lead</span>
              <strong>{draggedLead.name || "Lead sem nome"}</strong>
              <small>
                {dragTargetStage
                  ? `Solte para enviar para ${dragTargetStage.label}`
                  : "Escolha uma etapa para soltar com segurança."}
              </small>
            </div>
          ) : null}
          {movementIntentLead && !draggedLead ? (
            <div
              className="atlas-kanban-movement-intent"
              data-ux-phase="37-just-in-time-movement-rule"
              data-motion-purpose="state-change"
              role="status"
            >
              <span>Movimentação disponível</span>
              <strong>{movementIntentLead.name || "Lead sem nome"}</strong>
              <small>
                {movementIntentPreviousStage
                  ? `Alt + ← volta para ${movementIntentPreviousStage.label}. `
                  : "Esta é a primeira etapa. "}
                {movementIntentNextStage
                  ? `Alt + → avança para ${movementIntentNextStage.label}.`
                  : "Revise a decisão final no contexto."}
                {movementIntentNextStage &&
                ["ganho", "perdido", "comprou_outro"].includes(
                  movementIntentNextStage.key,
                )
                  ? " A etapa final exige confirmação."
                  : ""}
              </small>
            </div>
          ) : null}
          <div
            className={`atlas-kanban-board atlas-kanban-board-v30 ${compact ? "is-compact" : ""}`}
            data-redesign="phase-125"
            data-v30-kanban="decision-board"
            data-v3000-phase="53-decision-kanban"
            data-v3000-accessibility-phase="54-motion-focus-accessibility"
            data-motion-purpose={loading ? "data-arrival" : "none"}
            data-v30-phase="144-kanban-v30-accessible-motion 147-kanban-v30-predictive-heatline"
            style={
              {
                "--kanban-columns": Math.max(1, boardStages.length),
                "--kanban-track-template": kanbanTrackTemplate,
                "--kanban-board-min-width": `${kanbanBoardMinimumWidth}px`,
              } as CSSProperties
            }
            aria-describedby="atlas-kanban-v30-board-instructions"
            aria-busy={loading || Boolean(savingId)}
          >
            {boardStages.length === 0 ? (
              <div
                className="atlas-kanban-v30-board-empty-shell"
                data-v30-phase="143-kanban-v30-recovery-states"
              >
                <span>Quadro sem colunas visíveis</span>
                <strong>
                  Mostre todas as etapas para recuperar a navegação.
                </strong>
                <p>
                  O funil continua preservado; apenas o recorte atual ocultou as
                  colunas do Kanban.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setHideEmpty(false);
                    setFocus("todas");
                  }}
                >
                  Mostrar funil completo
                </button>
              </div>
            ) : (
              boardStages.map((stage) => {
                const stageIndex = stageIndexByKey.get(stage.key) ?? -1;
                const nextStage =
                  stageIndex >= 0 ? stages[stageIndex + 1] : undefined;
                const stageVisibleLimit = compact
                  ? 5
                  : KANBAN_PROGRESSIVE_VISIBLE_LIMIT;
                const isStageExpanded = expandedStages[stage.key] === true;
                const visibleStageItems = isStageExpanded
                  ? stage.items
                  : stage.items.slice(0, stageVisibleLimit);
                const hiddenStageItems = Math.max(
                  0,
                  stage.items.length - visibleStageItems.length,
                );
                const totalStageItems = stageTotalCounts.get(stage.key) ?? 0;
                const isFilteredEmptyStage =
                  totalStageItems > 0 && stage.items.length === 0;
                const isEmptyStage = stage.items.length === 0;
                const isEmptyStageExpanded =
                  !isEmptyStage || expandedEmptyStageKeys.has(stage.key);

                return (
                  <section
                    key={stage.key}
                    role="tabpanel"
                    aria-label={`${stage.label}: ${stage.items.length} leads`}
                    tabIndex={isEmptyStage ? 0 : undefined}
                    data-ux-phase="38-adaptive-empty-stage"
                    data-empty-column={isEmptyStage ? "true" : "false"}
                    data-empty-column-state={
                      isEmptyStageExpanded ? "expanded" : "compact"
                    }
                    data-drop-intent={
                      draggedId
                        ? dragOverStage === stage.key
                          ? "ready"
                          : "available"
                        : "idle"
                    }
                    onDragEnter={() => setDragOverStage(stage.key)}
                    onFocus={() => {
                      if (isEmptyStage) setEmptyStageIntentKey(stage.key);
                    }}
                    onBlur={(event) => {
                      if (
                        isEmptyStage &&
                        !event.currentTarget.contains(
                          event.relatedTarget as Node,
                        )
                      )
                        setEmptyStageIntentKey(null);
                    }}
                    onDragLeave={(event) => {
                      if (
                        !event.currentTarget.contains(
                          event.relatedTarget as Node,
                        )
                      )
                        setDragOverStage(null);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => onDrop(event, stage.key)}
                    className={`atlas-pipeline-column ${isEmptyStage ? "is-empty-stage" : ""} ${isEmptyStage && !isEmptyStageExpanded ? "is-empty-collapsed" : ""} ${dragOverStage === stage.key ? "is-drop-target" : ""} ${activeMobileStage !== stage.key ? "is-mobile-hidden" : ""}`}
                  >
                    <div
                      className="atlas-pipeline-column-header atlas-pipeline-column-header-v40 atlas-kanban-stage-decision-zone"
                      data-ux-phase="40-command-to-priority-flow 53-decision-kanban"
                      data-rhythm-zone="stage-decision"
                      data-priority-continuation={
                        stage.items.length > 0 ? "lead" : "empty"
                      }
                    >
                      <div
                        className="atlas-kanban-v3000-decision-header"
                        data-v3000-phase="53-decision-header"
                        aria-label={`${stage.label}: ${stage.decisionHeader.volume} oportunidades, ${brl.format(stage.decisionHeader.validValue)} em valor válido. Gargalo principal: ${stage.decisionHeader.bottleneck.label}.`}
                      >
                        <h3 className="text-sm font-semibold text-white">
                          {stage.label}
                        </h3>
                        <div className="atlas-kanban-v3000-decision-metrics">
                          <span data-stage-metric="volume">
                            <strong>{stage.decisionHeader.volume}</strong>
                            <small>leads</small>
                          </span>
                          <span data-stage-metric="valid-value">
                            <strong>
                              {brl.format(stage.decisionHeader.validValue)}
                            </strong>
                            <small>valor válido</small>
                          </span>
                          <span
                            data-stage-metric="main-bottleneck"
                            data-tone={stage.decisionHeader.bottleneck.tone}
                          >
                            <strong>
                              {stage.decisionHeader.bottleneck.label}
                            </strong>
                            <small>
                              {stage.decisionHeader.bottleneck.detail}
                            </small>
                          </span>
                        </div>
                      </div>
                    </div>
                    <details
                      className="atlas-kanban-v3000-stage-support"
                      data-v3000-phase="53-progressive-stage-support"
                    >
                      <summary>
                        <span>Comando e contexto</span>
                        <strong>{stage.v30Command.label}</strong>
                      </summary>
                      <div
                        className="atlas-kanban-v30-stage-command atlas-kanban-v30-stage-decision-bridge"
                        data-v30-phase="137-kanban-v30-stage-command"
                        data-ux-phase="40-command-to-priority-flow"
                        data-visual-priority="primary-command"
                        data-tone={stage.v30Command.tone}
                      >
                        <div className="atlas-kanban-v30-stage-command-copy">
                          <span>Comando da etapa</span>
                          <strong>{stage.v30Command.label}</strong>
                          <small>{stage.v30Command.detail}</small>
                        </div>
                        {stage.stageActionLead ? (
                          <div
                            className="atlas-kanban-v30-stage-action-lead atlas-kanban-v30-stage-priority-bridge"
                            data-v30-phase="140-kanban-v30-action-mode"
                            data-tone={stage.stageActionLead.tone}
                          >
                            <div>
                              <span>Prioridade agora</span>
                              <Link
                                href={`/leads/${stage.stageActionLead.lead.id}`}
                              >
                                <strong>
                                  {stage.stageActionLead.lead.name ||
                                    "Lead sem nome"}
                                </strong>
                              </Link>
                              <small>{stage.stageActionLead.detail}</small>
                            </div>
                            <p>
                              <b>{stage.stageActionLead.scoreLabel}</b>
                              <em>{stage.stageActionLead.valueLabel}</em>
                            </p>
                            {stage.stageActionLead.targetStage ? (
                              <button
                                type="button"
                                disabled={
                                  savingId === stage.stageActionLead.lead.id
                                }
                                onClick={() =>
                                  void moveLead(
                                    stage.stageActionLead!.lead.id,
                                    stage.stageActionLead!.targetStage!,
                                  )
                                }
                              >
                                {savingId === stage.stageActionLead.lead.id
                                  ? "Movendo..."
                                  : stage.stageActionLead.actionLabel}
                              </button>
                            ) : stage.stageActionLead.external ? (
                              <a
                                href={stage.stageActionLead.actionHref}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {stage.stageActionLead.actionLabel}
                              </a>
                            ) : (
                              <Link href={stage.stageActionLead.actionHref}>
                                {stage.stageActionLead.actionLabel}
                              </Link>
                            )}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEmptyStageIntentKey(stage.key);
                              setMobileStage(stage.key);
                              setFocus(stage.v30Command.focus);
                              setFocusMode(true);
                              setCompact(false);
                            }}
                          >
                            {stage.v30Command.actionLabel}
                          </button>
                        )}
                        {stage.stageActionLead ? (
                          <button
                            className="atlas-kanban-v30-stage-focus-action"
                            type="button"
                            onClick={() => {
                              setMobileStage(stage.key);
                              setFocus(stage.v30Command.focus);
                              setFocusMode(true);
                              setCompact(false);
                            }}
                          >
                            Focar etapa
                          </button>
                        ) : null}
                      </div>
                      <div
                        className="atlas-kanban-stage-context"
                        data-ux-phase="39-progressive-column-density"
                        data-visual-priority="secondary-context"
                      >
                        <div
                          className="atlas-stage-decision-row"
                          data-tone={stage.decision.tone}
                        >
                          <strong>{stage.decision.label}</strong>
                          <span>{stage.decision.detail}</span>
                        </div>
                        <div
                          className="atlas-stage-pulse-row"
                          aria-label={`Saúde operacional da etapa ${stage.label}`}
                        >
                          <span>
                            <strong>{stage.health.urgent}</strong> urgente
                          </span>
                          <span>
                            <strong>{stage.health.hot}</strong> quente
                          </span>
                          <span>
                            <strong>{stage.health.noAction}</strong> sem ação
                          </span>
                          <span>
                            <strong>{stage.health.avgScore}</strong> score
                          </span>
                        </div>
                        {stage.items[0] ? (
                          <div
                            className="atlas-stage-lens-priority"
                            data-lens={effectiveKanbanLens}
                            data-lens-ranking="phase-117"
                          >
                            <span>
                              {KANBAN_LENS_LABEL[effectiveKanbanLens]} prioriza
                            </span>
                            <strong>
                              {stage.items[0].name || "Lead sem nome"}
                            </strong>
                          </div>
                        ) : null}
                        <div
                          className="atlas-stage-action-microcopy"
                          data-stage-action="phase-124"
                          data-tone={stage.microcopy.tone}
                        >
                          <div>
                            <span>Ação da etapa</span>
                            <strong>{stage.microcopy.title}</strong>
                          </div>
                          <p>{stage.microcopy.detail}</p>
                          <em>{stage.microcopy.cta}</em>
                        </div>
                      </div>
                    </details>
                    {draggedId && dragOverStage === stage.key ? (
                      <div
                        className="atlas-kanban-drop-hint"
                        data-drop-hint="phase-115"
                      >
                        <span>Solte aqui</span>
                        <strong>{stage.label}</strong>
                        <small>
                          O Atlas salva o histórico e permite desfazer.
                        </small>
                      </div>
                    ) : null}
                    {loading ? (
                      <div
                        className="atlas-kanban-stage-card-stream"
                        data-ux-phase="41-semantic-column-rhythm"
                        data-rhythm-zone="stage-loading"
                      >
                        {[1, 2, 3].map((item) => (
                          <AtlasSkeleton key={item} className="h-36 w-full" />
                        ))}
                      </div>
                    ) : stage.items.length === 0 ? (
                      <div
                        className="atlas-kanban-v30-empty-stage"
                        data-v30-phase="143-kanban-v30-recovery-states"
                        data-empty-state={
                          isFilteredEmptyStage ? "filtered" : "ready"
                        }
                      >
                        <span>
                          {isFilteredEmptyStage
                            ? "Filtro ativo"
                            : "Etapa pronta"}
                        </span>
                        <strong>{stage.label}</strong>
                        <p>
                          {isFilteredEmptyStage
                            ? `${totalStageItems} oportunidade(s) existem nesta etapa fora do recorte atual. Limpe filtros para voltar a enxergar tudo.`
                            : "Sem oportunidades aqui. O Atlas mantém o espaço pronto para receber leads sem poluir o quadro."}
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setMobileStage(stage.key);
                            setFocus(
                              isFilteredEmptyStage ? "todas" : "prioridade",
                            );
                            setHideEmpty(false);
                            if (isFilteredEmptyStage) setQuery("");
                          }}
                        >
                          {isFilteredEmptyStage
                            ? "Ver etapa completa"
                            : "Monitorar etapa"}
                        </button>
                      </div>
                    ) : (
                      <div
                        className="atlas-kanban-stage-card-stream"
                        data-ux-phase="41-semantic-column-rhythm"
                        data-rhythm-zone="stage-opportunities"
                        data-priority-transition="connected"
                      >
                        {visibleStageItems.map((lead, leadIndex) => {
                          const risk = leadRisk(lead);
                          const contactSla = firstContactSla(lead);
                          const guidance = brokerGuidance(lead);
                          const contact = phoneLinks(lead.phone);
                          const signals = leadSignals(lead);
                          const playbook = kanbanActionPlaybook(lead);
                          const essentials = kanbanCardEssentials(
                            lead,
                            guidance,
                          );
                          const v30Card = kanbanV30CardSnapshot(
                            lead,
                            guidance,
                            stage,
                            nextStage,
                            effectiveKanbanLens,
                          );
                          const roleOrientedCard = buildRoleOrientedCard({
                            actionDetail: v30Card.primaryAction.detail,
                            actionLabel: v30Card.primaryAction.label,
                            assignedName: lead.assigned_name,
                            exception:
                              v30Card.decisiveObjection.status !== "clear"
                                ? {
                                    detail: v30Card.decisiveObjection.detail,
                                    label: v30Card.decisiveObjection.headline,
                                    tone: v30Card.decisiveObjection.tone,
                                  }
                                : null,
                            potentialLabel: lead.budget_max
                              ? brl.format(lead.budget_max)
                              : null,
                            projectName: leadProjectLabel(lead),
                            role: identityLens,
                            stageLabel: stage.label,
                          });
                          const v30CommercialClock = commercialClock(
                            lead,
                            guidance,
                          );
                          const v30Conversation =
                            kanbanV30ConversationContinuity(lead);
                          const projectCompatibility =
                            lead.project_compatibility;
                          const projectValidationState =
                            projectCompatibility?.status ?? "unavailable";
                          const projectValidationLabel =
                            projectCompatibility?.status ===
                            "evidence_available"
                              ? "Aderência comprovada"
                              : projectCompatibility?.status ===
                                  "needs_qualification"
                                ? "Validar aderência"
                                : projectCompatibility?.status ===
                                    "project_unavailable"
                                  ? "Vincular projeto"
                                  : "Validação pendente";
                          const v30NextStage = v30Card.nextStage;
                          const v30PrioritySignal = kanbanV30PriorityIndex.get(
                            lead.id,
                          );
                          const accessibleStageIndex =
                            stageIndexByKey.get(stage.key) ?? -1;
                          const cardAccessibility =
                            buildKanbanCardAccessibility({
                              busy: savingId === lead.id,
                              currentStageLabel: stage.label,
                              leadName: lead.name,
                              nextActionLabel: v30Card.primaryAction.label,
                              nextStageLabel:
                                accessibleStageIndex >= 0
                                  ? stages[accessibleStageIndex + 1]?.label
                                  : null,
                              previousStageLabel:
                                accessibleStageIndex > 0
                                  ? stages[accessibleStageIndex - 1]?.label
                                  : null,
                              projectName: leadProjectLabel(lead),
                            });
                          return (
                            <article
                              key={lead.id}
                              draggable={!savingId}
                              tabIndex={0}
                              aria-busy={savingId === lead.id}
                              aria-keyshortcuts={cardAccessibility.keyShortcuts}
                              data-disabled={Boolean(savingId)}
                              aria-describedby={`lead-${lead.id}-kanban-hint`}
                              aria-label={cardAccessibility.label}
                              onFocus={() => setMovementIntentLeadId(lead.id)}
                              onBlur={(event) => {
                                if (
                                  !event.currentTarget.contains(
                                    event.relatedTarget as Node,
                                  )
                                )
                                  setMovementIntentLeadId(null);
                              }}
                              onKeyDown={(event) => {
                                if (event.altKey && event.key === "ArrowLeft") {
                                  event.preventDefault();
                                  moveByKeyboard(lead, -1);
                                }
                                if (
                                  event.altKey &&
                                  event.key === "ArrowRight"
                                ) {
                                  event.preventDefault();
                                  moveByKeyboard(lead, 1);
                                }
                              }}
                              onDragEnd={() => {
                                setDraggedId(null);
                                setDragOverStage(null);
                                setMovementIntentLeadId(null);
                              }}
                              onDragStart={(event) => {
                                if (savingId) {
                                  event.preventDefault();
                                  return;
                                }
                                setMovementIntentLeadId(lead.id);
                                setDraggedId(lead.id);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData(
                                  "text/lead-id",
                                  lead.id,
                                );
                              }}
                              className={`atlas-pipeline-lead atlas-pipeline-lead-v30 group ${savingId === lead.id ? "opacity-60" : ""} ${draggedId === lead.id ? "is-dragging" : ""}`}
                              data-risk={risk}
                              data-adaptive-density="role-and-device"
                              data-adaptive-density-contract={ATLAS_ADAPTIVE_DENSITY_CONTRACT}
                              data-decision-contract={ATLAS_DECISION_CARD_CONTRACT}
                              data-progressive-contract={ATLAS_PROGRESSIVE_DECISION_CONTRACT}
                              data-progressive-reading="decision-context-history"
                              data-decision-preserved="project validation next-action movement-audit"
                              data-v3000-accessibility="wcag-aa keyboard-movement live-status reduced-motion"
                              data-motion-purpose={
                                draggedId === lead.id ? "state-change" : "none"
                              }
                              data-card-decision={guidance.tone}
                              data-card-shell="phase-114"
                              data-noise-reduction="phase-125"
                              data-v30-card="phase-135-decision-card"
                              data-ux-phase="34-essential-decision-card"
                              data-stage-priority={
                                leadIndex === 0 ? "primary" : "standard"
                              }
                              data-stage-entry={
                                leadIndex === 0 ? "continuation" : "portfolio"
                              }
                              data-v30-phase="144-kanban-v30-accessible-motion 147-kanban-v30-predictive-heatline"
                            >
                              <span
                                id={`lead-${lead.id}-kanban-hint`}
                                className="sr-only"
                              >
                                {cardAccessibility.description}
                              </span>
                              <div className="atlas-kanban-v30-card-head">
                                <div
                                  className="atlas-kanban-v30-commercial-identity"
                                  data-commercial-identity="complete"
                                  data-v3000-phase="42-commercial-identity"
                                >
                                  <Link href={`/leads/${lead.id}`}>
                                    {lead.name || "Lead sem nome"}
                                  </Link>
                                  <strong>{leadProjectLabel(lead)}</strong>
                                  <dl aria-label="Identidade comercial da oportunidade">
                                    <div>
                                      <dt>Etapa</dt>
                                      <dd>{stage.label}</dd>
                                    </div>
                                    <div>
                                      <dt>Origem</dt>
                                      <dd>
                                        {lead.source?.trim() ||
                                          metaCampaign(lead) ||
                                          "Origem não informada"}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Responsável</dt>
                                      <dd>
                                        {lead.assigned_name?.trim() ||
                                          (lead.assigned_to
                                            ? "Responsável vinculado"
                                            : "Sem responsável")}
                                      </dd>
                                    </div>
                                  </dl>
                                  <p>
                                    <span>Última interação</span>
                                    <b>
                                      {lead.last_interaction_at
                                        ? relativeTime(lead.last_interaction_at)
                                        : "Sem interação registrada"}
                                    </b>
                                  </p>
                                </div>
                                {v30PrioritySignal ? (
                                  <div
                                    className="atlas-kanban-v30-card-priority-mark"
                                    data-priority={v30PrioritySignal.priority}
                                    data-tone={v30PrioritySignal.tone}
                                    data-v30-phase="147-kanban-v30-predictive-heatline"
                                  >
                                    <span>#{v30PrioritySignal.rank}</span>
                                    <strong>{v30PrioritySignal.label}</strong>
                                  </div>
                                ) : (
                                  <div
                                    className="atlas-kanban-v30-card-priority-mark"
                                    data-priority="watch"
                                    data-tone={essentials.urgencyTone}
                                  >
                                    <span>Agora</span>
                                    <strong>{essentials.urgencyLabel}</strong>
                                  </div>
                                )}
                              </div>

                              <div
                                className="atlas-kanban-v3000-decision-preservation"
                                data-v3000-phase="53-decision-preservation"
                                aria-label="Contexto preservado da decisão"
                              >
                                <span>
                                  <small>Projeto</small>
                                  <strong>{leadProjectLabel(lead)}</strong>
                                </span>
                                <span data-state={projectValidationState}>
                                  <small>Validação</small>
                                  <strong>{projectValidationLabel}</strong>
                                </span>
                                <span>
                                  <small>Próxima ação</small>
                                  <strong>{v30Card.primaryAction.label}</strong>
                                </span>
                              </div>

                              <details
                                className="atlas-kanban-v3000-card-context"
                                data-v3000-phase="53-progressive-card-context"
                                data-motion-purpose="disclosure"
                              >
                                <summary>
                                  <span>Contexto operacional</span>
                                  <strong>{v30CommercialClock.deadline}</strong>
                                </summary>

                                <section
                                  className="atlas-kanban-v30-commercial-clock"
                                  data-clock-state={v30CommercialClock.state}
                                  data-tone={v30CommercialClock.tone}
                                  data-v3000-phase="43-commercial-clock"
                                  aria-label={`Relógio comercial: ${v30CommercialClock.deadline}. Causa: ${v30CommercialClock.cause}. Ação: ${v30CommercialClock.action}.`}
                                >
                                  <header>
                                    <span>Relógio comercial</span>
                                    <strong>
                                      {v30CommercialClock.deadline}
                                    </strong>
                                  </header>
                                  <dl>
                                    <div>
                                      <dt>Causa</dt>
                                      <dd>{v30CommercialClock.cause}</dd>
                                    </div>
                                    <div>
                                      <dt>Impacto</dt>
                                      <dd>{v30CommercialClock.impact}</dd>
                                    </div>
                                    <div>
                                      <dt>Ação</dt>
                                      <dd>{v30CommercialClock.action}</dd>
                                    </div>
                                  </dl>
                                </section>

                                <section
                                  className="atlas-kanban-v30-conversation-continuity"
                                  data-response-state={v30Conversation.state}
                                  data-tone={v30Conversation.tone}
                                  data-channel-confirmed={
                                    v30Conversation.channelConfirmed
                                  }
                                  data-v3000-phase="45-conversation-continuity"
                                  aria-label={`Continuidade da conversa: ${v30Conversation.statusLabel}. ${v30Conversation.channelLabel}. Último contato: ${v30Conversation.lastContactLabel}. Próximo compromisso: ${v30Conversation.nextCommitmentLabel}.`}
                                >
                                  <header>
                                    <span>Continuidade</span>
                                    <strong>
                                      {v30Conversation.statusLabel}
                                    </strong>
                                  </header>
                                  <p>
                                    <b>{v30Conversation.channelLabel}</b>
                                    <span>
                                      {v30Conversation.lastContactLabel}
                                    </span>
                                  </p>
                                  <small>
                                    Próximo compromisso:{" "}
                                    {v30Conversation.nextCommitmentLabel}
                                  </small>
                                </section>

                                {projectCompatibility ? (
                                  <section
                                    className="atlas-kanban-project-compatibility"
                                    data-status={projectCompatibility.status}
                                    data-v3000-phase="46-project-compatibility"
                                  >
                                    <header>
                                      <span>Cliente × projeto</span>
                                      <strong>
                                        {projectCompatibility.evidence_count > 0
                                          ? `${projectCompatibility.evidence_count} ${
                                              projectCompatibility.evidence_count ===
                                              1
                                                ? "sinal"
                                                : "sinais"
                                            }`
                                          : "Qualificar"}
                                      </strong>
                                    </header>
                                    <div className="atlas-kanban-project-compatibility-body">
                                      <p>
                                        <span>Empreendimento considerado</span>
                                        <b>
                                          {projectCompatibility.project_name ||
                                            "Ainda não vinculado"}
                                        </b>
                                      </p>
                                      {projectCompatibility.signals.length >
                                      0 ? (
                                        <ul aria-label="Evidências de compatibilidade">
                                          {projectCompatibility.signals.map(
                                            (signal) => (
                                              <li
                                                key={signal.key}
                                                data-state={signal.state}
                                              >
                                                <span>{signal.label}</span>
                                                <small>{signal.evidence}</small>
                                              </li>
                                            ),
                                          )}
                                        </ul>
                                      ) : null}
                                      {projectCompatibility.missing ? (
                                        <aside className="atlas-kanban-project-compatibility-question">
                                          <span>Pergunta que destrava</span>
                                          <strong>
                                            {
                                              projectCompatibility.missing
                                                .question
                                            }
                                          </strong>
                                        </aside>
                                      ) : (
                                        <aside data-complete="true">
                                          <span>Leitura disponível</span>
                                          <strong>
                                            Sinais essenciais registrados para a
                                            próxima decisão.
                                          </strong>
                                        </aside>
                                      )}
                                    </div>
                                  </section>
                                ) : null}
                              </details>

                              <div
                                className="atlas-kanban-v30-card-command atlas-kanban-card-command"
                                data-tone={v30Card.tone}
                                data-card-command="135-kanban-v30-card-command"
                                data-v3000-phase="44-single-primary-action"
                                data-primary-action-count="1"
                                data-primary-action-kind={
                                  v30Card.primaryAction.kind
                                }
                              >
                                <div>
                                  <span>Próxima ação</span>
                                  <strong>{v30Card.headline}</strong>
                                  <small>{v30Card.subline}</small>
                                </div>
                                <div
                                  className="atlas-kanban-v30-card-command-actions"
                                  data-primary-command="phase-34"
                                  data-action-priority="primary"
                                >
                                  {v30Card.primaryAction.targetStage ? (
                                    <button
                                      type="button"
                                      disabled={savingId === lead.id}
                                      onClick={() =>
                                        void moveLead(
                                          lead.id,
                                          v30Card.primaryAction.targetStage!,
                                        )
                                      }
                                    >
                                      {savingId === lead.id
                                        ? "Movendo..."
                                        : v30Card.primaryAction.label}
                                    </button>
                                  ) : v30Card.primaryAction.external ? (
                                    <a
                                      href={v30Card.primaryAction.href}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {v30Card.primaryAction.label}
                                    </a>
                                  ) : (
                                    <Link href={v30Card.primaryAction.href}>
                                      {v30Card.primaryAction.label}
                                    </Link>
                                  )}
                                </div>
                              </div>

                              <details
                                className="atlas-kanban-recommendation-explanation"
                                data-evidence-level={
                                  v30Card.recommendationEvidence.evidenceLevel
                                }
                                data-v3000-phase="47-recommendation-confidence"
                              >
                                <summary>
                                  <span>Por que está na fila?</span>
                                  <strong>
                                    {
                                      v30Card.recommendationEvidence
                                        .operationalPriorityLabel
                                    }
                                  </strong>
                                </summary>
                                <div className="atlas-kanban-recommendation-explanation-body">
                                  <dl>
                                    <div>
                                      <dt>Score cadastrado</dt>
                                      <dd>
                                        {v30Card.recommendationEvidence.score
                                          .value ?? "Não informado"}
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Prioridade operacional</dt>
                                      <dd>
                                        {
                                          v30Card.recommendationEvidence
                                            .operationalPriorityLabel
                                        }
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Confiança da recomendação</dt>
                                      <dd>
                                        {
                                          v30Card.recommendationEvidence
                                            .evidenceLabel
                                        }
                                      </dd>
                                    </div>
                                    <div>
                                      <dt>Confiança IA</dt>
                                      <dd>
                                        {
                                          v30Card.recommendationEvidence
                                            .aiConfidence.label
                                        }
                                      </dd>
                                    </div>
                                  </dl>
                                  {v30Card.recommendationEvidence.reasons
                                    .length > 0 ? (
                                    <ul aria-label="Motivos da prioridade operacional">
                                      {v30Card.recommendationEvidence.reasons.map(
                                        (reason) => (
                                          <li key={`${lead.id}-${reason}`}>
                                            {reason}
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                  ) : null}
                                  <p className="atlas-kanban-recommendation-provenance">
                                    <span>
                                      <b>Método</b>{" "}
                                      {
                                        v30Card.recommendationEvidence
                                          .methodLabel
                                      }
                                    </span>
                                    <span>
                                      <b>Origem</b>{" "}
                                      {
                                        v30Card.recommendationEvidence
                                          .originLabel
                                      }
                                    </span>
                                    <span>
                                      <b>Base considerada até</b>{" "}
                                      {v30Card.recommendationEvidence
                                        .evaluatedAt
                                        ? dateLabel(
                                            v30Card.recommendationEvidence
                                              .evaluatedAt,
                                          )
                                        : "Sem atualização registrada"}
                                    </span>
                                    <span>
                                      <b>Peso do forecast</b>{" "}
                                      {stage.probability}% nesta etapa
                                    </span>
                                  </p>
                                  <em>
                                    {v30Card.recommendationEvidence.disclaimer}
                                  </em>
                                </div>
                              </details>

                              {v30Card.behavioralSignals.length > 0 ? (
                                <details
                                  className="atlas-kanban-behavioral-signals"
                                  data-v3000-phase="48-behavioral-signals"
                                >
                                  <summary>
                                    <span>Sinais que mudam a decisão</span>
                                    <strong>
                                      {v30Card.behavioralSignals.length}/3
                                    </strong>
                                  </summary>
                                  <div className="atlas-kanban-behavioral-signals-body">
                                    <ul aria-label="Sinais comportamentais registrados">
                                      {v30Card.behavioralSignals.map(
                                        (signal) => (
                                          <li
                                            key={`${lead.id}-${signal.kind}-${signal.occurredAt || "current"}`}
                                            data-tone={signal.tone}
                                          >
                                            <span aria-hidden="true" />
                                            <div>
                                              <b>{signal.label}</b>
                                              <p>{signal.detail}</p>
                                              <small>
                                                {signal.source} ·{" "}
                                                {signal.occurredAt
                                                  ? relativeTime(
                                                      signal.occurredAt,
                                                    )
                                                  : "Etapa atual"}
                                              </small>
                                            </div>
                                            <em>{signal.decisionImpact}</em>
                                          </li>
                                        ),
                                      )}
                                    </ul>
                                    <Link href={`/leads/${lead.id}`}>
                                      Ver histórico completo no Lead 360
                                    </Link>
                                  </div>
                                </details>
                              ) : null}

                              <section
                                aria-label={roleOrientedCard.eyebrow}
                                className="atlas-kanban-role-orientation"
                                data-mode={roleOrientedCard.mode}
                                data-role={roleOrientedCard.role}
                                data-role-visibility="authenticated-api-and-rls"
                                data-tone={roleOrientedCard.tone}
                                data-v3000-phase="51-role-oriented-card"
                              >
                                <header>
                                  <small>{roleOrientedCard.eyebrow}</small>
                                  <span>{roleOrientedCard.scopeLabel}</span>
                                </header>
                                <strong>{roleOrientedCard.headline}</strong>
                                <p>{roleOrientedCard.detail}</p>
                                <footer>
                                  <span>
                                    <small>
                                      {roleOrientedCard.metricLabel}
                                    </small>
                                    <b>{roleOrientedCard.metricValue}</b>
                                  </span>
                                  {roleOrientedCard.ownerLabel ? (
                                    <span>
                                      <small>Responsável</small>
                                      <b>{roleOrientedCard.ownerLabel}</b>
                                    </span>
                                  ) : null}
                                  <em>{roleOrientedCard.evidenceLabel}</em>
                                </footer>
                              </section>

                              {v30Card.decisiveObjection.status !== "clear" ? (
                                <section
                                  aria-label="Objeção ou lacuna decisiva"
                                  className="atlas-kanban-decisive-objection"
                                  data-status={v30Card.decisiveObjection.status}
                                  data-tone={v30Card.decisiveObjection.tone}
                                  data-v3000-phase="50-decisive-objection"
                                >
                                  <header>
                                    <small>
                                      {v30Card.decisiveObjection.eyebrow}
                                    </small>
                                    <strong>
                                      {v30Card.decisiveObjection.headline}
                                    </strong>
                                  </header>
                                  <p>{v30Card.decisiveObjection.detail}</p>
                                  {v30Card.decisiveObjection.question ? (
                                    <div className="atlas-kanban-decisive-objection-question">
                                      <span>Pergunta objetiva</span>
                                      <b>
                                        {v30Card.decisiveObjection.question}
                                      </b>
                                    </div>
                                  ) : null}
                                  <footer>
                                    <small>
                                      {v30Card.decisiveObjection.source}
                                    </small>
                                    <Link href={`/leads/${lead.id}`}>
                                      {v30Card.decisiveObjection.actionLabel}
                                    </Link>
                                  </footer>
                                </section>
                              ) : null}

                              <details
                                className="atlas-kanban-opportunity-attribution"
                                data-v3000-phase="49-opportunity-attribution"
                              >
                                <summary>
                                  <span>Rastro da oportunidade</span>
                                  <strong
                                    data-status={
                                      v30Card.opportunityAttribution.status
                                    }
                                  >
                                    {v30Card.opportunityAttribution.statusLabel}
                                  </strong>
                                </summary>
                                <div className="atlas-kanban-opportunity-attribution-body">
                                  <ol aria-label="Campanha até etapa comercial">
                                    {v30Card.opportunityAttribution.steps.map(
                                      (step) => (
                                        <li
                                          key={`${lead.id}-${step.key}`}
                                          data-state={step.state}
                                        >
                                          <small>{step.label}</small>
                                          <b>{step.value}</b>
                                        </li>
                                      ),
                                    )}
                                  </ol>
                                  <dl>
                                    {v30Card.opportunityAttribution.contexts.map(
                                      (context) => (
                                        <div
                                          key={`${lead.id}-${context.key}`}
                                          data-state={context.state}
                                        >
                                          <dt>{context.label}</dt>
                                          <dd>{context.value}</dd>
                                        </div>
                                      ),
                                    )}
                                  </dl>
                                  {v30Card.opportunityAttribution.status ===
                                  "conflict" ? (
                                    <p
                                      className="atlas-kanban-opportunity-attribution-warning"
                                      role="status"
                                    >
                                      A incorporadora da campanha diverge do
                                      projeto. Revise o vínculo antes de
                                      atribuir resultado.
                                    </p>
                                  ) : v30Card.opportunityAttribution.missing
                                      .length > 0 ? (
                                    <p className="atlas-kanban-opportunity-attribution-missing">
                                      Falta vincular:{" "}
                                      {v30Card.opportunityAttribution.missing.join(
                                        ", ",
                                      )}
                                      .
                                    </p>
                                  ) : null}
                                  {v30Card.opportunityAttribution.financials ? (
                                    <p className="atlas-kanban-opportunity-attribution-financials">
                                      <span>
                                        Custo atribuído{" "}
                                        {brl.format(
                                          v30Card.opportunityAttribution
                                            .financials.attributedCost,
                                        )}
                                      </span>
                                      <span>
                                        Receita atribuída{" "}
                                        {brl.format(
                                          v30Card.opportunityAttribution
                                            .financials.attributedRevenue,
                                        )}
                                      </span>
                                      <small>
                                        {dateLabel(
                                          v30Card.opportunityAttribution
                                            .financials.periodStart,
                                        )}{" "}
                                        a{" "}
                                        {dateLabel(
                                          v30Card.opportunityAttribution
                                            .financials.periodEnd,
                                        )}
                                      </small>
                                    </p>
                                  ) : (
                                    <small className="atlas-kanban-opportunity-attribution-guard">
                                      Custos e receita permanecem ocultos sem
                                      período e atribuição válidos.
                                    </small>
                                  )}
                                </div>
                              </details>

                              <details
                                className="atlas-kanban-v30-card-context"
                                data-v30-phase="144-kanban-v30-accessible-motion"
                              >
                                <summary>Outras ações e dados</summary>
                                <div
                                  className="atlas-kanban-v30-card-quickstrip"
                                  data-v30-phase="142-kanban-v30-clean-card-reading"
                                  aria-label={`Leitura rápida de ${lead.name || "lead"}`}
                                >
                                  {v30Card.quickSignals.map((signal) => (
                                    <span
                                      key={`${lead.id}-${signal.label}`}
                                      data-tone={signal.tone}
                                    >
                                      <small>{signal.label}</small>
                                      <b>{signal.value}</b>
                                    </span>
                                  ))}
                                </div>
                                <div className="atlas-kanban-v30-card-facts">
                                  {v30Card.facts.map((fact) => (
                                    <span key={`${lead.id}-${fact.label}`}>
                                      <small>{fact.label}</small>
                                      <strong>{fact.value}</strong>
                                    </span>
                                  ))}
                                </div>
                                <div
                                  className="atlas-kanban-v30-card-actions"
                                  data-v30-phase="144-kanban-v30-accessible-motion"
                                  data-action-priority="secondary"
                                  data-secondary-actions="context-only"
                                >
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openLeadPreview(lead.id, "preview")
                                    }
                                  >
                                    <strong>Preview</strong>
                                    <small>Ver sem sair do quadro.</small>
                                  </button>
                                  <Link
                                    href={copilotIntentUrl(lead, "summary")}
                                  >
                                    <strong>IA resumir</strong>
                                    <small>
                                      Preparar contexto do atendimento.
                                    </small>
                                  </Link>
                                  <Link href={v30Card.secondaryAction.href}>
                                    <strong>
                                      {v30Card.secondaryAction.label}
                                    </strong>
                                    <small>
                                      {v30Card.secondaryAction.detail}
                                    </small>
                                  </Link>
                                  {v30NextStage &&
                                  v30Card.primaryAction.kind !== "advance" ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void moveLead(lead.id, v30NextStage.key)
                                      }
                                      disabled={savingId === lead.id}
                                    >
                                      <strong>{`Avançar: ${v30NextStage.label}`}</strong>
                                      <small>
                                        Move com histórico e desfazer.
                                      </small>
                                    </button>
                                  ) : null}
                                </div>
                                <div className="atlas-kanban-card-essentials">
                                  <span>
                                    <small>Projeto</small>
                                    <strong>{essentials.secondaryMeta}</strong>
                                  </span>
                                  <span>
                                    <small>Potencial</small>
                                    <strong>{essentials.primaryMeta}</strong>
                                  </span>
                                </div>
                                <div className="atlas-kanban-signal-row">
                                  <span
                                    className={`atlas-temperature is-${String(lead.temperature || "frio").toLowerCase()}`}
                                  >
                                    {lead.temperature || "frio"}
                                  </span>
                                  <span>
                                    Risco <strong>{risk}</strong>
                                  </span>
                                  {metaCampaign(lead) ? (
                                    <span>{metaCampaign(lead)}</span>
                                  ) : null}
                                </div>
                                <div className="atlas-kanban-action-chips">
                                  {signals.map((signal) => (
                                    <span
                                      key={signal.label}
                                      className={`is-${signal.tone}`}
                                    >
                                      {signal.label}
                                    </span>
                                  ))}
                                </div>
                                <div className="atlas-kanban-micro-facts">
                                  <span>
                                    <small>Último contato</small>
                                    <strong>
                                      {relativeTime(lead.last_interaction_at)}
                                    </strong>
                                  </span>
                                  <span>
                                    <small>Próxima ação</small>
                                    <strong>
                                      {dateLabel(lead.next_action_at)}
                                    </strong>
                                  </span>
                                </div>
                                {contactSla ? (
                                  <div className="mt-3">
                                    <AtlasBadge tone={contactSla.tone}>
                                      {contactSla.label}
                                    </AtlasBadge>
                                  </div>
                                ) : null}
                                <div
                                  className="atlas-kanban-playbook"
                                  data-playbook="phase-112"
                                >
                                  <div className="atlas-kanban-playbook-head">
                                    <span>Próximos 3 passos</span>
                                    <strong>
                                      {playbook[0]?.label ||
                                        "Registrar próxima ação"}
                                    </strong>
                                  </div>
                                  <ol>
                                    {playbook.map((step, stepIndex) => (
                                      <li
                                        key={`${lead.id}-${step.label}`}
                                        data-tone={step.tone}
                                      >
                                        <span>{stepIndex + 1}</span>
                                        <div>
                                          <strong>{step.label}</strong>
                                          <small>{step.detail}</small>
                                        </div>
                                        <Link href={step.href}>{step.cta}</Link>
                                      </li>
                                    ))}
                                  </ol>
                                </div>
                                <details
                                  className="atlas-kanban-v30-card-utilities"
                                  data-action-priority="tertiary"
                                  data-ux-phase="45-progressive-card-utilities"
                                >
                                  <summary>Mais utilidades</summary>
                                  <div
                                    className="atlas-kanban-execution-rail"
                                    data-execution-rail="phase-110"
                                  >
                                    <span>Executar</span>
                                    <Link
                                      href={executionIntentUrl(lead, "task")}
                                    >
                                      Tarefa
                                    </Link>
                                    <Link
                                      href={executionIntentUrl(
                                        lead,
                                        "calendar",
                                      )}
                                    >
                                      Agenda
                                    </Link>
                                    <Link
                                      href={executionIntentUrl(
                                        lead,
                                        "proposal",
                                      )}
                                    >
                                      Proposta
                                    </Link>
                                    <Link
                                      href={copilotIntentUrl(lead, "follow_up")}
                                    >
                                      IA
                                    </Link>
                                  </div>
                                  <div
                                    className="atlas-kanban-copilot-bridge"
                                    data-copilot-bridge="pipeline-card"
                                  >
                                    <span>Copilot pronto</span>
                                    <Link
                                      href={copilotIntentUrl(lead, "follow_up")}
                                    >
                                      Mensagem IA
                                    </Link>
                                    <Link
                                      href={copilotIntentUrl(lead, "summary")}
                                    >
                                      Resumo IA
                                    </Link>
                                    <Link
                                      href={copilotIntentUrl(
                                        lead,
                                        "objections",
                                      )}
                                    >
                                      Objeções
                                    </Link>
                                  </div>
                                  <div className="atlas-card-shortcuts">
                                    <Link
                                      href={copilotIntentUrl(lead, "follow_up")}
                                      title="Criar abordagem com IA"
                                    >
                                      ✦ Mensagem
                                    </Link>
                                    <Link
                                      href={copilotIntentUrl(lead, "summary")}
                                      title="Preparar resumo executivo"
                                    >
                                      Resumo
                                    </Link>
                                    {contact ? (
                                      <>
                                        <a
                                          href={contact.call}
                                          title="Ligar para a lead"
                                        >
                                          Ligar
                                        </a>
                                        <a
                                          href={contact.whatsapp}
                                          target="_blank"
                                          rel="noreferrer"
                                          title="Abrir WhatsApp"
                                        >
                                          WhatsApp
                                        </a>
                                      </>
                                    ) : null}
                                  </div>
                                </details>
                                <div className="atlas-lead-details">
                                  <p>
                                    <span>Origem</span>
                                    <strong>
                                      {lead.source || "Não informada"}
                                    </strong>
                                  </p>
                                  <p>
                                    <span>Interesse</span>
                                    <strong>
                                      {lead.purpose || "A definir"}
                                      {lead.bedrooms
                                        ? ` · ${lead.bedrooms} dorm.`
                                        : ""}
                                    </strong>
                                  </p>
                                  <p>
                                    <span>Região</span>
                                    <strong>
                                      {lead.preferred_regions?.join(", ") ||
                                        "Não informada"}
                                    </strong>
                                  </p>
                                  <p>
                                    <span>Último contato</span>
                                    <strong>
                                      {relativeTime(lead.last_interaction_at)}
                                    </strong>
                                  </p>
                                  <p>
                                    <span>Próxima ação</span>
                                    <strong>
                                      {dateLabel(lead.next_action_at)}
                                    </strong>
                                  </p>
                                </div>
                                <p className="atlas-kanban-guidance-reason">
                                  {guidance.reason}
                                </p>
                                <div className="atlas-kanban-move-row">
                                  <button
                                    type="button"
                                    onClick={() => moveByKeyboard(lead, -1)}
                                    disabled={
                                      savingId === lead.id ||
                                      (stageIndexByKey.get(
                                        (lead.status || "novo") as StageKey,
                                      ) ?? -1) <= 0
                                    }
                                    aria-label="Mover para a etapa anterior"
                                  >
                                    ←
                                  </button>
                                  <select
                                    aria-label={`Mover ${lead.name || "lead"} para outra etapa`}
                                    value={lead.status ?? "novo"}
                                    disabled={savingId === lead.id}
                                    onChange={(event) =>
                                      void moveLead(
                                        lead.id,
                                        event.target.value as StageKey,
                                        undefined,
                                        undefined,
                                        "selector",
                                      )
                                    }
                                  >
                                    {destinationOptions.map((option) => (
                                      <option
                                        key={option.key}
                                        value={option.key}
                                      >
                                        {option.label}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    type="button"
                                    onClick={() => moveByKeyboard(lead, 1)}
                                    disabled={
                                      savingId === lead.id ||
                                      (stageIndexByKey.get(
                                        (lead.status || "novo") as StageKey,
                                      ) ?? -1) >=
                                        stages.length - 1
                                    }
                                    aria-label="Mover para a próxima etapa"
                                  >
                                    →
                                  </button>
                                </div>
                              </details>
                            </article>
                          );
                        })}
                        {hiddenStageItems > 0 ? (
                          <button
                            type="button"
                            className="atlas-kanban-v30-progressive-more"
                            data-v30-phase="139-kanban-v30-progressive-rendering"
                            onClick={() =>
                              setExpandedStages((current) => ({
                                ...current,
                                [stage.key]: true,
                              }))
                            }
                          >
                            <span>Mais oportunidades na etapa</span>
                            <strong>{`Mostrar ${hiddenStageItems} restantes`}</strong>
                            <small>
                              Primeiro ficam visíveis os cards com maior
                              prioridade comercial.
                            </small>
                          </button>
                        ) : isStageExpanded &&
                          stage.items.length > stageVisibleLimit ? (
                          <button
                            type="button"
                            className="atlas-kanban-v30-progressive-more is-collapse"
                            data-v30-phase="139-kanban-v30-progressive-rendering"
                            onClick={() =>
                              setExpandedStages((current) => ({
                                ...current,
                                [stage.key]: false,
                              }))
                            }
                          >
                            <span>Visão enxuta</span>
                            <strong>Compactar etapa</strong>
                            <small>
                              Voltar a mostrar apenas as prioridades para
                              decisão rápida.
                            </small>
                          </button>
                        ) : null}
                      </div>
                    )}
                  </section>
                );
              })
            )}
          </div>
        </div>
        {kanbanV30DetailPreview ? (
          <aside
            className="atlas-kanban-v30-inline-preview"
            data-v30-phase="146-kanban-v30-inline-preview"
            data-tone={kanbanV30DetailPreview.tone}
            role="complementary"
            aria-label={`Preview rápido de ${kanbanV30DetailPreview.lead.name || "lead"}`}
          >
            <div className="atlas-kanban-v30-inline-preview-head">
              <div>
                <span>
                  Preview de decisão · {kanbanV30DetailPreview.stage.label}
                </span>
                <strong>
                  {kanbanV30DetailPreview.lead.name || "Lead sem nome"}
                </strong>
                <small>{kanbanV30DetailPreview.title}</small>
              </div>
              <button
                type="button"
                onClick={() => setPreviewLeadId(null)}
                aria-label="Fechar preview rápido"
              >
                Fechar
              </button>
            </div>

            <div className="atlas-kanban-v30-inline-preview-grid">
              <div className="atlas-kanban-v30-inline-preview-summary">
                <span>Leitura Atlas</span>
                <strong>{kanbanV30DetailPreview.guidanceReason}</strong>
                <small>
                  Risco {kanbanV30DetailPreview.risk} · temperatura{" "}
                  {kanbanV30DetailPreview.lead.temperature || "frio"} · score{" "}
                  {kanbanV30DetailPreview.lead.score ?? 0}
                </small>
              </div>
              <div className="atlas-kanban-v30-inline-preview-facts">
                {kanbanV30DetailPreview.facts.map((fact) => (
                  <span
                    key={`${kanbanV30DetailPreview.lead.id}-preview-${fact.label}`}
                  >
                    <small>{fact.label}</small>
                    <strong>{fact.value}</strong>
                  </span>
                ))}
              </div>
              <ol className="atlas-kanban-v30-inline-preview-playbook">
                {kanbanV30DetailPreview.playbook.map((step, index) => (
                  <li
                    key={`${kanbanV30DetailPreview.lead.id}-preview-step-${step.label}`}
                    data-tone={step.tone}
                  >
                    <span>{index + 1}</span>
                    <div>
                      <strong>{step.label}</strong>
                      <small>{step.detail}</small>
                    </div>
                    <Link href={step.href}>{step.cta}</Link>
                  </li>
                ))}
              </ol>
            </div>

            <div
              className="atlas-kanban-v30-inline-preview-actions"
              data-v3000-phase="44-single-primary-action"
              data-primary-action-count="1"
              data-primary-action-kind={
                kanbanV30DetailPreview.primaryAction.kind
              }
              data-secondary-actions="context-only"
            >
              {kanbanV30DetailPreview.primaryAction.targetStage ? (
                <button
                  type="button"
                  disabled={savingId === kanbanV30DetailPreview.lead.id}
                  onClick={() =>
                    void moveLead(
                      kanbanV30DetailPreview.lead.id,
                      kanbanV30DetailPreview.primaryAction.targetStage!,
                    )
                  }
                >
                  {savingId === kanbanV30DetailPreview.lead.id
                    ? "Movendo..."
                    : kanbanV30DetailPreview.primaryAction.label}
                </button>
              ) : kanbanV30DetailPreview.primaryAction.external ? (
                <a
                  href={kanbanV30DetailPreview.primaryAction.href}
                  target="_blank"
                  rel="noreferrer"
                >
                  {kanbanV30DetailPreview.primaryAction.label}
                </a>
              ) : (
                <Link href={kanbanV30DetailPreview.primaryAction.href}>
                  {kanbanV30DetailPreview.primaryAction.label}
                </Link>
              )}
              <Link href={`/leads/${kanbanV30DetailPreview.lead.id}`}>
                Abrir Lead 360
              </Link>
              <Link
                href={copilotIntentUrl(
                  kanbanV30DetailPreview.lead,
                  "follow_up",
                )}
              >
                Copilot
              </Link>
              {kanbanV30DetailPreview.contactCall ? (
                <a href={kanbanV30DetailPreview.contactCall}>Ligar</a>
              ) : null}
              {kanbanV30DetailPreview.contactWhatsApp ? (
                <a
                  href={kanbanV30DetailPreview.contactWhatsApp}
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp
                </a>
              ) : null}
              {(() => {
                const nextStage = kanbanV30DetailPreview.nextStage;
                if (
                  !nextStage ||
                  kanbanV30DetailPreview.primaryAction.kind === "advance"
                ) {
                  return null;
                }

                return (
                  <button
                    type="button"
                    onClick={() =>
                      void moveLead(
                        kanbanV30DetailPreview.lead.id,
                        nextStage.key,
                      )
                    }
                    disabled={savingId === kanbanV30DetailPreview.lead.id}
                  >
                    Avançar para {nextStage.label}
                  </button>
                );
              })()}
            </div>
          </aside>
        ) : null}
      </AtlasCard>
      {!focusMode ? (
        <AtlasCard purpose="analysis" emphasis="quiet">
          <AtlasCardHeader
            eyebrow="Inteligência de compradores"
            title="Compraram em outro lugar"
            description="Base separada do funil ativo: compradores reais que ajudam a entender público, produto, preço e concorrência sem contar como venda da empresa."
          />
          <div className="grid gap-3 p-4 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
            {leads.filter((lead) => lead.status === "comprou_outro").length ? (
              leads
                .filter((lead) => lead.status === "comprou_outro")
                .map((lead) => (
                  <article
                    key={lead.id}
                    className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[.035] p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <Link
                          href={`/leads/${lead.id}`}
                          className="font-semibold text-white hover:text-emerald-300"
                        >
                          {lead.name || "Cliente comprador"}
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">
                          {lead.phone || lead.email || "Contato protegido"}
                        </p>
                      </div>
                      <AtlasBadge tone="success">COMPRADOR</AtlasBadge>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-400">
                      Perfil preservado para inteligência comercial e futuras
                      estratégias de público.
                    </p>
                    <select
                      value={lead.status ?? "comprou_outro"}
                      disabled={savingId === lead.id}
                      onChange={(event) =>
                        void moveLead(
                          lead.id,
                          event.target.value as StageKey,
                          undefined,
                          undefined,
                          "selector",
                        )
                      }
                      className="mt-4 w-full rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 text-xs text-slate-300"
                    >
                      {destinationOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </article>
                ))
            ) : (
              <div className="sm:col-span-2 xl:col-span-3">
                <AtlasEmpty
                  reason="no-activity"
                  eyebrow="Aprendizado comprador"
                  title="Nenhum perfil comprador separado"
                  description="Ao registrar uma compra em outro lugar, o cliente aparecerá aqui com seu aprendizado preservado."
                  action={
                    <Link
                      href="/external-sales"
                      className="atlas-button-secondary"
                    >
                      Registrar compra externa
                    </Link>
                  }
                />
              </div>
            )}
          </div>
        </AtlasCard>
      ) : null}
      {pendingMove ? (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-[#020712]/80 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setPendingMove(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="pipeline-move-title"
            className="w-full max-w-xl rounded-[28px] border border-white/10 bg-[#0b1220] p-6 shadow-2xl shadow-black/50"
          >
            <AtlasBadge
              tone={
                pendingMove.to === "ganho"
                  ? "success"
                  : pendingMove.to === "perdido"
                    ? "danger"
                    : "warning"
              }
            >
              DECISÃO COMERCIAL
            </AtlasBadge>
            <h2
              id="pipeline-move-title"
              className="mt-4 text-2xl font-semibold text-white"
            >
              {pendingMove.to === "ganho"
                ? "Confirmar venda ganha"
                : pendingMove.to === "perdido"
                  ? "Confirmar oportunidade perdida"
                  : "Registrar compra em outro lugar"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              <strong className="text-slate-200">{pendingMove.leadName}</strong>
              {" · "}
              {pipelineStageLabel(pendingMove.from, stages)}
              {" → "}
              {pipelineStageLabel(pendingMove.to, stages)}.
              {pendingMove.to === "ganho"
                ? " Esta decisão atualiza VGV, relatórios e o fluxo de comissão."
                : pendingMove.to === "perdido"
                  ? " O histórico será preservado para aprendizado e reativação."
                  : " O perfil comprador ficará separado do funil ativo e alimentará a inteligência comercial."}
            </p>
            {pendingMove.to === "comprou_outro" ? (
              <label className="mt-5 block text-xs font-semibold uppercase tracking-[.12em] text-slate-400">
                O que pesou na compra
                <textarea
                  autoFocus
                  value={pendingMove.notes}
                  onChange={(event) =>
                    setPendingMove((current) =>
                      current
                        ? { ...current, notes: event.target.value }
                        : current,
                    )
                  }
                  placeholder="Projeto, região, preço, prazo, financiamento ou experiência de atendimento."
                  rows={4}
                  className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-black/20 p-4 text-sm font-normal normal-case tracking-normal text-white outline-none transition focus:border-sky-400/40"
                />
                <span className="mt-2 block font-normal normal-case tracking-normal text-slate-500">
                  Mínimo de 10 caracteres. A informação fica protegida no CRM.
                </span>
              </label>
            ) : null}
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="atlas-button-secondary"
                onClick={() => setPendingMove(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="atlas-button-primary"
                disabled={
                  pendingMove.to === "comprou_outro" &&
                  pendingMove.notes.trim().length < 10
                }
                onClick={() => {
                  const decision = pendingMove;
                  setPendingMove(null);
                  void moveLead(
                    decision.leadId,
                    decision.to,
                    undefined,
                    {
                      notes: decision.notes,
                    },
                    "decision",
                  );
                }}
              >
                Confirmar decisão
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
