"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  CSSProperties,
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { matchLeadToProperty } from "@/lib/atlas/matching";
import { supabase } from "@/lib/supabase";
import type { AtlasLead, AtlasProperty } from "@/types/atlas";
import {
  AtlasEmpty,
  AtlasProgress,
  AtlasSkeleton,
} from "@/components/ui/AtlasUI";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { LeadOperationalBar } from "@/components/crm/lead-operational-bar";
import {
  LeadContextCorrection,
  type LeadContextProjectOption,
} from "@/components/crm/lead-context-correction";
import { CommercialContextTimelineEntry } from "@/components/crm/commercial-context-timeline-entry";
import { CopilotContextAction } from "@/components/atlas/copilot-context-action";
import { parseCommercialContextCorrectionTimeline } from "@/lib/atlas/commercial-context-timeline";

type LeadRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  development_id: string | null;
  status: string | null;
  temperature: string | null;
  score: number | null;
  budget_min: number | null;
  budget_max: number | null;
  preferred_regions: string[] | null;
  bedrooms: number | null;
  purpose: string | null;
  notes: string | null;
  created_at: string | null;
  next_action_at?: string | null;
  metadata: {
    meta?: {
      campaignId?: string;
      adsetId?: string;
      adId?: string;
      formId?: string;
      sourceName?: string;
      dataSharingConsent?: boolean;
    };
  } | null;
};
type ActivityRow = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  authorName?: string;
  metadata?: ({
    propertyId?: string;
    signal?: "interested" | "rejected";
  } & Record<string, unknown>) | null;
  occurred_at: string;
};
type PropertyRow = {
  id: string;
  title: string | null;
  price: number | null;
  city: string | null;
  state: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking_spaces: number | null;
  area: number | null;
  status: string | null;
};
type OpportunityRow = {
  id: string;
  stage: string;
  value: number | null;
  probability: number;
  expected_close_at: string | null;
  property_id: string | null;
  created_at: string;
};
type ExperienceRow = {
  id: string;
  severity: string;
  confidence: number;
  evidence: string;
  recommendation: string;
  suggested_reply: string | null;
  status: string;
  created_at: string;
};
// Fase 100 · Sinais de atenção proativos — etapa parada, follow-up vencido,
// lead quente sem contato recente ou objeção sem resposta.
// Ver lib/atlas/attention-signals.ts.
type AttentionSignalRow = {
  kind: "stale_stage" | "follow_up_overdue" | "high_score_no_contact" | "objection_open";
  severity: "critical" | "warning" | "info";
  reason: string;
  detail: string;
  since: string | null;
  metric: number;
};
type ProposalRow = {
  id: string;
  status:
    | "draft"
    | "proposal_review"
    | "approved"
    | "rejected"
    | "sent"
    | "accepted"
    | "declined"
    | "expired";
  property_price: number;
  valid_until: string;
  review_requested_at: string | null;
  approved_at: string | null;
  sent_at: string | null;
  responded_at: string | null;
  expired_at: string | null;
  preparation_minutes: number | null;
  review_minutes: number | null;
  response_minutes: number | null;
  response_note: string | null;
  rule_snapshot: {
    propertyTitle?: string;
    ruleName?: string;
    version?: number;
  };
};

type GapQuestion = {
  key: string;
  label: string;
  question: string;
  why: string;
  priority: "critical" | "high" | "medium";
  action: "qualify" | "focus" | "navigate";
  target: string;
  options?: Array<{ value: string; label: string }>;
};
type DataQuality = {
  completeness: number;
  completedFields: number;
  totalFields: number;
  missing: Array<{ key: string; label: string }>;
  inconsistencies: string[];
  status: "review" | "complete" | "enrich";
  recommendation: string;
  nextQuestion: GapQuestion | null;
  questions: GapQuestion[];
  calculation: string;
};
type UnifiedProfile = {
  conversations: Array<{
    id: string;
    status: string;
    channel: string;
    last_message_at: string | null;
    unread_count: number;
  }>;
  tasks: Array<{
    id: string;
    status: string;
    due_at: string | null;
    priority: string | null;
  }>;
  campaignEvents: Array<{
    id: string;
    event_type: string;
    occurred_at: string;
  }>;
  sources: string[];
};
type ContactBriefing = {
  unreadMessages: number;
  openTasks: number;
  activeOpportunities: number;
  lastInteractionAt: string | null;
  context: string;
  actions: string[];
  generatedBy: string;
  requiresApproval: boolean;
};
type RelationshipContext = {
  owner: {
    id: string;
    full_name: string | null;
    commercial_role: string | null;
    role: string;
  } | null;
  development: {
    id: string;
    name: string;
    developer_name: string | null;
    status: string | null;
    city: string | null;
  } | null;
  campaign: {
    id: string;
    name: string;
    channel: string | null;
    status: string | null;
  } | null;
  communications: {
    conversations: number;
    messages: number;
    inbound: number;
    outbound: number;
    unread: number;
    channels: string[];
    lastMessageAt: string | null;
  };
  origin: {
    source: string;
    createdAt: string | null;
    campaignEvents: number;
    historicalMemories: number;
  };
};
type AssignmentReservation = {
  id: string;
  broker_id: string;
  status: "pending" | "accepted" | "expired" | "released" | "superseded";
  reserved_at: string;
  expires_at: string;
  accepted_at: string | null;
  released_at: string | null;
  release_reason: string | null;
};
type Payload = {
  lead: LeadRow;
  activities: ActivityRow[];
  properties: PropertyRow[];
  opportunities: OpportunityRow[];
  experienceSignals: ExperienceRow[];
  attentionSignals: AttentionSignalRow[];
  proposals: ProposalRow[];
  dataQuality: DataQuality;
  unifiedProfile: UnifiedProfile;
  contactBriefing: ContactBriefing;
  relationshipContext: RelationshipContext;
  assignmentReservation: AssignmentReservation | null;
  projectOptions: LeadContextProjectOption[];
};
type Qualification = {
  score: number;
  temperature: "frio" | "morno" | "quente";
  confidence: number;
  dimensions: Array<{
    key: string;
    label: string;
    score: number;
    maximum: number;
    reasons: string[];
  }>;
  strengths: string[];
  missingData: string[];
  risks: string[];
  nextBestAction: string;
  recommendedQuestions: Array<{
    key: string;
    question: string;
    why: string;
    options?: Array<{ value: string; label: string }>;
  }>;
  recalculatedAt: string;
  progress: { answered: number; total: number; percent: number };
  scoreChange: { previous: number; current: number; delta: number };
};

/* CC-6: campos com hairline neutra, foco no acento único e tinta oficial.
   Os placeholders são contrato: actOnGap e as perguntas de qualificação fazem
   querySelector por eles — não renomear. */
const inputClass =
  "w-full rounded-xl border border-[rgba(148,163,184,0.16)] bg-[rgba(15,24,48,0.55)] px-4 py-3 text-sm text-[#e8eef8] outline-none transition placeholder:text-[#6b7890] focus:border-[color:var(--atlas-accent)] focus:bg-[rgba(75,141,248,0.05)]";
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--atlas-accent)]";
const chipButtonClass = `cc6-chip cursor-pointer transition-colors hover:border-[color:var(--atlas-accent)] hover:text-[#e8eef8] disabled:cursor-default disabled:opacity-50 ${focusRing}`;
const summaryClass = `flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 rounded-xl p-4 [&::-webkit-details-marker]:hidden ${focusRing}`;
const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function temperatureTone(
  value?: string | null,
): "neutral" | "success" | "warning" | "danger" | "info" | "violet" {
  if (value === "quente") return "danger";
  if (value === "morno") return "warning";
  if (value === "frio") return "info";
  return "neutral";
}

