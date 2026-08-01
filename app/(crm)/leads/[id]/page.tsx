"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  CSSProperties,
  FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  AtlasEmpty,
  AtlasProgress,
  AtlasSkeleton,
} from "@/components/ui/AtlasUI";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { decidirProximaAcao } from "@/lib/crm/gesto-da-proxima-acao";
import { LeadOperationalBar } from "@/components/crm/lead-operational-bar";
import {
  LeadContextCorrection,
  type LeadContextProjectOption,
} from "@/components/crm/lead-context-correction";
import { CommercialContextTimelineEntry } from "@/components/crm/commercial-context-timeline-entry";
import {
  FirstContactQuickLog,
  type FirstContactRegistration,
  type FirstContactResult,
  type FirstContactSla,
} from "@/components/crm/first-contact-quick-log";
import { CopilotContextAction } from "@/components/atlas/copilot-context-action";
import { parseCommercialContextCorrectionTimeline } from "@/lib/atlas/commercial-context-timeline";
import { ContactAttemptsBadge } from "@/components/crm/contact-attempts-badge";
import { CompatibilidadeDoClientePanel } from "@/components/atlas/CompatibilidadeDoClientePanel";

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
type OpportunityRow = {
  id: string;
  stage: string;
  value: number | null;
  probability: number;
  expected_close_at: string | null;
  property_id: string | null;
  created_at: string;
};
// Fase 100 · Sinais de atenção proativos — etapa parada, follow-up vencido,
// lead quente sem contato recente ou objeção sem resposta.
// Ver lib/atlas/attention-signals.ts.
type AttentionSignalRow = {
  kind: "stale_stage" | "follow_up_overdue" | "high_score_no_contact" | "objection_open" | "never_contacted";
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
  opportunities: OpportunityRow[];
  opportunitiesMensuraveis?: boolean;
  attentionSignals: AttentionSignalRow[];
  proposals: ProposalRow[];
  dataQuality: DataQuality;
  unifiedProfile: UnifiedProfile;
  contactBriefing: ContactBriefing;
  relationshipContext: RelationshipContext;
  assignmentReservation: AssignmentReservation | null;
  projectOptions: LeadContextProjectOption[];
  firstContactSla?: FirstContactSla;
  proposalsMensuraveis?: boolean;
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
  "w-full rounded-xl border border-[rgba(148,163,184,0.16)] bg-[rgba(15,24,48,0.55)] px-4 py-3 text-sm text-[var(--atlas-texto-forte)] outline-none transition placeholder:text-[var(--atlas-texto-fraco)] focus:border-[color:var(--atlas-accent)] focus:bg-[rgba(75,141,248,0.05)]";
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--atlas-accent)]";
const chipButtonClass = `cc6-chip cursor-pointer transition-colors hover:border-[color:var(--atlas-accent)] hover:text-[var(--atlas-texto-forte)] disabled:cursor-default disabled:opacity-50 ${focusRing}`;
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

/**
 * O rótulo de cada tipo de interação, na mesma ordem e com as mesmas palavras
 * do seletor da tela. Fica AQUI, e não embutido no `addActivity`, para que
 * mudar "Ligação" em um lugar não deixe o outro para trás — foi assim que este
 * produto já criou duas verdades para o mesmo fato mais de uma vez.
 */
const TITULO_PADRAO_POR_TIPO: Record<string, string> = {
  note: "Nota",
  call: "Ligação",
  whatsapp: "WhatsApp",
  visit: "Visita",
};