// Sinais determinísticos do strip: só aritmética sobre timestamps já carregados.
function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / 86_400_000));
}

const attentionSeverityRank: Record<AttentionSignalRow["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};
const attentionChipClass: Record<AttentionSignalRow["severity"], string> = {
  critical: "cc6-crit border-[rgba(251,113,133,0.35)]",
  warning: "cc6-warn border-[rgba(245,181,68,0.35)]",
  info: "",
};

export default function LeadDetailPage() {
  const { id: leadId } = useParams<{ id: string }>();
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [experienceSignals, setExperienceSignals] = useState<ExperienceRow[]>(
    [],
  );
  const [attentionSignals, setAttentionSignals] = useState<
    AttentionSignalRow[]
  >([]);
  const [proposals, setProposals] = useState<ProposalRow[]>([]);
  const [dataQuality, setDataQuality] = useState<DataQuality | null>(null);
  const [unifiedProfile, setUnifiedProfile] = useState<UnifiedProfile | null>(
    null,
  );
  const [contactBriefing, setContactBriefing] =
    useState<ContactBriefing | null>(null);
  const [relationshipContext, setRelationshipContext] =
    useState<RelationshipContext | null>(null);
  const [assignmentReservation, setAssignmentReservation] =
    useState<AssignmentReservation | null>(null);
  const [projectOptions, setProjectOptions] = useState<LeadContextProjectOption[]>([]);
  const [contextSaving, setContextSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activityTitle, setActivityTitle] = useState("");
  const [activityDescription, setActivityDescription] = useState("");
  const [activityType, setActivityType] = useState("note");
  const [qualification, setQualification] = useState<Qualification | null>(
    null,
  );
  const [qualifying, setQualifying] = useState(false);
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [copiedContact, setCopiedContact] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<{
    id: string;
    property_price: number;
    down_payment: number | null;
    financed_balance: number | null;
    installment_amount: number | null;
    installments_count: number | null;
    valid_until: string;
    rule_snapshot: {
      ruleName: string;
      version: number;
      paymentFlow: string;
      developerName: string;
      calculation: string;
      disclaimer: string;
      balloonPaymentNotes?: string | null;
      financingNotes?: string | null;
      ruleValidity: { from: string | null; until: string | null };
    };
  } | null>(null);

  async function api(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Entre novamente.");
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init?.headers || {}),
      },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Falha na operação.");
    return body;
  }

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const data = (await api(`/api/v1/leads/${leadId}`)) as Payload;
      setLead(data.lead);
      setActivities(data.activities);
      setProperties(data.properties);
      setOpportunities(data.opportunities);
      setExperienceSignals(data.experienceSignals ?? []);
      setAttentionSignals(data.attentionSignals ?? []);
      setProposals(data.proposals ?? []);
      setDataQuality(data.dataQuality);
      setUnifiedProfile(data.unifiedProfile);
      setContactBriefing(data.contactBriefing);
      setRelationshipContext(data.relationshipContext);
      setAssignmentReservation(data.assignmentReservation);
      setProjectOptions(data.projectOptions ?? []);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao carregar o lead.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [leadId]);

  const feedbackByProperty = useMemo(() => {
    const feedback = new Map<string, "interested" | "rejected">();
    for (const activity of activities) {
      const propertyId = activity.metadata?.propertyId;
      const signal = activity.metadata?.signal;
      if (
        activity.type === "property_feedback" &&
        propertyId &&
        signal &&
        !feedback.has(propertyId)
      )
        feedback.set(propertyId, signal);
    }
    return feedback;
  }, [activities]);

  const matches = useMemo(() => {
    if (!lead) return [];
    const atlasLead: Partial<AtlasLead> = {
      id: lead.id,
      budgetMax: lead.budget_max,
      bedrooms: lead.bedrooms,
      preferredRegions: lead.preferred_regions ?? [],
    };
    return properties
      .map((property) => {
        const atlasProperty: AtlasProperty = {
          id: property.id,
          title: property.title,
          price: property.price,
          city: property.city,
          state: property.state,
          bedrooms: property.bedrooms,
          bathrooms: property.bathrooms,
          parkingSpaces: property.parking_spaces,
          area: property.area,
          status: property.status,
        };
        return {
          property,
          match: matchLeadToProperty(
            atlasLead,
            atlasProperty,
            feedbackByProperty.get(property.id),
          ),
        };
      })
      .filter((item) => item.match.score > 0)
      .sort((a, b) => b.match.score - a.match.score)
      .slice(0, 6);
  }, [feedbackByProperty, lead, properties]);

  const intelligence = useMemo(() => {
    if (!lead)
      return {
        readiness: 0,
        nextAction: "Carregando contexto...",
        risk: "unknown",
      };
    let readiness = 20;
    if (lead.phone || lead.email) readiness += 15;
    if (lead.budget_max) readiness += 20;
    if (lead.preferred_regions?.length) readiness += 15;
    if (lead.bedrooms !== null) readiness += 10;
    if (activities.length > 0) readiness += 10;
    if (opportunities.length > 0) readiness += 10;
    readiness = Math.min(100, readiness);
    const risk =
      activities.length === 0
        ? "alto"
        : opportunities.length === 0
          ? "médio"
          : "baixo";
    const nextAction =
      activities.length === 0
        ? "Realizar o primeiro contato e registrar a resposta."
        : opportunities.length === 0
          ? "Apresentar o imóvel com maior aderência e abrir oportunidade."
          : "Validar objeções e avançar a oportunidade para a próxima etapa.";
    return { readiness, nextAction, risk };
  }, [activities.length, lead, opportunities.length]);

  async function saveLead(event: FormEvent) {
    event.preventDefault();
    if (!lead) return;
    setSaving(true);
    setMessage(null);
    try {
      const data = await api(`/api/v1/leads/${lead.id}`, {
        method: "PATCH",
        body: JSON.stringify(lead),
      });
      setLead(data.lead);
      setMessage("Lead atualizado e registrado na timeline.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function correctCommercialContext(input: {
    projectId: string | null;
    source: string | null;
    reason: string;
    humanConfirmed: true;
    expectedProjectId: string | null;
    expectedSource: string | null;
  }) {
    setContextSaving(true);
    setMessage(null);
    try {
      await api(`/api/v1/leads/${leadId}`, {
        method: "POST",
        body: JSON.stringify({ action: "correct_commercial_context", ...input }),
      });
      await load();
      setMessage("Projeto e origem corrigidos com justificativa registrada na timeline.");
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : "Não foi possível corrigir o contexto comercial.";
      await load();
      setMessage(errorMessage);
      throw error;
    } finally {
      setContextSaving(false);
    }
  }

  async function addActivity(event: FormEvent) {
    event.preventDefault();
    const title = activityTitle.trim();
    if (!title) return;
    try {
      await api(`/api/v1/leads/${leadId}`, {
        method: "POST",
        body: JSON.stringify({
          action: "activity",
          title,
          description: activityDescription,
          type: activityType,
        }),
      });
      setActivityTitle("");
      setActivityDescription("");
      setMessage("Interação registrada no histórico.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Falha ao registrar interação.",
      );
    }
  }

  async function createOpportunity(propertyId?: string) {
    try {
      await api(`/api/v1/leads/${leadId}`, {
        method: "POST",
        body: JSON.stringify({ action: "opportunity", propertyId }),
      });
      setMessage("Oportunidade criada no pipeline.");
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao criar oportunidade.",
      );
    }
  }

  async function acceptAssignment() {
    try {
      await api(`/api/v1/leads/${leadId}`, {
        method: "POST",
        body: JSON.stringify({ action: "accept_assignment" }),
      });
      setMessage(
        "Lead aceita. A carteira permanece com você e o aceite foi registrado.",
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível aceitar a lead.",
      );
    }
  }

  async function simulate(propertyId: string) {
    setMessage(null);
    try {
      const data = (await api(`/api/v1/leads/${leadId}/commercial-simulation`, {
        method: "POST",
        body: JSON.stringify({ action: "simulate", propertyId }),
      })) as { simulation: typeof simulation; disclaimer: string };
      setSimulation(data.simulation);
      setMessage(data.disclaimer);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao simular.");
    }
  }

  async function requestProposal() {
    if (!simulation) return;
    try {
      await api(`/api/v1/leads/${leadId}/commercial-simulation`, {
        method: "POST",
        body: JSON.stringify({
          action: "proposal",
          simulationId: simulation.id,
        }),
      });
      setMessage(
        "Proposta enviada para revisão humana de preço, estoque e condição de pagamento.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao preparar proposta.",
      );
    }
  }

  async function updateProposal(
    simulationId: string,
    status: "sent" | "accepted" | "declined",
    note?: string,
  ) {
    try {
      await api(`/api/v1/leads/${leadId}/commercial-simulation`, {
        method: "POST",
        body: JSON.stringify({
          action: "proposal_lifecycle",
          simulationId,
          status,
          note,
        }),
      });
      setMessage(
        status === "sent"
          ? "Envio registrado; agora acompanhe o retorno dentro da validade."
          : status === "accepted"
            ? "Aceite do cliente registrado."
            : "Recusa registrada para aprendizado comercial.",
      );
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Falha ao atualizar a proposta.",
      );
    }
  }

  async function qualifyLead(answers?: Record<string, string>) {
    setQualifying(true);
    setMessage(null);
    try {
      const data = (await api(`/api/v1/leads/${leadId}/qualify`, {
        method: "POST",
        body: JSON.stringify({ answers }),
      })) as { qualification: Qualification };
      setQualification(data.qualification);
      setLead((current) =>
        current
          ? {
              ...current,
              score: data.qualification.score,
              temperature: data.qualification.temperature,
            }
          : current,
      );
      const answeredKeys = Object.keys(answers ?? {});
      if (answeredKeys.length)
        setDataQuality((current) => {
          if (!current) return current;
          const questions = current.questions.filter(
            (question) => !answeredKeys.includes(question.key),
          );
          return {
            ...current,
            questions,
            nextQuestion: questions[0] || null,
            completeness: Math.min(
              100,
              current.completeness + 10 * answeredKeys.length,
            ),
          };
        });
      setMessage("Qualificação recalibrada e registrada na timeline.");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Falha ao recalibrar o lead.",
      );
    } finally {
      setQualifying(false);
    }
  }

  function actOnGap(question: GapQuestion) {
    if (question.action === "navigate") {
      window.location.assign(
        question.target === "schedule"
          ? `/leads/${leadId}/schedule`
          : question.target,
      );
      return;
    }
    const selector: Record<string, string> = {
      phone: 'input[placeholder="Telefone"]',
      budget_max: 'input[placeholder="Orçamento máximo"]',
      preferred_regions: 'input[placeholder="Regiões preferidas"]',
      bedrooms: 'input[placeholder="Dormitórios"]',
    };
    document
      .querySelector<HTMLInputElement>(selector[question.target] || "")
      ?.focus();
  }

  async function copyContact(field: "phone" | "email", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedContact(field);
      window.setTimeout(
        () => setCopiedContact((current) => (current === field ? null : current)),
        1600,
      );
    } catch {
      setMessage("Não foi possível copiar automaticamente. Copie manualmente.");
    }
  }

  if (loading)
    return (
      <div className="space-y-4">
        <AtlasSkeleton className="h-56 w-full" />
        <AtlasSkeleton className="h-16 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <AtlasSkeleton className="h-24 w-full" />
          <AtlasSkeleton className="h-24 w-full" />
          <AtlasSkeleton className="h-24 w-full" />
          <AtlasSkeleton className="h-24 w-full" />
        </div>
        <AtlasSkeleton className="h-96 w-full" />
      </div>
    );
  if (!lead)
    return (
      <AtlasEmpty
        title="Lead não encontrado"
        description={
          message ||
          "O registro pode ter sido removido ou você não possui acesso."
        }
        action={
          <Link href="/leads" className="atlas-button-secondary">
            Voltar para leads
          </Link>
        }
      />
    );

  // Derivações determinísticas do strip de sinais (zero fetch novo).
  const leadAgeDays = daysSince(lead.created_at);
  const lastTouchAt = contactBriefing?.lastInteractionAt ?? null;
  const lastTouchDays = daysSince(lastTouchAt);
  const orderedAttentionSignals = [...attentionSignals].sort(
    (a, b) => attentionSeverityRank[a.severity] - attentionSeverityRank[b.severity],
  );
  const ownerName = relationshipContext?.owner?.full_name || null;
  const ownerRole =
    relationshipContext?.owner?.commercial_role ||
    relationshipContext?.owner?.role ||
    null;

  return (
    <div className="space-y-5 pb-10" data-phase="26-lead-360">
      {/* ── Cartão de identidade: único lugar da página com nome, status,
          temperatura, score, contatos e dono. Nenhuma seção abaixo repete. ── */}
      <section id="lead-overview" className="scroll-mt-28 [perspective:1400px]">
        <TiltShell maxDeg={2} className="cc6-reveal cc6-panel p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Link
                  href="/leads"
                  className={`rounded-sm text-xs text-[#6b7890] transition-colors hover:text-[#aab6ca] ${focusRing}`}
                >
                  ← Leads
                </Link>
                <p className="cc6-eyebrow">Lead 360</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[#e8eef8] sm:text-[32px] sm:leading-10">
                  {lead.name || "Lead sem nome"}
                </h1>
                <StatusBadge tone="violet">{lead.status || "novo"}</StatusBadge>
                <StatusBadge tone={temperatureTone(lead.temperature)}>
                  {lead.temperature || "não classificado"}
                </StatusBadge>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {([
                  ["phone", lead.phone, "telefone"],
                  ["email", lead.email, "e-mail"],
                ] as const).map(([field, value, label]) =>
                  value ? (
                    <button
                      key={field}
                      type="button"
                      onClick={() => void copyContact(field, value)}
                      title={`Copiar ${label}`}
                      aria-label={`Copiar ${label} ${value}`}
                      className={chipButtonClass}
                    >
                      <span>{value}</span>
                      <span
                        aria-hidden="true"
                        className={
                          copiedContact === field ? "cc6-ok" : "text-[#6b7890]"
                        }
                      >
                        {copiedContact === field ? "✓" : "⧉"}
                      </span>
                    </button>
                  ) : null,
                )}
                {!lead.phone && !lead.email ? (
                  <span className="cc6-chip">
                    sem contatos — preencha no formulário
                  </span>
                ) : null}
              </div>
              <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#6b7890]">
                <span className="cc6-eyebrow text-[10px]">dono</span>
                <span className="text-[#aab6ca]">
                  {ownerName || "Sem responsável"}
                </span>
                <span>· {ownerRole || "distribuição necessária"}</span>
                <Link
                  href={`/leads/${lead.id}/transfer`}
                  className={`rounded-sm text-[color:var(--atlas-accent)] transition-colors hover:underline ${focusRing}`}
                >
                  {ownerName ? "transferir" : "atribuir"}
                </Link>
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="cc6-eyebrow">Score</p>
              <p className="mt-1">
                <span className="cc6-metric-value text-[40px] leading-none">
                  {lead.score ?? 0}
                </span>
                <span className="cc6-num ml-1 text-sm text-[#6b7890]">/100</span>
              </p>
              <p className="cc6-metric-label mt-2">
                prontidão{" "}
                <span className="cc6-num text-[#aab6ca]">
                  {intelligence.readiness}%
                </span>
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <CopilotContextAction
              label="✦ Preparar próxima ação"
              prompt="Analise esta lead e prepare a próxima melhor ação com justificativa, abordagem sugerida e ponto que exige confirmação humana."
              context={{
                leadId: lead.id,
                source: "lead_360",
                workspace: "lead",
                contextLabel: "Lead 360",
                returnHref: `/leads/${lead.id}`,
              }}
              className="atlas-button-primary"
            />
            <Link href={`/leads/${lead.id}/messages`} className="cc6-ghost-btn">
              Criar mensagem
            </Link>
            <Link
              href={`/leads/${lead.id}/qualification`}
              className="cc6-ghost-btn"
            >
              Qualificar
            </Link>
            <a href="#historico" className="cc6-ghost-btn">
              Registrar contato
            </a>
            <button
              type="button"
              className="cc6-ghost-btn"
              aria-expanded={moreActionsOpen}
              aria-controls="atlas-lead-more-actions"
              onClick={() => setMoreActionsOpen((current) => !current)}
            >
              {moreActionsOpen ? "Menos ações" : "Mais ações"}{" "}
              <span aria-hidden="true">{moreActionsOpen ? "−" : "+"}</span>
            </button>
          </div>
          {moreActionsOpen ? (
            <div
              id="atlas-lead-more-actions"
              className="mt-3 flex flex-wrap gap-2"
            >
              <Link
                href={`/leads/${lead.id}/simulation`}
                className="cc6-ghost-btn"
              >
                Simular condições
              </Link>
              <Link
                href={`/leads/${lead.id}/visit-assistant`}
                className="cc6-ghost-btn"
              >
                Visita e proposta
              </Link>
              <button
                type="button"
                onClick={() => void qualifyLead()}
                disabled={qualifying}
                className="cc6-ghost-btn disabled:opacity-50"
              >
                {qualifying ? "Recalibrando..." : "Recalibrar com IA"}
              </button>
              <Link
                href={`/leads/${lead.id}/prediction`}
                className="cc6-ghost-btn"
              >
                Previsão explicada
              </Link>
              <Link href={`/leads/${lead.id}/memory`} className="cc6-ghost-btn">
                Memória segura
              </Link>
              <Link
                href={`/leads/${lead.id}/behavior`}
                className="cc6-ghost-btn"
              >
                Jornada inteligente
              </Link>
              <Link
                href={`/leads/${lead.id}/attribution`}
                className="cc6-ghost-btn"
              >
                Origem e atribuição
              </Link>
              <Link
                href={`/leads/${lead.id}/contact-preferences`}
                className="cc6-ghost-btn"
              >
                Consentimento
              </Link>
              <Link
                href={`/leads/${lead.id}/objections`}
                className="cc6-ghost-btn"
              >
                Objeções de venda
              </Link>
              <button
                type="button"
                onClick={() => void createOpportunity()}
                className="cc6-ghost-btn"
              >
                Criar oportunidade
              </button>
            </div>
          ) : null}

          {/* Strip de sinais: mono, discreto, determinístico — title explica cada chip. */}
          <div
            className="cc6-hairline mt-6 pt-4"
            data-phase="100-proactive-attention-signals"
          >
            <ul
              className="m-0 flex list-none flex-wrap items-center gap-2 p-0"
              aria-label="Sinais operacionais do lead"
            >
              <li className="cc6-eyebrow mr-1">Sinais</li>
              {lead.created_at && leadAgeDays !== null ? (
                <li
                  className="cc6-chip"
                  title={`No CRM desde ${new Date(lead.created_at).toLocaleDateString("pt-BR")}.`}
                >
                  criado há {leadAgeDays}d
                </li>
              ) : null}
              {lastTouchAt && lastTouchDays !== null ? (
                <li
                  className="cc6-chip"
                  title={`Última interação em ${new Date(lastTouchAt).toLocaleString("pt-BR")}.`}
                >
                  último toque há {lastTouchDays}d
                </li>
              ) : (
                <li
                  className="cc6-chip cc6-warn border-[rgba(245,181,68,0.35)]"
                  title="Nenhuma interação registrada na timeline até agora."
                >
                  sem contato registrado
                </li>
              )}
              {orderedAttentionSignals.map((signal) => (
                <li
                  key={signal.kind}
                  className={`cc6-chip ${attentionChipClass[signal.severity]}`}
                  title={
                    signal.since
                      ? `${signal.detail} Desde ${new Date(signal.since).toLocaleDateString("pt-BR")}.`
                      : signal.detail
                  }
                >
                  {signal.reason}
                </li>
              ))}
            </ul>
          </div>
        </TiltShell>
      </section>

      {/* ── Grau primário de decisão: a barra operacional já concentra próxima
          ação, risco, tarefas, mensagens e atalhos — logo sob a identidade. ── */}
      <LeadOperationalBar
        leadId={lead.id}
        leadName={lead.name || "Lead sem nome"}
        phone={lead.phone}
        nextAction={intelligence.nextAction}
        risk={intelligence.risk}
        openTasks={contactBriefing?.openTasks ?? 0}
        unreadMessages={contactBriefing?.unreadMessages ?? 0}
      />

      {message ? (
        <div
          role="status"
          className="cc6-panel-quiet border-[rgba(75,141,248,0.35)] p-4 text-sm leading-6 text-[#aab6ca]"
        >
          {message}
        </div>
      ) : null}

      {assignmentReservation?.status === "pending" ? (
        <section
          data-phase="58-lead-reservation"
          className="cc6-panel cc6-sev-band flex flex-col gap-4 p-5 pl-6 sm:flex-row sm:items-center sm:justify-between"
          style={{ "--cc6-sev": "#f5b544" } as CSSProperties}
        >
          <div>
            <p className="cc6-eyebrow cc6-warn">Reserva aguardando aceite</p>
            <h2 className="mt-2 text-base font-semibold text-[#e8eef8]">
              Confirme que você assumirá este atendimento
            </h2>
            <p className="mt-1 text-xs leading-5 text-[#6b7890]">
              Aceite até{" "}
              <span className="cc6-num text-[#aab6ca]">
                {new Date(assignmentReservation.expires_at).toLocaleTimeString(
                  "pt-BR",
                  { hour: "2-digit", minute: "2-digit" },
                )}
              </span>
              . Se houver interação registrada, a lead não será devolvida
              automaticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void acceptAssignment()}
            className="atlas-button-primary"
          >
            Aceitar lead
          </button>
        </section>
      ) : null}

      {experienceSignals[0]?.status === "pending" ? (
        <section
          className="cc6-panel cc6-sev-band p-5 pl-6"
          style={
            {
              "--cc6-sev":
                experienceSignals[0].severity === "critical"
                  ? "#fb7185"
                  : "#f5b544",
            } as CSSProperties
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              className={`cc6-eyebrow ${
                experienceSignals[0].severity === "critical"
                  ? "cc6-crit"
                  : "cc6-warn"
              }`}
            >
              IA de experiência · atenção ao atendimento
            </p>
            <StatusBadge
              tone={
                experienceSignals[0].severity === "critical"
                  ? "danger"
                  : "warning"
              }
            >
              {experienceSignals[0].confidence}% confiança
            </StatusBadge>
          </div>
          <p className="mt-3 text-sm font-medium leading-6 text-[#e8eef8]">
            {experienceSignals[0].evidence}
          </p>
          <p className="mt-1 text-[13px] leading-6 text-[#aab6ca]">
            Recomendação:{" "}
            {experienceSignals[0].recommendation === "offer_broker_change"
              ? "oferecer ao cliente a opção de manter ou trocar o corretor"
              : "recuperar o atendimento com acompanhamento"}
            . A troca nunca acontece automaticamente.
          </p>
          {experienceSignals[0].suggested_reply ? (
            <div className="cc6-panel-quiet mt-3 p-3">
              <p className="cc6-eyebrow text-[10px]">Resposta sugerida</p>
              <p className="mt-1.5 text-[13px] leading-6 text-[#aab6ca]">
                {experienceSignals[0].suggested_reply}
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {dataQuality?.questions.length ? (
        <section
          data-phase="30-data-gaps"
          className="cc6-reveal cc6-panel p-5 sm:p-6"
          style={{ animationDelay: "60ms" }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="cc6-eyebrow">Dados que faltam</p>
              <h2 className="mt-2 text-base font-semibold text-[#e8eef8]">
                O que perguntar agora
              </h2>
            </div>
            <p className="cc6-num text-xs text-[#6b7890]">
              {dataQuality.completeness}% completo ·{" "}
              {dataQuality.completedFields}/{dataQuality.totalFields} campos
            </p>
          </div>
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {dataQuality.questions.slice(0, 6).map((question, index) => (
              <article
                key={question.key}
                className={`cc6-panel-quiet p-4 ${
                  index === 0 ? "border-[rgba(75,141,248,0.45)]" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <StatusBadge
                    tone={
                      question.priority === "critical"
                        ? "danger"
                        : question.priority === "high"
                          ? "warning"
                          : "info"
                    }
                  >
                    {question.label}
                  </StatusBadge>
                  {index === 0 ? (
                    <span className="cc6-eyebrow text-[10px] text-[color:var(--atlas-accent)]">
                      pergunte agora
                    </span>
                  ) : null}
                </div>
                <strong className="mt-3 block text-sm leading-6 text-[#e8eef8]">
                  {question.question}
                </strong>
                <p className="mt-1 text-xs leading-5 text-[#6b7890]">
                  {question.why}
                </p>
                {question.options ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {question.options.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={qualifying}
                        onClick={() =>
                          void qualifyLead({ [question.key]: option.value })
                        }
                        className={chipButtonClass}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => actOnGap(question)}
                    className="cc6-ghost-btn mt-3"
                  >
                    {question.action === "navigate"
                      ? "Abrir ação"
                      : "Preencher agora"}
                  </button>
                )}
              </article>
            ))}
          </div>
          <p className="cc6-hairline mt-4 pt-3 text-[11px] leading-5 text-[#6b7890]">
            Prioridade por impacto em contato, intenção, matching e
            continuidade — análise local, sem custo de IA. CPF, CNPJ, endereço
            exato e documentos não aumentam score nem são enviados às IAs.
          </p>
        </section>
      ) : dataQuality?.status === "complete" ? (
        <div
          data-phase="30-data-gaps"
          className="cc6-panel-quiet p-4 text-sm leading-6 text-[#aab6ca]"
        >
          <span className="cc6-ok font-medium">Perfil comercial completo.</span>{" "}
          Confirme apenas mudanças naturais na próxima conversa.
        </div>
      ) : null}

      {/* Contexto comercial: só o que a identidade não cobre (projeto, origem,
          comunicações, pipeline). Cada tile aponta para o registro canônico. */}
      {relationshipContext ? (
        <section
          className="cc6-reveal"
          style={{ animationDelay: "110ms" }}
          aria-label="Contexto comercial do lead"
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: "Projeto de interesse",
                value:
                  relationshipContext.development?.name || "Ainda não definido",
                detail: relationshipContext.development
                  ? `${relationshipContext.development.developer_name || "Incorporadora"}${relationshipContext.development.city ? ` · ${relationshipContext.development.city}` : ""}`
                  : "Complete para melhorar o matching",
                href: "#commercial-context",
              },
              {
                label: "Origem",
                value:
                  relationshipContext.campaign?.name ||
                  relationshipContext.origin.source,
                detail: relationshipContext.campaign
                  ? `${relationshipContext.campaign.channel || "Canal não informado"} · ${relationshipContext.origin.campaignEvents} sinais`
                  : `${relationshipContext.origin.historicalMemories} memórias históricas`,
                href: "#commercial-context",
              },
              {
                label: "Comunicações",
                value: `${relationshipContext.communications.messages} mensagens`,
                detail: `${relationshipContext.communications.inbound} recebidas${
                  relationshipContext.communications.channels.length
                    ? ` · ${relationshipContext.communications.channels.join(", ")}`
                    : ""
                }`,
                href: `/leads/${lead.id}/messages`,
              },
              {
                label: "Pipeline",
                value: `${opportunities.length} oportunidades`,
                detail: `${contactBriefing?.activeOpportunities ?? 0} negócios ativos`,
                href: "/pipeline",
              },
            ].map((item) => (
              <Link
                href={item.href}
                key={item.label}
                className={`cc6-panel-quiet block p-4 transition-colors hover:border-[color:var(--atlas-accent)] ${focusRing}`}
              >
                <span className="cc6-eyebrow text-[10px]">{item.label}</span>
                <strong
                  className="mt-2 block truncate text-sm leading-5 text-[#e8eef8]"
                  title={item.value}
                >
                  {item.value}
                </strong>
                <p className="mt-1.5 truncate text-[11px] leading-5 text-[#6b7890]">
                  {item.detail}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {relationshipContext ? (
        <LeadContextCorrection
          key={`${lead.id}:${lead.development_id || "none"}:${lead.source || "none"}`}
          currentProjectId={lead.development_id}
          currentProjectName={relationshipContext.development?.name ?? null}
          currentSource={lead.source}
          projects={projectOptions}
          saving={contextSaving}
          onSubmit={correctCommercialContext}
        />
      ) : null}

      {/* Briefing: leitura secundária antes do contato — sem repetir contadores
          que já vivem na barra operacional. */}
      {contactBriefing ? (
        <section
          className="cc6-reveal cc6-panel-quiet p-5 sm:p-6"
          style={{ animationDelay: "160ms" }}
        >
          <p className="cc6-eyebrow">Briefing antes do contato</p>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-[#e8eef8]">
                Último contexto conhecido
              </h3>
              <p className="mt-2 max-w-prose text-[13.5px] leading-7 text-[#aab6ca]">
                {contactBriefing.context}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-[#e8eef8]">
                Roteiro recomendado
              </h3>
              <ol className="mt-2 space-y-2">
                {contactBriefing.actions.map((action, index) => (
                  <li
                    key={action}
                    className="flex gap-3 text-[13.5px] leading-7 text-[#aab6ca]"
                  >
                    <span className="cc6-num shrink-0 text-xs leading-7 text-[#6b7890]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {action}
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <p className="cc6-hairline mt-4 pt-3 text-[11px] leading-5 text-[#6b7890]">
            Preparado por {contactBriefing.generatedBy}. O corretor revisa e
            decide antes de qualquer envio ou alteração.
          </p>
        </section>
      ) : null}

      {qualification ? (
        <section
          id="qualificacao"
          className="cc6-reveal cc6-panel scroll-mt-28 p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="cc6-eyebrow">Qualificação rápida</p>
              <h2 className="mt-2 text-base font-semibold text-[#e8eef8]">
                Como o Atlas chegou a esta qualificação
              </h2>
              <p className="mt-1 text-xs leading-5 text-[#6b7890]">
                Confiança de{" "}
                <span className="cc6-num">{qualification.confidence}%</span> ·{" "}
                <span className="cc6-num">
                  {qualification.progress.answered}/3
                </span>{" "}
                respostas essenciais · recalculado em{" "}
                <span className="cc6-num">
                  {new Date(qualification.recalculatedAt).toLocaleString(
                    "pt-BR",
                  )}
                </span>
                .
              </p>
            </div>
            <div className="flex gap-2">
              <StatusBadge
                tone={
                  qualification.scoreChange.delta >= 0 ? "success" : "warning"
                }
              >
                {qualification.scoreChange.delta >= 0 ? "+" : ""}
                {qualification.scoreChange.delta} pontos
              </StatusBadge>
              <StatusBadge tone={temperatureTone(qualification.temperature)}>
                {qualification.score}/100 · {qualification.temperature}
              </StatusBadge>
            </div>
          </div>
          <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
            <div className="grid gap-3 sm:grid-cols-2">
              {qualification.dimensions.map((dimension) => (
                <div key={dimension.key} className="cc6-panel-quiet p-4">
                  <div className="flex items-center justify-between">
                    <strong className="text-sm text-[#e8eef8]">
                      {dimension.label}
                    </strong>
                    <span className="cc6-num text-xs text-[#aab6ca]">
                      {dimension.score}/{dimension.maximum}
                    </span>
                  </div>
                  <div className="mt-3">
                    <AtlasProgress
                      value={Math.round(
                        (dimension.score / dimension.maximum) * 100,
                      )}
                    />
                  </div>
                  <p className="mt-3 text-xs leading-5 text-[#6b7890]">
                    {dimension.reasons.slice(0, 2).join(" · ") ||
                      "Ainda sem sinais suficientes"}
                  </p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="cc6-panel-quiet cc6-sev-band p-4 pl-5">
                <p className="cc6-eyebrow text-[10px]">Próxima melhor ação</p>
                <p className="mt-2 text-sm leading-6 text-[#e8eef8]">
                  {qualification.nextBestAction}
                </p>
              </div>
              {qualification.risks.length ? (
                <div
                  className="cc6-panel-quiet cc6-sev-band p-4 pl-5"
                  style={{ "--cc6-sev": "#fb7185" } as CSSProperties}
                >
                  <p className="cc6-eyebrow cc6-crit text-[10px]">Riscos</p>
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-[#aab6ca]">
                    {qualification.risks.map((risk) => (
                      <li key={risk}>• {risk}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {qualification.missingData.length ? (
                <div
                  className="cc6-panel-quiet cc6-sev-band p-4 pl-5"
                  style={{ "--cc6-sev": "#f5b544" } as CSSProperties}
                >
                  <p className="cc6-eyebrow cc6-warn text-[10px]">
                    Dados que aumentam a confiança
                  </p>
                  <p className="mt-2 text-xs leading-5 text-[#aab6ca]">
                    {qualification.missingData.join(" · ")}
                  </p>
                </div>
              ) : null}
            </div>
          </div>
          {qualification.recommendedQuestions.length ? (
            <div className="cc6-hairline mt-5 pt-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="cc6-eyebrow">Próxima pergunta mais relevante</p>
                <span className="cc6-num text-xs text-[#6b7890]">
                  {qualification.progress.percent}% essencial concluído
                </span>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {qualification.recommendedQuestions.map((question, index) => (
                  <div
                    key={question.key}
                    className={`cc6-panel-quiet p-4 ${
                      index === 0 ? "border-[rgba(75,141,248,0.45)]" : ""
                    }`}
                  >
                    <strong className="text-sm leading-6 text-[#e8eef8]">
                      {question.question}
                    </strong>
                    <p className="mt-1 text-xs leading-5 text-[#6b7890]">
                      {question.why}
                    </p>
                    {question.options ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {question.options.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            disabled={qualifying}
                            onClick={() =>
                              void qualifyLead({
                                [question.key]: option.value,
                              })
                            }
                            className={chipButtonClass}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          document
                            .querySelector<HTMLInputElement>(
                              question.key === "budget"
                                ? 'input[placeholder="Orçamento máximo"]'
                                : 'input[placeholder="Regiões preferidas"]',
                            )
                            ?.focus()
                        }
                        className="cc6-ghost-btn mt-3"
                      >
                        Preencher perfil
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[11px] leading-5 text-[#6b7890]">
                Finalidade, prazo e pagamento recalibram score e próxima ação
                imediatamente. Para a Meta saem apenas categorias agregadas;
                conversa livre e dados pessoais permanecem no CRM.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {proposals.length ? (
        <section className="cc6-reveal cc6-panel p-5 sm:p-6">
          <p className="cc6-eyebrow">SLA de proposta</p>
          <h2 className="mt-2 text-base font-semibold text-[#e8eef8]">
            Preparação, envio e retorno
          </h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {proposals.map((proposal) => (
              <article key={proposal.id} className="cc6-panel-quiet p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm text-[#e8eef8]">
                      {proposal.rule_snapshot?.propertyTitle ||
                        "Proposta comercial"}
                    </strong>
                    <p className="cc6-num mt-1 text-xs text-[#6b7890]">
                      {brl.format(proposal.property_price)} · válida até{" "}
                      {new Date(proposal.valid_until).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <StatusBadge
                    tone={
                      proposal.status === "accepted"
                        ? "success"
                        : proposal.status === "declined" ||
                            proposal.status === "expired"
                          ? "danger"
                          : proposal.status === "sent"
                            ? "info"
                            : "warning"
                    }
                  >
                    {proposal.status}
                  </StatusBadge>
                </div>
                <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
                  {([
                    ["Preparação", proposal.preparation_minutes],
                    ["Revisão", proposal.review_minutes],
                    ["Resposta", proposal.response_minutes],
                  ] as const).map(([label, minutes]) => (
                    <div key={label} className="cc6-panel-quiet p-2">
                      <dt className="cc6-metric-label">{label}</dt>
                      <dd className="cc6-num mt-1 text-sm text-[#e8eef8]">
                        {minutes ?? "—"} min
                      </dd>
                    </div>
                  ))}
                </dl>
                {proposal.status === "approved" ? (
                  <button
                    type="button"
                    onClick={() => void updateProposal(proposal.id, "sent")}
                    className="atlas-button-primary mt-4"
                  >
                    Registrar envio ao cliente
                  </button>
                ) : null}
                {proposal.status === "sent" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void updateProposal(proposal.id, "accepted")
                      }
                      className="atlas-button-primary"
                    >
                      Cliente aceitou
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void updateProposal(
                          proposal.id,
                          "declined",
                          "Cliente recusou a condição apresentada.",
                        )
                      }
                      className="cc6-ghost-btn"
                    >
                      Cliente recusou
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
          <p className="cc6-hairline mt-4 pt-3 text-[11px] leading-5 text-[#6b7890]">
            Preço, estoque e regra continuam governados; o contato com o
            cliente também fica mensurado.
          </p>
        </section>
      ) : null}

      {simulation ? (
        <section className="cc6-reveal cc6-panel p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="cc6-eyebrow">Simulação, não promessa</p>
              <h2 className="mt-2 text-base font-semibold text-[#e8eef8]">
                {simulation.rule_snapshot.ruleName} · versão{" "}
                <span className="cc6-num">
                  {simulation.rule_snapshot.version}
                </span>
              </h2>
              <p className="mt-1 text-xs leading-5 text-[#6b7890]">
                Regra vigente de {simulation.rule_snapshot.developerName}{" "}
                fotografada no cálculo; mudanças futuras não alteram este
                histórico.
              </p>
            </div>
            <StatusBadge tone="warning">
              válida até{" "}
              {new Date(simulation.valid_until).toLocaleString("pt-BR")}
            </StatusBadge>
          </div>
          <p
            className="cc6-panel-quiet cc6-sev-band mt-4 p-3 pl-4 text-xs font-medium leading-5 text-[#f5b544]"
            style={{ "--cc6-sev": "#f5b544" } as CSSProperties}
          >
            {simulation.rule_snapshot.disclaimer}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Preço de referência", brl.format(simulation.property_price)],
              [
                "Entrada estimada",
                simulation.down_payment === null
                  ? "Conforme fluxo"
                  : brl.format(simulation.down_payment),
              ],
              [
                "Saldo após entrada",
                simulation.financed_balance === null
                  ? "A definir"
                  : brl.format(simulation.financed_balance),
              ],
              [
                "Parcelas lineares estimadas",
                simulation.installment_amount === null
                  ? "Conforme regra"
                  : `${simulation.installments_count} × ${brl.format(simulation.installment_amount)}`,
              ],
            ].map(([label, value]) => (
              <div key={label} className="cc6-panel-quiet p-4">
                <span className="cc6-metric-label">{label}</span>
                <strong className="cc6-metric-value mt-2 block text-lg">
                  {value}
                </strong>
              </div>
            ))}
          </div>
          <details className="cc6-panel-quiet group mt-3">
            <summary className={summaryClass}>
              <span className="cc6-eyebrow">
                Fluxo de pagamento e base de cálculo
              </span>
              <span
                aria-hidden="true"
                className="text-[#6b7890] transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </summary>
            <div className="cc6-hairline p-4">
              <p className="whitespace-pre-line text-xs leading-6 text-[#aab6ca]">
                {simulation.rule_snapshot.paymentFlow}
              </p>
              {simulation.rule_snapshot.balloonPaymentNotes ? (
                <p className="mt-3 text-xs leading-5 text-[#6b7890]">
                  <strong className="text-[#aab6ca]">Reforços:</strong>{" "}
                  {simulation.rule_snapshot.balloonPaymentNotes}
                </p>
              ) : null}
              {simulation.rule_snapshot.financingNotes ? (
                <p className="mt-2 text-xs leading-5 text-[#6b7890]">
                  <strong className="text-[#aab6ca]">Crédito:</strong>{" "}
                  {simulation.rule_snapshot.financingNotes}
                </p>
              ) : null}
              <p className="cc6-num mt-3 text-[10px] leading-5 text-[#6b7890]">
                Base do cálculo: {simulation.rule_snapshot.calculation}
              </p>
            </div>
          </details>
          <button
            type="button"
            onClick={() => void requestProposal()}
            className="atlas-button-primary mt-4"
          >
            Enviar para revisão humana
          </button>
        </section>
      ) : null}

      <section
        className="cc6-reveal grid gap-4 2xl:grid-cols-[1.15fr_.85fr]"
        style={{ animationDelay: "210ms" }}
      >
        <section className="cc6-panel p-5 sm:p-6">
          <p className="cc6-eyebrow">Perfil do comprador</p>
          <h2 className="mt-2 text-base font-semibold text-[#e8eef8]">
            Dados e qualificação
          </h2>
          <form onSubmit={saveLead} className="mt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                className={inputClass}
                value={lead.name ?? ""}
                placeholder="Nome"
                aria-label="Nome"
                onChange={(e) => setLead({ ...lead, name: e.target.value })}
              />
              <input
                className={inputClass}
                value={lead.phone ?? ""}
                placeholder="Telefone"
                aria-label="Telefone"
                onChange={(e) => setLead({ ...lead, phone: e.target.value })}
              />
              <input
                className={inputClass}
                value={lead.email ?? ""}
                placeholder="E-mail"
                aria-label="E-mail"
                onChange={(e) => setLead({ ...lead, email: e.target.value })}
              />
              <select
                className={inputClass}
                value={lead.status ?? "novo"}
                aria-label="Etapa do lead"
                onChange={(e) => setLead({ ...lead, status: e.target.value })}
              >
                {[
                  "novo",
                  "contato",
                  "qualificacao",
                  "visita",
                  "proposta",
                  "contrato",
                  "ganho",
                  "perdido",
                  "comprou_outro",
                ].map((status) => (
                  <option key={status} value={status}>
                    {status === "comprou_outro"
                      ? "Comprou em outro lugar"
                      : status}
                  </option>
                ))}
              </select>
              <select
                className={inputClass}
                value={lead.temperature ?? "frio"}
                aria-label="Temperatura do lead"
                onChange={(e) =>
                  setLead({ ...lead, temperature: e.target.value })
                }
              >
                <option>frio</option>
                <option>morno</option>
                <option>quente</option>
              </select>
              <input
                className={inputClass}
                type="number"
                value={lead.budget_min ?? ""}
                placeholder="Orçamento mínimo"
                aria-label="Orçamento mínimo"
                onChange={(e) =>
                  setLead({
                    ...lead,
                    budget_min: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
              <input
                className={inputClass}
                type="number"
                value={lead.budget_max ?? ""}
                placeholder="Orçamento máximo"
                aria-label="Orçamento máximo"
                onChange={(e) =>
                  setLead({
                    ...lead,
                    budget_max: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
              <input
                className={inputClass}
                type="number"
                value={lead.bedrooms ?? ""}
                placeholder="Dormitórios"
                aria-label="Dormitórios"
                onChange={(e) =>
                  setLead({
                    ...lead,
                    bedrooms: e.target.value ? Number(e.target.value) : null,
                  })
                }
              />
              <input
                className={inputClass}
                value={(lead.preferred_regions ?? []).join(", ")}
                placeholder="Regiões preferidas"
                aria-label="Regiões preferidas"
                onChange={(e) =>
                  setLead({
                    ...lead,
                    preferred_regions: e.target.value
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
            <textarea
              className={`${inputClass} mt-3 min-h-32`}
              value={lead.notes ?? ""}
              placeholder="Observações estratégicas"
              aria-label="Observações estratégicas"
              onChange={(e) => setLead({ ...lead, notes: e.target.value })}
            />
            <p className="mt-3 text-[11px] leading-5 text-[#6b7890]">
              A origem comercial não é editada aqui — use &quot;Corrigir
              contexto&quot; acima para alterá-la com justificativa auditável.
            </p>
            <div className="mt-4 flex justify-end">
              <button
                disabled={saving}
                className="atlas-button-primary disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </form>
        </section>

        <div className="space-y-4">
          <section id="historico" className="cc6-panel scroll-mt-28 p-5 sm:p-6">
            <p className="cc6-eyebrow">Registrar</p>
            <h2 className="mt-2 text-base font-semibold text-[#e8eef8]">
              Acompanhamento do contato
            </h2>
            <form onSubmit={addActivity} className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                <input
                  className={inputClass}
                  value={activityTitle}
                  onChange={(e) => setActivityTitle(e.target.value)}
                  placeholder="Registrar ligação, mensagem ou visita"
                  aria-label="Título da interação"
                />
                <select
                  className={inputClass}
                  value={activityType}
                  aria-label="Tipo de interação"
                  onChange={(e) => setActivityType(e.target.value)}
                >
                  <option value="note">Nota</option>
                  <option value="call">Ligação</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="visit">Visita</option>
                  <option value="email">E-mail</option>
                </select>
              </div>
              <textarea
                className={`${inputClass} min-h-24 resize-y`}
                value={activityDescription}
                onChange={(e) => setActivityDescription(e.target.value)}
                placeholder="O que o cliente falou? Ex.: achou o preço alto, prefere outro bairro, precisa financiar ou quer entrega imediata."
                aria-label="Descrição da interação"
              />
              <div className="flex flex-wrap gap-2">
                {[
                  "Preço",
                  "Localização",
                  "Financiamento",
                  "Prazo",
                  "Produto",
                  "Concorrência",
                ].map((signal) => (
                  <button
                    key={signal}
                    type="button"
                    onClick={() =>
                      setActivityDescription(
                        (current) =>
                          `${current}${current ? " · " : ""}${signal}: `,
                      )
                    }
                    className={chipButtonClass}
                  >
                    + {signal}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-5 text-[#6b7890]">
                A descrição fica protegida no CRM. A inteligência usa somente
                categorias anônimas para indicar melhorias de público e
                criativo.
              </p>
              <button className="cc6-ghost-btn w-full justify-center">
                Salvar acompanhamento e aprendizado
              </button>
            </form>
          </section>

          <section className="cc6-panel">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5 pb-0 sm:px-6">
              <div>
                <p className="cc6-eyebrow">Timeline</p>
                <h2 className="mt-2 text-base font-semibold text-[#e8eef8]">
                  Histórico do relacionamento
                </h2>
              </div>
              <span className="cc6-chip" title="Eventos registrados">
                {activities.length}
              </span>
            </div>
            <div className="mt-4 max-h-[420px] overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">
              {activities.length === 0 ? (
                <AtlasEmpty
                  title="Nenhuma interação"
                  description="Registre o primeiro contato para iniciar a memória comercial."
                />
              ) : (
                <div className="space-y-2">
                  {activities.map((activity) => {
                    const contextCorrection =
                      activity.type === "commercial_context_corrected"
                        ? parseCommercialContextCorrectionTimeline(
                            activity.metadata,
                          )
                        : null;

                    return (
                      <article
                        key={activity.id}
                        className="cc6-panel-quiet p-4 transition-colors hover:border-[rgba(148,163,184,0.3)]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="text-sm font-medium leading-6 text-[#e8eef8]">
                            {activity.title}
                          </p>
                          <span className="cc6-chip shrink-0">
                            {activity.type}
                          </span>
                        </div>
                        {!contextCorrection && activity.description ? (
                          <p className="mt-1.5 text-[13px] leading-6 text-[#aab6ca]">
                            {activity.description}
                          </p>
                        ) : null}
                        {contextCorrection ? (
                          <CommercialContextTimelineEntry
                            correction={contextCorrection}
                          />
                        ) : null}
                        <p className="cc6-num mt-3 text-[10px] uppercase tracking-wider text-[#6b7890]">
                          {activity.authorName || "Equipe Atlas"} ·{" "}
                          {new Date(activity.occurred_at).toLocaleString(
                            "pt-BR",
                          )}
                        </p>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </section>

      <section
        id="matching"
        className="cc6-reveal cc6-panel scroll-mt-28 p-5 sm:p-6"
        style={{ animationDelay: "260ms" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="cc6-eyebrow">Matching Atlas</p>
            <h2 className="mt-2 text-base font-semibold text-[#e8eef8]">
              Imóveis recomendados
            </h2>
          </div>
          <Link
            href="/properties"
            className={`rounded-sm text-xs font-semibold text-[color:var(--atlas-accent)] transition-colors hover:underline ${focusRing}`}
          >
            Ver estoque →
          </Link>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {matches.length === 0 ? (
            <div className="md:col-span-2 xl:col-span-3">
              <AtlasEmpty
                title="Nenhum match encontrado"
                description="Complete orçamento, dormitórios e regiões para melhorar o matching."
              />
            </div>
          ) : (
            matches.map(({ property, match }) => (
              <article
                key={property.id}
                className="cc6-panel-quiet p-4 transition-colors hover:border-[color:var(--atlas-accent)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-sm font-semibold leading-6 text-[#e8eef8]">
                    {property.title || "Imóvel sem título"}
                  </h3>
                  <StatusBadge
                    tone={
                      match.score >= 75
                        ? "success"
                        : match.score >= 50
                          ? "warning"
                          : "info"
                    }
                  >
                    {match.score}%
                  </StatusBadge>
                </div>
                <p className="mt-1 text-xs text-[#6b7890]">
                  {property.city || "Localização não informada"}
                  {property.state ? ` · ${property.state}` : ""}
                </p>
                <p className="cc6-metric-value mt-3 text-lg">
                  {property.price
                    ? brl.format(property.price)
                    : "Preço sob consulta"}
                </p>
                <ul className="mt-3 space-y-1 text-xs leading-5 text-[#6b7890]">
                  {match.reasons.slice(0, 3).map((reason) => (
                    <li key={reason}>• {reason}</li>
                  ))}
                </ul>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void createOpportunity(property.id)}
                    className="cc6-ghost-btn justify-center"
                  >
                    Oportunidade
                  </button>
                  <button
                    type="button"
                    onClick={() => void simulate(property.id)}
                    className="atlas-button-primary"
                  >
                    Simular fluxo
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      {/* ── Drill-down colapsável: auditoria de qualidade/fontes e contexto de
          campanha Meta — fora do fluxo de decisão, sem repetir a identidade. ── */}
      {dataQuality && unifiedProfile ? (
        <details className="cc6-panel-quiet group">
          <summary className={summaryClass}>
            <span className="cc6-eyebrow">Qualidade e fontes dos dados</span>
            <span className="cc6-num text-xs text-[#aab6ca]">
              {dataQuality.completeness}% · {dataQuality.completedFields}/
              {dataQuality.totalFields} campos
              <span
                aria-hidden="true"
                className="ml-2 inline-block text-[#6b7890] transition-transform group-open:rotate-180"
              >
                ▾
              </span>
            </span>
          </summary>
          <div className="cc6-hairline space-y-4 p-4 sm:p-5">
            <AtlasProgress
              value={dataQuality.completeness}
              label="Completude para personalização"
            />
            <div className="flex flex-wrap gap-2">
              {unifiedProfile.sources.map((source) => (
                <span key={source} className="cc6-chip uppercase">
                  {source}
                </span>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {([
                ["Conversas", unifiedProfile.conversations.length],
                ["Tarefas", unifiedProfile.tasks.length],
                ["Sinais de campanha", unifiedProfile.campaignEvents.length],
              ] as const).map(([label, value]) => (
                <div key={label} className="cc6-panel-quiet p-3 text-center">
                  <span className="cc6-metric-value text-lg">{value}</span>
                  <p className="cc6-metric-label mt-1">{label}</p>
                </div>
              ))}
            </div>
            {dataQuality.inconsistencies.length ? (
              <div
                className="cc6-sev-band pl-3"
                style={{ "--cc6-sev": "#fb7185" } as CSSProperties}
              >
                <p className="cc6-eyebrow cc6-crit text-[10px]">
                  Revisão humana necessária
                </p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-[#aab6ca]">
                  {dataQuality.inconsistencies.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-[11px] leading-5 text-[#6b7890]">
              Cadastros ambíguos nunca são fundidos sem revisão humana.
            </p>
          </div>
        </details>
      ) : null}

      {lead.source === "Meta Lead Ads" ? (
        <details className="cc6-panel-quiet group">
          <summary className={summaryClass}>
            <span className="cc6-eyebrow">
              Origem Meta · campanha e aprendizado
            </span>
            <span
              aria-hidden="true"
              className="text-[#6b7890] transition-transform group-open:rotate-180"
            >
              ▾
            </span>
          </summary>
          <div className="cc6-hairline p-4 sm:p-5">
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {[
                ["Origem", lead.metadata?.meta?.sourceName || "Meta Lead Ads"],
                [
                  "Campanha",
                  lead.metadata?.meta?.campaignId || "Não identificada",
                ],
                [
                  "Conjunto",
                  lead.metadata?.meta?.adsetId || "Não identificado",
                ],
                ["Anúncio", lead.metadata?.meta?.adId || "Não identificado"],
                [
                  "Aprendizado",
                  lead.metadata?.meta?.dataSharingConsent
                    ? "Autorizado"
                    : "Sem autorização",
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="cc6-eyebrow text-[10px]">{label}</dt>
                  <dd className="cc6-num mt-1.5 break-all text-sm text-[#e8eef8]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="cc6-hairline mt-4 pt-3 text-[11px] leading-5 text-[#6b7890]">
              O corretor só mantém estágio e acompanhamento atualizados; o CRM
              transforma essas ações em sinais estruturados. Textos livres e
              dados pessoais não aparecem nos relatórios de campanha.
            </p>
          </div>
        </details>
      ) : null}
    </div>
  );
}