export default function LeadDetailPage() {
  const { id: leadId } = useParams<{ id: string }>();
  const router = useRouter();
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [firstContactSla, setFirstContactSla] = useState<FirstContactSla | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [opportunitiesMensuraveis, setOpportunitiesMensuraveis] = useState(true);
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
    if (!response.ok) {
      // Duas famílias de erro convivem aqui: `{ error: "texto" }` das rotas
      // antigas e `{ error: { code, message } }` do envelope novo. Sem esta
      // distinção o corretor lia "[object Object]" na tela.
      const detalhe = typeof body.error === "string" ? body.error : body.error?.message;
      throw new Error(detalhe || "Falha na operação.");
    }
    return body;
  }

  // Registro de primeiro contato: uma chamada, sem formulário. Devolve a
  // medição para a barra mostrar na hora e recarrega a ficha em segundo plano,
  // para a linha do tempo e o prazo virem do banco, não de um palpite da tela.
  async function registrarPrimeiroContato(
    input: FirstContactRegistration,
  ): Promise<FirstContactResult> {
    const resposta = await api(`/api/v1/leads/${leadId}/first-contact`, {
      method: "POST",
      body: JSON.stringify(input),
    });
    const dados = (resposta?.data ?? resposta) as FirstContactResult;
    void load();
    return {
      primeiroContato: Boolean(dados?.primeiroContato),
      medicao: dados?.medicao ?? null,
      aviso: dados?.aviso ?? null,
    };
  }

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const data = (await api(`/api/v1/leads/${leadId}`)) as Payload;
      setLead(data.lead);
      setActivities(data.activities);
      setOpportunities(data.opportunities ?? []);
      setOpportunitiesMensuraveis(data.opportunitiesMensuraveis !== false);
      setAttentionSignals(data.attentionSignals ?? []);
      setProposals(data.proposals ?? []);
      setDataQuality(data.dataQuality);
      setUnifiedProfile(data.unifiedProfile);
      setContactBriefing(data.contactBriefing);
      setRelationshipContext(data.relationshipContext);
      setAssignmentReservation(data.assignmentReservation);
      setProjectOptions(data.projectOptions ?? []);
      setFirstContactSla(data.firstContactSla ?? null);
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

  const intelligence = useMemo(() => {
    if (!lead)
      return {
        readiness: 0,
        // Enquanto carrega não há gesto: oferecer um seria agir sobre fato que
        // ainda não se conhece. O botão de recarregar é o único honesto aqui.
        proximaAcao: decidirProximaAcao({ atividades: 1, oportunidadesLegiveis: false, oportunidades: 0 }),
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
    // "Não deu para ler" não é "não existe". Enquanto a rota devolvia `[]` fixo,
    // este ramo classificava TODA lead como risco médio e o "baixo" era
    // inalcançável — a tela dizia risco médio do melhor cliente da casa.
    const risk =
      activities.length === 0
        ? "alto"
        : !opportunitiesMensuraveis
          ? "unknown"
          : opportunities.length === 0
            ? "médio"
            : "baixo";
    /**
     * A decisão saiu daqui e foi para `lib/crm/gesto-da-proxima-acao`, com 12
     * contratos e 5 mutações. Não é organização por gosto: enquanto a regra
     * vivia num ternário dentro do JSX, ela não podia ser testada nem devolver
     * o GESTO junto com a frase — e era exatamente o gesto que faltava.
     */
    const proximaAcao = decidirProximaAcao({
      atividades: activities.length,
      oportunidadesLegiveis: opportunitiesMensuraveis,
      oportunidades: opportunities.length,
    });
    return { readiness, proximaAcao, risk };
  }, [activities.length, lead, opportunities.length, opportunitiesMensuraveis]);

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
      /**
       * ── O LEMBRETE SAI DA TELA E VOLTA NA HORA CERTA ───────────────────
       *
       * A instrução do "Faça agora" ocupava 190px no topo o tempo todo — e o
       * corretor a lia uma vez, no segundo em que abriu a ficha, e depois
       * convivia com ela atrapalhando a visão.
       *
       * Salvar é o momento em que ele levanta a cabeça do formulário. É aí que
       * lembrar do passo seguinte custa nada e serve para alguma coisa.
       *
       * Só lembra do que ainda NÃO foi feito: se ele acabou de registrar a
       * primeira conversa, cobrar "faça o primeiro contato" seria o produto não
       * prestando atenção no que a pessoa acabou de fazer.
       */
      const passo = intelligence.proximaAcao;
      setMessage(
        passo.urgente
          ? `Alterações salvas. Lembrete: ${passo.instrucao}`
          : "Lead atualizado e registrado na timeline.",
      );
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
    const descricao = activityDescription.trim();
    const digitado = activityTitle.trim();

    /**
     * ── RECUSAR EM SILÊNCIO ERA O DEFEITO ──────────────────────────────────
     *
     * Antes: `if (!title) return;` — sem mensagem, sem erro, sem nada. O
     * corretor escrevia no campo grande "O que o cliente falou?", clicava em
     * salvar e a tela não reagia. Da cadeira dele, "não está salvando" era a
     * leitura CORRETA do que via.
     *
     * E o título era exigência sem razão: o tipo da interação (Nota, Ligação,
     * WhatsApp, Visita) já está escolhido no seletor ao lado. Pedir que a
     * pessoa escreva "Ligação" num campo tendo marcado "Ligação" no outro é
     * cobrar informação que o produto já tem.
     *
     * Agora: o título vem do tipo quando não foi digitado, e a única recusa
     * possível — nada preenchido em lugar nenhum — é dita em voz alta.
     */
    if (!digitado && !descricao) {
      setMessage("Escreva o que aconteceu no contato antes de registrar.");
      return;
    }
    const title = digitado || TITULO_PADRAO_POR_TIPO[activityType] || "Interação registrada";
    try {
      await api(`/api/v1/leads/${leadId}`, {
        method: "POST",
        body: JSON.stringify({
          action: "activity",
          title,
          description: descricao,
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
      // `window.location.assign` recarregava o documento inteiro. Como página
      // isolada isso só era lento; com a ficha aberta em lâmina sobre a lista,
      // derruba tudo o que a lâmina existe para preservar — filtros, seleção,
      // posição de rolagem e o cache da lista. `router.push` navega dentro do
      // app e mantém a lista viva atrás.
      router.push(
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
    <div className="flex flex-col gap-5 pb-10" data-phase="26-lead-360">
      {/* ── Cartão de identidade: único lugar da página com nome, status,
          temperatura, score, contatos e dono. Nenhuma seção abaixo repete. ── */}
      {/* ── `order` VAI NO FILHO DIRETO DO FLEX, NÃO NO COMPONENTE DE DENTRO ──
            MEDIDO na produção af16f978: o cabeçalho ficou em 2.621px, no fim da
            ficha. Eu tinha posto `order-[-4]` no <TiltShell>, que é elemento
            INTERNO — este <section> é que o container flex enxerga, e ele não
            tinha ordem nenhuma: caiu para 0.

            E acusei o TiltShell de não repassar `className`. Ele repassa. O erro
            era meu, uma camada acima — a classe chegou ao DOM, no elemento
            errado. Conferir que a classe existe no componente não prova que ela
            está no elemento que manda. */}
        <section id="lead-overview" className="order-[-4] scroll-mt-28 [perspective:1400px]">
        {/* ── CONSENTIMENTO E TENTATIVAS: NO FLUXO, NÃO NO TOPO GRUDENTO ───
            Saiu da barra sticky, onde ocupava 63px colados no alto da tela em
            toda lead sem resposta. Fica em `order-[-2]`, junto do "o que
            perguntar" — que é exatamente quando o corretor descobre a resposta:
            durante a conversa, não antes dela. */}
        {/* ── A PERGUNTA DE CONSENTIMENTO SAIU DA FICHA ────────────────────
            Decisão do dono do produto, e ela está correta: a lead que vem de um
            formulário da Meta JÁ traz consentimento — o formulário mostra a
            política e o envio é voluntário. Pedir de novo era pedir ao corretor
            que atestasse algo que ele não presenciou.

            O produto já sabia disso: `consentimentoDaFonte()` marca `concedido`
            com origem `formulario_meta` na ingestão, quando a fonte tem a
            cláusula. A pergunta só aparecia para quem NÃO veio de lá — como a
            lead que usei no teste, importada de `relatiro arvo.xlsx`.

            O QUE ISSO MUDA, medido: lead de origem Meta continua enviável (já
            nasce `concedido`). Lead de outra origem fica `nao_perguntado`, e
            `faltaParaEnviar()` a mantém FORA da CAPI — que é o comportamento
            conservador certo: sem anúncio, não houve base para o envio.

            A rota `/api/v1/crm/leads/meta-consent` FICA. Ela deixa de ser o
            caminho do dia a dia e passa a ser o de correção — o único jeito de
            registrar ou desfazer um consentimento fora do fluxo automático. */}
        {/* ── A ORDEM DA FICHA SEGUE O QUE O CORRETOR FAZ, NÃO O ORGANOGRAMA
            DO PRODUTO ────────────────────────────────────────────────────────

            Ele abre esta tela para FALAR com alguém. A sequência é a da ligação:

              -4  quem é      identidade, etapa, score
              -3  o que fazer o gesto ("Ligar agora", "Ver imóveis")
              -2  o que PERGUNTAR   a qualificação guiada, com respostas de 1
                                    clique — é a IA trabalhando DURANTE a
                                    conversa, não um relatório depois dela
              -1  o que anotar      os dados do cliente
               0  o resto           análise de apoio, na ordem do DOM

            MEDIDO antes: a ficha tinha 3.443px (3,8 telas) e o nome do cliente
            começava em 2.931px. A primeira correção trouxe o formulário para
            438px — e DEIXOU O CABEÇALHO ÓRFÃO em 1.759px, no meio da ficha.
            Regressão minha, achada medindo a produção depois de publicar.

            `order` e não mover marcação: já quebrei o aninhamento uma vez
            tentando mover 143 linhas. Reverter isto é apagar uma classe. */}
        {/* ── O CABEÇALHO É DENSO POR DENTRO E FROUXO POR FORA ─────────────
            MEDIDO na produção: 325px para breadcrumb, nome, duas etiquetas,
            telefone, dono, score e um botão. Somado à barra operacional (302px),
            são 627px — 70% da primeira tela antes de qualquer conteúdo.
        
            E, ao contrário do que eu afirmei duas vezes, os dois NÃO dizem a
            mesma coisa: medida a sobreposição, são ZERO palavras em comum. O
            cabeçalho é identidade, dono e score; a barra é próximo passo e ações.
            Fundi-los juntaria coisas diferentes — o problema não é repetição, é
            respiro.
        
            Aqui só o respiro encolhe: padding e espaçamento entre linhas. Nenhuma
            informação sai da tela, nenhuma estrutura muda. */}
        <TiltShell maxDeg={2} className="cc6-reveal cc6-panel p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <Link
                  href="/leads"
                  className={`rounded-sm text-xs text-[var(--atlas-texto-fraco)] transition-colors hover:text-[var(--atlas-texto-medio)] ${focusRing}`}
                >
                  ← Leads
                </Link>
                <p className="cc6-eyebrow">Lead 360</p>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <h1 className="text-2xl font-semibold tracking-[-0.03em] text-[var(--atlas-texto-forte)] sm:text-[32px] sm:leading-10">
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
                          copiedContact === field ? "cc6-ok" : "text-[var(--atlas-texto-fraco)]"
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
              <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--atlas-texto-fraco)]">
                <span className="cc6-eyebrow text-[10px]">dono</span>
                <span className="text-[var(--atlas-texto-medio)]">
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
                <span className="cc6-num ml-1 text-sm text-[var(--atlas-texto-fraco)]">/100</span>
              </p>
              <p className="cc6-metric-label mt-2">
                prontidão{" "}
                <span className="cc6-num text-[var(--atlas-texto-medio)]">
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

      {/* ── TENTATIVAS DE CONTATO: NO FLUXO, JUNTO DO "O QUE PERGUNTAR" ──────
          Estava ANINHADA dentro de `#lead-overview`, e por isso `order-[-2]`
          não fazia nada: `order` só vale no FILHO DIRETO do flex. Medido: dar
          `display:flex` ao pai não movia a seção um pixel.

          É o mesmo erro que pôs o cabeçalho em 2.621px, duas camadas acima.
          Aqui ele custava mais do que posição: a moldura tem borda, fundo e
          12px 14px de padding, e `ContactAttemptsBadge` devolve `null` em três
          casos — inclusive no primeiro paint de TODA lead. O resultado era uma
          caixa decorada VAZIA acima do nome do cliente. A guarda `:empty` em
          globals.css fecha esse lado; sair daqui fecha o outro. ── */}
      <section className="order-[-2] atlas-lead-consentimento" aria-label="Tentativas de contato">
        <ContactAttemptsBadge leadId={String(lead.id)} />
      </section>

      {/* ── Grau primário de decisão: a barra operacional já concentra próxima
          ação, risco, tarefas, mensagens e atalhos — logo sob a identidade. ── */}
      <LeadOperationalBar
        leadId={lead.id}
        leadName={lead.name || "Lead sem nome"}
        phone={lead.phone}
        proximaAcao={intelligence.proximaAcao}
        risk={intelligence.risk}
        openTasks={contactBriefing?.openTasks ?? 0}
        unreadMessages={contactBriefing?.unreadMessages ?? 0}
        firstContactSlot={
          firstContactSla ? (
            <FirstContactQuickLog sla={firstContactSla} onRegister={registrarPrimeiroContato} />
          ) : null
        }
      />

      {message ? (
        <div
          role="status"
          className="cc6-panel-quiet border-[rgba(75,141,248,0.35)] p-4 text-sm leading-6 text-[var(--atlas-texto-medio)]"
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
            <h2 className="mt-2 text-base font-semibold text-[var(--atlas-texto-forte)]">
              Confirme que você assumirá este atendimento
            </h2>
            <p className="mt-1 text-xs leading-5 text-[var(--atlas-texto-fraco)]">
              Aceite até{" "}
              <span className="cc6-num text-[var(--atlas-texto-medio)]">
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

      {dataQuality?.questions.length ? (
        <section
          data-phase="30-data-gaps"
          className="order-[-2] cc6-reveal cc6-panel p-5 sm:p-6"
          style={{ animationDelay: "60ms" }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="cc6-eyebrow">Dados que faltam</p>
              <h2 className="mt-2 text-base font-semibold text-[var(--atlas-texto-forte)]">
                O que perguntar agora
              </h2>
            </div>
            <p className="cc6-num text-xs text-[var(--atlas-texto-fraco)]">
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
                <strong className="mt-3 block text-sm leading-6 text-[var(--atlas-texto-forte)]">
                  {question.question}
                </strong>
                <p className="mt-1 text-xs leading-5 text-[var(--atlas-texto-fraco)]">
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
          <p className="cc6-hairline mt-4 pt-3 text-[11px] leading-5 text-[var(--atlas-texto-fraco)]">
            Prioridade por impacto em contato, intenção, matching e
            continuidade — análise local, sem custo de IA. CPF, CNPJ, endereço
            exato e documentos não aumentam score nem são enviados às IAs.
          </p>
        </section>
      ) : dataQuality?.status === "complete" ? (
        <div
          data-phase="30-data-gaps"
          className="order-[-2] cc6-panel-quiet p-4 text-sm leading-6 text-[var(--atlas-texto-medio)]"
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
                value: opportunitiesMensuraveis
                  ? `${opportunities.length} oportunidades`
                  : "oportunidades não medidas",
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
                  className="mt-2 block truncate text-sm leading-5 text-[var(--atlas-texto-forte)]"
                  title={item.value}
                >
                  {item.value}
                </strong>
                <p className="mt-1.5 truncate text-[11px] leading-5 text-[var(--atlas-texto-fraco)]">
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
          className="order-[-2] cc6-reveal cc6-panel-quiet p-5 sm:p-6"
          style={{ animationDelay: "160ms" }}
        >
          <p className="cc6-eyebrow">Briefing antes do contato</p>
          <div className="mt-4 grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium text-[var(--atlas-texto-forte)]">
                Último contexto conhecido
              </h3>
              <p className="mt-2 max-w-prose text-[13.5px] leading-7 text-[var(--atlas-texto-medio)]">
                {contactBriefing.context}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-medium text-[var(--atlas-texto-forte)]">
                Roteiro recomendado
              </h3>
              <ol className="mt-2 space-y-2">
                {contactBriefing.actions.map((action, index) => (
                  <li
                    key={action}
                    className="flex gap-3 text-[13.5px] leading-7 text-[var(--atlas-texto-medio)]"
                  >
                    <span className="cc6-num shrink-0 text-xs leading-7 text-[var(--atlas-texto-fraco)]">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    {action}
                  </li>
                ))}
              </ol>
            </div>
          </div>
          <p className="cc6-hairline mt-4 pt-3 text-[11px] leading-5 text-[var(--atlas-texto-fraco)]">
            Preparado por {contactBriefing.generatedBy}. O corretor revisa e
            decide antes de qualquer envio ou alteração.
          </p>
        </section>
      ) : null}

      {/*
        COMPATIBILIDADE E AS PERGUNTAS QUE DESTRAVAM.

        Fica FORA do `qualification ?` de propósito: o painel importa mais quando
        a lead NÃO está qualificada, que é o caso de 469 das 482. Medido em
        2026-07-30 — só 13 leads responderam algum dos três critérios decisivos
        (preço 9 · dormitórios 12 · bairro 6), e a recomendação do motor é
        exatamente 13. Preencher catálogo não move esse número; foi tentado três
        vezes no mesmo dia. Perguntar move.

        O painel já existia pronto e não estava montado em tela nenhuma.
      */}
      {/* A âncora `#matching` vive AQUI agora. A barra operacional tem
          `<a href="#matching">Imóveis</a>`, e a seção "Matching Atlas" que a
          respondia foi removida: ela dizia "nenhum match encontrado — complete
          orçamento, dormitórios e regiões" sobre um `properties: []` cravado na
          rota, culpando o corretor por um defeito do servidor. Este painel é o
          matching de verdade — mesma pergunta, resposta medida. */}
      <div id="matching" className="scroll-mt-28">
        <CompatibilidadeDoClientePanel leadId={lead.id} />
      </div>

      {qualification ? (
        <section
          id="qualificacao"
          className="cc6-reveal cc6-panel scroll-mt-28 p-5 sm:p-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="cc6-eyebrow">Qualificação rápida</p>
              <h2 className="mt-2 text-base font-semibold text-[var(--atlas-texto-forte)]">
                Como o Atlas chegou a esta qualificação
              </h2>
              <p className="mt-1 text-xs leading-5 text-[var(--atlas-texto-fraco)]">
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
                    <strong className="text-sm text-[var(--atlas-texto-forte)]">
                      {dimension.label}
                    </strong>
                    <span className="cc6-num text-xs text-[var(--atlas-texto-medio)]">
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
                  <p className="mt-3 text-xs leading-5 text-[var(--atlas-texto-fraco)]">
                    {dimension.reasons.slice(0, 2).join(" · ") ||
                      "Ainda sem sinais suficientes"}
                  </p>
                </div>
              ))}
            </div>
            <div className="space-y-3">
              <div className="cc6-panel-quiet cc6-sev-band p-4 pl-5">
                <p className="cc6-eyebrow text-[10px]">Próxima melhor ação</p>
                <p className="mt-2 text-sm leading-6 text-[var(--atlas-texto-forte)]">
                  {qualification.nextBestAction}
                </p>
              </div>
              {qualification.risks.length ? (
                <div
                  className="cc6-panel-quiet cc6-sev-band p-4 pl-5"
                  style={{ "--cc6-sev": "#fb7185" } as CSSProperties}
                >
                  <p className="cc6-eyebrow cc6-crit text-[10px]">Riscos</p>
                  <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--atlas-texto-medio)]">
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
                  <p className="mt-2 text-xs leading-5 text-[var(--atlas-texto-medio)]">
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
                <span className="cc6-num text-xs text-[var(--atlas-texto-fraco)]">
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
                    <strong className="text-sm leading-6 text-[var(--atlas-texto-forte)]">
                      {question.question}
                    </strong>
                    <p className="mt-1 text-xs leading-5 text-[var(--atlas-texto-fraco)]">
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
              <p className="mt-4 text-[11px] leading-5 text-[var(--atlas-texto-fraco)]">
                Finalidade, prazo e pagamento recalibram score e próxima ação
                imediatamente. Para a Meta saem apenas categorias agregadas;
                conversa livre e dados pessoais permanecem no CRM.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {proposals.length ? (
        <section data-phase="37-proposal-sla" className="cc6-reveal cc6-panel p-5 sm:p-6">
          <p className="cc6-eyebrow">Fase 37 · SLA de proposta</p>
          <h2 className="mt-2 text-base font-semibold text-[var(--atlas-texto-forte)]">
            Preparação, envio e retorno
          </h2>
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {proposals.map((proposal) => (
              <article key={proposal.id} className="cc6-panel-quiet p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block truncate text-sm text-[var(--atlas-texto-forte)]">
                      {proposal.rule_snapshot?.propertyTitle ||
                        "Proposta comercial"}
                    </strong>
                    <p className="cc6-num mt-1 text-xs text-[var(--atlas-texto-fraco)]">
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
                      <dd className="cc6-num mt-1 text-sm text-[var(--atlas-texto-forte)]">
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
          <p className="cc6-hairline mt-4 pt-3 text-[11px] leading-5 text-[var(--atlas-texto-fraco)]">
            Preço, estoque e regra continuam governados; o contato com o
            cliente também fica mensurado.
          </p>
        </section>
      ) : null}

      <section
        /* ── QUEM É ESTA PESSOA VEM PRIMEIRO ──────────────────────────────
           MEDIDO na produção, viewport de 900px: o campo Nome começava em
           2.931px — mais de TRÊS telas de rolagem até o nome de quem se está
           atendendo, porque oito blocos de análise vinham antes.

           Nenhum deles é inútil. O erro era de ORDEM: análise SOBRE a pessoa
           apresentada antes da pessoa. O corretor abre a ficha para falar com
           alguém, não para ler um relatório sobre alguém.

           `order` em vez de mover o JSX: a mudança é de APRESENTAÇÃO, e mover
           140 linhas de marcação para trocar posição arrisca quebrar aninhamento
           por ganho nenhum. Reverter é apagar uma classe. */
        className="order-[-1] cc6-reveal grid gap-4 2xl:grid-cols-[1.15fr_.85fr]"
        style={{ animationDelay: "210ms" }}
      >
        <section className="cc6-panel p-5 sm:p-6">
          <p className="cc6-eyebrow">Perfil do comprador</p>
          <h2 className="mt-2 text-base font-semibold text-[var(--atlas-texto-forte)]">
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
            <p className="mt-3 text-[11px] leading-5 text-[var(--atlas-texto-fraco)]">
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
            <h2 className="mt-2 text-base font-semibold text-[var(--atlas-texto-forte)]">
              Acompanhamento do contato
            </h2>
            <form onSubmit={addActivity} className="mt-4 space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                <input
                  className={inputClass}
                  value={activityTitle}
                  onChange={(e) => setActivityTitle(e.target.value)}
                  placeholder="Título (opcional — usamos o tipo se ficar vazio)"
                  aria-label="Título da interação (opcional)"
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
              <p className="text-[11px] leading-5 text-[var(--atlas-texto-fraco)]">
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
                <h2 className="mt-2 text-base font-semibold text-[var(--atlas-texto-forte)]">
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
                          <p className="text-sm font-medium leading-6 text-[var(--atlas-texto-forte)]">
                            {activity.title}
                          </p>
                          <span className="cc6-chip shrink-0">
                            {activity.type}
                          </span>
                        </div>
                        {!contextCorrection && activity.description ? (
                          <p className="mt-1.5 text-[13px] leading-6 text-[var(--atlas-texto-medio)]">
                            {activity.description}
                          </p>
                        ) : null}
                        {contextCorrection ? (
                          <CommercialContextTimelineEntry
                            correction={contextCorrection}
                          />
                        ) : null}
                        <p className="cc6-num mt-3 text-[10px] uppercase tracking-wider text-[var(--atlas-texto-fraco)]">
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

      {/* ── Drill-down colapsável: auditoria de qualidade/fontes e contexto de
          campanha Meta — fora do fluxo de decisão, sem repetir a identidade. ── */}
      {dataQuality && unifiedProfile ? (
        <details className="cc6-panel-quiet group">
          <summary className={summaryClass}>
            <span className="cc6-eyebrow">Qualidade e fontes dos dados</span>
            <span className="cc6-num text-xs text-[var(--atlas-texto-medio)]">
              {dataQuality.completeness}% · {dataQuality.completedFields}/
              {dataQuality.totalFields} campos
              <span
                aria-hidden="true"
                className="ml-2 inline-block text-[var(--atlas-texto-fraco)] transition-transform group-open:rotate-180"
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
                <ul className="mt-2 space-y-1 text-xs leading-5 text-[var(--atlas-texto-medio)]">
                  {dataQuality.inconsistencies.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <p className="text-[11px] leading-5 text-[var(--atlas-texto-fraco)]">
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
              className="text-[var(--atlas-texto-fraco)] transition-transform group-open:rotate-180"
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
                  <dd className="cc6-num mt-1.5 break-all text-sm text-[var(--atlas-texto-forte)]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="cc6-hairline mt-4 pt-3 text-[11px] leading-5 text-[var(--atlas-texto-fraco)]">
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
