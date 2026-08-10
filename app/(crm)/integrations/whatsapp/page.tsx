"use client";
import { useEffect, useState } from "react";
import { AtlasBadge, AtlasSkeleton } from "@/components/ui/AtlasUI";
import {
  AtlasCard,
  AtlasCardHeader,
  AtlasMetric,
} from "@/components/ui/AtlasCard";
import { WhatsAppMemoryDirectorDecisionPanel } from "@/components/integrations/WhatsAppMemoryDirectorDecisionPanel";
import { buildWhatsAppMemoryDirectorDecisionContract } from "@/lib/analytics/whatsapp-memory-director-decision-contract";
import { buildWhatsAppMemoryDirectorDecisionPersistence } from "@/lib/analytics/whatsapp-memory-director-decision-persistence";
import { buildWhatsAppMemoryHumanReview } from "@/lib/analytics/whatsapp-memory-human-review";
import { buildWhatsAppMemoryReleaseGate } from "@/lib/analytics/whatsapp-memory-release-gate";
import { supabase } from "@/lib/supabase";

type BrokerProfile = { id: string; name: string; role: string };
type BrokerLine = {
  id: string;
  name: string;
  phoneNumberIdMasked: string;
  displayPhone?: string | null;
  brokerProfileId?: string | null;
  brokerName?: string | null;
  status: string;
  recordConversations: boolean;
  isDefault: boolean;
  requestedAt?: string | null;
  updatedAt?: string;
};
type Status = {
  connected: boolean;
  reason?: string;
  phone?: {
    idMasked?: string;
    displayNumber?: string;
    verifiedName?: string;
    qualityRating?: string;
    messagingLimitTier?: string;
    throughput?: { level?: string } | string;
    verificationStatus?: string;
    platformType?: string;
  };
  homologation?: {
    status: "passed" | "incomplete";
    graphConfirmed: boolean;
    numberConfirmed: boolean;
    qualityConfirmed: boolean;
    limitConfirmed: boolean;
    readOnly: boolean;
  };
  templates?: Array<{
    id: string;
    name: string;
    language: string;
    category: string;
  }>;
  templateTests?: Array<{
    id: string;
    status: string;
    sent_at?: string;
    delivered_at?: string;
    read_at?: string;
    error?: string;
    created_at: string;
  }>;
  brokerProfiles?: BrokerProfile[];
  brokerLines?: BrokerLine[];
  testRecipientMasked?: string | null;
  checkedAt?: string;
};
type MemoryBaseline = {
  lines: {
    registered: number;
    connected: number;
    pendingApproval: number;
    disconnected: number;
    recordingEnabled: number;
  };
  conversations: {
    total: number;
    linkedToLead: number;
    unlinkedToLead: number;
    assigned: number;
    unassigned: number;
    leadLinkRate: number;
  };
  messages: {
    total: number;
    inbound: number;
    outbound: number;
    delivered: number;
    read: number;
    failed: number;
    externallyConfirmed: number;
    latestInboundAt: string | null;
    latestOutboundAt: string | null;
    latestExternalEvidenceAt: string | null;
  };
  connection: {
    state: "proven" | "configured_unproven" | "not_configured";
    configured: boolean;
    trafficProven: boolean;
    explanation: string;
  };
  learning: {
    linkedConversations: number;
    coveragePercent: number;
    readyForLearning: boolean;
  };
  measuredAt: string;
  limitations: string[];
};
type ConversationContinuity = {
  source: {
    total: number;
    observed: number;
    observedLimit: number;
    truncated: boolean;
  };
  ownership: {
    linked: number;
    unlinked: number;
    ownershipComparable: number;
    alignedOwner: number;
    ownerMismatch: number;
    conversationOwnerMissing: number;
    leadOwnerMissing: number;
    bothUnassigned: number;
    missingLeadRecord: number;
    alignmentRate: number;
  };
  continuity: {
    recentDays: number;
    staleDays: number;
    activeWithinRecentWindow: number;
    withoutRecentActivity: number;
    stale: number;
    noActivityDate: number;
    unread: number;
    open: number;
  };
  fragmentation: {
    uniqueLinkedLeads: number;
    leadsWithMultipleConversations: number;
    extraConversations: number;
  };
  measuredAt: string;
  limitations: string[];
};
type LearningCaptureQuality = {
  source: {
    total: number;
    observed: number;
    observedLimit: number;
    truncated: boolean;
  };
  capture: {
    total: number;
    inbound: number;
    outbound: number;
    validDirection: number;
    timestamped: number;
    linkedConversation: number;
    linkedLead: number;
    structurallyUsable: number;
    structuralCoveragePercent: number;
  };
  traceability: { externallyTraceable: number; coveragePercent: number };
  canonicalMemory: {
    behaviorEvents: number;
    coveredMessages: number;
    coveragePercent: number;
    structuredLearningReady: boolean;
  };
  recording: {
    registeredLines: number;
    recordingConfiguredLines: number;
    configurationCoveragePercent: number;
    provesAiLearningAuthorization: false;
  };
  authorization: {
    status: "not_proven";
    explicitAiLearningEvidence: false;
    rawContentLearningAuthorized: false;
  };
  learning: {
    mode: "structured_only";
    metadataReady: boolean;
    structuredLearningReady: boolean;
    rawContentLearningReady: false;
  };
  gaps: {
    invalidDirection: number;
    missingTimestamp: number;
    missingConversation: number;
    missingLeadLink: number;
    missingCanonicalEvent: number;
  };
  measuredAt: string;
  limitations: string[];
};
type CommercialContextReadiness = {
  source: {
    total: number;
    observed: number;
    observedLimit: number;
    truncated: boolean;
  };
  context: {
    total: number;
    projectLinked: number;
    stageValid: number;
    responsibleLinked: number;
    nextActionValid: number;
    complete: number;
    completenessPercent: number;
    projectCoveragePercent: number;
    stageCoveragePercent: number;
    responsibleCoveragePercent: number;
    nextActionCoveragePercent: number;
  };
  activity: {
    totalInteractions: number;
    interacted: number;
    nonExpired: number;
    activeCoveragePercent: number;
  };
  gaps: {
    missingProject: number;
    invalidStage: number;
    missingResponsible: number;
    invalidNextAction: number;
  };
  readiness: {
    decisionSupportReady: boolean;
    rawContentUsed: false;
    requiresHumanReview: true;
  };
  inferenceMode: "evidence_only";
  measuredAt: string;
  limitations: string[];
};

export default function WhatsAppIntegration() {
  const [data, setData] = useState<Status | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [sending, setSending] = useState(false);
  const [savingLine, setSavingLine] = useState(false);
  const [notice, setNotice] = useState("");
  const [brokerProfileId, setBrokerProfileId] = useState("");
  const [brokerPhoneNumberId, setBrokerPhoneNumberId] = useState("");
  const [brokerDisplayPhone, setBrokerDisplayPhone] = useState("");
  const [baseline, setBaseline] = useState<MemoryBaseline | null>(null);
  const [baselineLoading, setBaselineLoading] = useState(true);
  const [baselineError, setBaselineError] = useState("");
  const [continuity, setContinuity] = useState<ConversationContinuity | null>(
    null,
  );
  const [continuityLoading, setContinuityLoading] = useState(true);
  const [continuityError, setContinuityError] = useState("");
  const [captureQuality, setCaptureQuality] =
    useState<LearningCaptureQuality | null>(null);
  const [captureQualityLoading, setCaptureQualityLoading] = useState(true);
  const [captureQualityError, setCaptureQualityError] = useState("");
  const [contextReadiness, setContextReadiness] =
    useState<CommercialContextReadiness | null>(null);
  const [contextReadinessLoading, setContextReadinessLoading] = useState(true);
  const [contextReadinessError, setContextReadinessError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const token =
        (await supabase.auth.getSession()).data.session?.access_token || "";
      const response = await fetch("/api/v1/integrations/whatsapp", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message || "Diagnóstico indisponível.");
      setData(body.data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Diagnóstico indisponível.",
      );
    } finally {
      setLoading(false);
    }
  }
  async function loadBaseline() {
    setBaselineLoading(true);
    setBaselineError("");
    try {
      const token =
        (await supabase.auth.getSession()).data.session?.access_token || "";
      const response = await fetch(
        "/api/v1/integrations/whatsapp/memory-baseline",
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message || "Medição da memória indisponível.",
        );
      setBaseline(body.data);
    } catch (cause) {
      setBaselineError(
        cause instanceof Error
          ? cause.message
          : "Medição da memória indisponível.",
      );
    } finally {
      setBaselineLoading(false);
    }
  }
  async function loadContinuity() {
    setContinuityLoading(true);
    setContinuityError("");
    try {
      const token =
        (await supabase.auth.getSession()).data.session?.access_token || "";
      const response = await fetch("/api/v1/integrations/whatsapp/continuity", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message || "Medição de continuidade indisponível.",
        );
      setContinuity(body.data);
    } catch (cause) {
      setContinuityError(
        cause instanceof Error
          ? cause.message
          : "Medição de continuidade indisponível.",
      );
    } finally {
      setContinuityLoading(false);
    }
  }
  async function loadCaptureQuality() {
    setCaptureQualityLoading(true);
    setCaptureQualityError("");
    try {
      const token =
        (await supabase.auth.getSession()).data.session?.access_token || "";
      const response = await fetch(
        "/api/v1/integrations/whatsapp/learning-capture-quality",
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message || "Medição da captura indisponível.",
        );
      setCaptureQuality(body.data);
    } catch (cause) {
      setCaptureQualityError(
        cause instanceof Error
          ? cause.message
          : "Medição da captura indisponível.",
      );
    } finally {
      setCaptureQualityLoading(false);
    }
  }
  async function loadContextReadiness() {
    setContextReadinessLoading(true);
    setContextReadinessError("");
    try {
      const token =
        (await supabase.auth.getSession()).data.session?.access_token || "";
      const response = await fetch(
        "/api/v1/integrations/whatsapp/commercial-context-readiness",
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message || "Medição do contexto comercial indisponível.",
        );
      setContextReadiness(body.data);
    } catch (cause) {
      setContextReadinessError(
        cause instanceof Error
          ? cause.message
          : "Medição do contexto comercial indisponível.",
      );
    } finally {
      setContextReadinessLoading(false);
    }
  }
  useEffect(() => {
    void load();
    void loadBaseline();
    void loadContinuity();
    void loadCaptureQuality();
    void loadContextReadiness();
  }, []);
  async function sendTemplateTest() {
    setSending(true);
    setError("");
    setNotice("");
    try {
      const token =
        (await supabase.auth.getSession()).data.session?.access_token || "";
      const response = await fetch("/api/v1/integrations/whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "whatsapp-template-test", templateId }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message || "Ensaio de template falhou.");
      setNotice(
        `${body.data.next} Protocolo ${body.data.externalMessageIdMasked}.`,
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Ensaio de template falhou.",
      );
    } finally {
      setSending(false);
    }
  }
  async function saveBrokerLine() {
    setSavingLine(true);
    setError("");
    setNotice("");
    try {
      const token =
        (await supabase.auth.getSession()).data.session?.access_token || "";
      const response = await fetch("/api/v1/integrations/whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "save_broker_line",
          brokerProfileId,
          phoneNumberId: brokerPhoneNumberId,
          displayPhone: brokerDisplayPhone,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message || "Não foi possível vincular a linha.",
        );
      setNotice(
        "Linha oficial validada e vinculada. Novas conversas desta linha serão gravadas no CRM e associadas ao responsável.",
      );
      setBrokerPhoneNumberId("");
      setBrokerDisplayPhone("");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível vincular a linha.",
      );
    } finally {
      setSavingLine(false);
    }
  }
  async function disconnectBrokerLine(profileId: string) {
    setSavingLine(true);
    setError("");
    setNotice("");
    try {
      const token =
        (await supabase.auth.getSession()).data.session?.access_token || "";
      const response = await fetch("/api/v1/integrations/whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "disconnect_broker_line",
          brokerProfileId: profileId,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message || "Não foi possível desconectar a linha.",
        );
      setNotice(
        "Linha oficial desconectada. Nenhuma nova mensagem será enviada por ela.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível desconectar a linha.",
      );
    } finally {
      setSavingLine(false);
    }
  }
  async function approveBrokerLine(profileId: string) {
    setSavingLine(true);
    setError("");
    setNotice("");
    try {
      const token =
        (await supabase.auth.getSession()).data.session?.access_token || "";
      const response = await fetch("/api/v1/integrations/whatsapp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action: "approve_broker_line",
          brokerProfileId: profileId,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error?.message || "Não foi possível aprovar a linha.",
        );
      setNotice(
        "Linha oficial aprovada e validada na Meta. As novas conversas passarão a ser registradas no CRM.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível aprovar a linha.",
      );
    } finally {
      setSavingLine(false);
    }
  }
  const quality = String(data?.phone?.qualityRating || "UNKNOWN").toUpperCase();
  const passed = data?.homologation?.status === "passed";
  const pendingLines =
    data?.brokerLines?.filter((line) => line.status === "pending_approval") ||
    [];
  const memoryReleaseGate =
    continuity && captureQuality && contextReadiness
      ? buildWhatsAppMemoryReleaseGate({
          continuity,
          capture: captureQuality,
          context: contextReadiness,
        })
      : null;
  const memoryHumanReview = memoryReleaseGate
    ? buildWhatsAppMemoryHumanReview(memoryReleaseGate)
    : null;
  const memoryDirectorDecisionContract = memoryHumanReview
    ? buildWhatsAppMemoryDirectorDecisionContract(memoryHumanReview)
    : null;
  const memoryDirectorDecisionPersistence = memoryDirectorDecisionContract
    ? buildWhatsAppMemoryDirectorDecisionPersistence(
        memoryDirectorDecisionContract,
      )
    : null;
  return (
    <div className="space-y-6 pb-10">
      <section className="atlas-grid-glow rounded-[30px] border border-emerald-400/10 bg-gradient-to-br from-emerald-500/[.11] via-cyan-500/[.06] to-blue-500/[.08] p-6 sm:p-8">
        <div className="flex flex-wrap gap-2">
          <AtlasBadge tone={data?.connected ? "success" : "danger"}>
            {data?.connected
              ? "API OFICIAL CONECTADA"
              : "CONFIGURAÇÃO PENDENTE"}
          </AtlasBadge>
          <AtlasBadge
            tone={
              quality === "GREEN"
                ? "success"
                : quality === "YELLOW"
                  ? "warning"
                  : "danger"
            }
          >
            QUALIDADE {quality}
          </AtlasBadge>
          <AtlasBadge tone={passed ? "success" : "warning"}>
            FASE 27 · {passed ? "COMPROVADA" : "PENDENTE"}
          </AtlasBadge>
        </div>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">
          Saúde do{" "}
          <span className="atlas-gradient-text">WhatsApp Business.</span>
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">
          Leitura direta da Graph API para confirmar número, nome, qualidade,
          limite e capacidade da conta — sem alterar configurações ou revelar
          credenciais.
        </p>
        <button
          disabled={
            loading ||
            baselineLoading ||
            continuityLoading ||
            captureQualityLoading ||
            contextReadinessLoading
          }
          onClick={() => {
            void load();
            void loadBaseline();
            void loadContinuity();
            void loadCaptureQuality();
            void loadContextReadiness();
          }}
          className="atlas-button-primary mt-6 disabled:opacity-40"
        >
          {loading ||
          baselineLoading ||
          continuityLoading ||
          captureQualityLoading ||
          contextReadinessLoading
            ? "Atualizando evidências..."
            : "Atualizar diagnóstico completo"}
        </button>
      </section>
      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}
      <section data-phase="365-whatsapp-memory-baseline">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fase 365 · Memória factual"
            title="Memória comercial do WhatsApp"
            description="Contagens reais registradas no CRM desta organização. Linha cadastrada, tráfego comprovado e conversa vinculada à lead são evidências diferentes."
          />
          <div className="space-y-4 p-5 sm:p-6">
            {baselineLoading ? (
              <AtlasSkeleton className="h-32 w-full" />
            ) : baselineError ? (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-sm text-amber-100">
                {baselineError}
              </div>
            ) : baseline ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                  <div>
                    <p className="text-sm font-medium text-white">
                      Evidência de conexão
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      {baseline.connection.explanation}
                    </p>
                  </div>
                  <AtlasBadge
                    tone={
                      baseline.connection.state === "proven"
                        ? "success"
                        : baseline.connection.state === "configured_unproven"
                          ? "warning"
                          : "danger"
                    }
                  >
                    {baseline.connection.state === "proven"
                      ? "TRÁFEGO COMPROVADO"
                      : baseline.connection.state === "configured_unproven"
                        ? "CONFIGURADO · SEM TRÁFEGO COMPROVADO"
                        : "NÃO CONFIGURADO"}
                  </AtlasBadge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <AtlasMetric
                    label="Linhas oficiais"
                    value={`${baseline.lines.connected}/${baseline.lines.registered}`}
                    detail={`${baseline.lines.pendingApproval} aguardando aprovação · ${baseline.lines.recordingEnabled} com registro habilitado`}
                    trend="LINHAS"
                    tone={baseline.lines.connected ? "green" : "amber"}
                  />
                  <AtlasMetric
                    label="Conversas"
                    value={String(baseline.conversations.total)}
                    detail={`${baseline.conversations.assigned} atribuídas · ${baseline.conversations.unassigned} sem responsável`}
                    trend="CRM"
                    tone="blue"
                  />
                  <AtlasMetric
                    label="Vínculo com leads"
                    value={`${baseline.conversations.leadLinkRate}%`}
                    detail={`${baseline.conversations.linkedToLead} vinculadas · ${baseline.conversations.unlinkedToLead} sem correspondência`}
                    trend="MEMÓRIA"
                    tone={
                      baseline.learning.readyForLearning ? "green" : "amber"
                    }
                  />
                  <AtlasMetric
                    label="Mensagens"
                    value={String(baseline.messages.total)}
                    detail={`${baseline.messages.inbound} recebidas · ${baseline.messages.outbound} enviadas · ${baseline.messages.failed} falhas`}
                    trend="TRÁFEGO"
                    tone="violet"
                  />
                </div>
                {baseline.conversations.unlinkedToLead ||
                baseline.conversations.unassigned ? (
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-xs leading-6 text-amber-100">
                    Atenção: {baseline.conversations.unlinkedToLead} conversas
                    ainda não estão vinculadas a uma lead e{" "}
                    {baseline.conversations.unassigned} não possuem responsável.
                    Esses itens não entram como memória pronta para aprendizado.
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] leading-5 text-slate-500">
                  <span>
                    Última evidência externa:{" "}
                    {baseline.messages.latestExternalEvidenceAt
                      ? new Date(
                          baseline.messages.latestExternalEvidenceAt,
                        ).toLocaleString("pt-BR")
                      : "ainda não registrada"}
                  </span>
                  <span>
                    Medição:{" "}
                    {new Date(baseline.measuredAt).toLocaleString("pt-BR")} ·
                    sem telefones ou conteúdo
                  </span>
                </div>
              </>
            ) : null}
          </div>
        </AtlasCard>
      </section>
      <section data-phase="366-whatsapp-conversation-continuity">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fase 366 · Continuidade"
            title="Titularidade e continuidade das conversas"
            description="Compara a responsabilidade registrada na conversa com a carteira da lead e mede atividade sem abrir nomes, telefones ou mensagens."
          />
          <div className="space-y-4 p-5 sm:p-6">
            {continuityLoading ? (
              <AtlasSkeleton className="h-32 w-full" />
            ) : continuityError ? (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-sm text-amber-100">
                {continuityError}
              </div>
            ) : continuity ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <AtlasMetric
                    label="Titularidade alinhada"
                    value={`${continuity.ownership.alignmentRate}%`}
                    detail={`${continuity.ownership.alignedOwner} alinhadas · ${continuity.ownership.ownerMismatch} divergentes`}
                    trend="CARTEIRA"
                    tone={
                      continuity.ownership.ownerMismatch ? "amber" : "green"
                    }
                  />
                  <AtlasMetric
                    label="Conversas órfãs"
                    value={String(continuity.ownership.unlinked)}
                    detail={`${continuity.ownership.conversationOwnerMissing} sem titular da conversa · ${continuity.ownership.missingLeadRecord} sem lead encontrada`}
                    trend="VÍNCULO"
                    tone={continuity.ownership.unlinked ? "amber" : "blue"}
                  />
                  <AtlasMetric
                    label={`Sem atividade ${continuity.continuity.recentDays}d`}
                    value={String(continuity.continuity.withoutRecentActivity)}
                    detail={`${continuity.continuity.stale} paradas há mais de ${continuity.continuity.staleDays} dias · ${continuity.continuity.noActivityDate} sem data`}
                    trend="CONTINUIDADE"
                    tone={
                      continuity.continuity.withoutRecentActivity
                        ? "amber"
                        : "green"
                    }
                  />
                  <AtlasMetric
                    label="Pendências de leitura"
                    value={String(continuity.continuity.unread)}
                    detail={`${continuity.continuity.open} conversas abertas · ${continuity.continuity.activeWithinRecentWindow} ativas no período`}
                    trend="ATENDIMENTO"
                    tone={continuity.continuity.unread ? "amber" : "violet"}
                  />
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 text-xs leading-6 text-slate-400">
                    <strong className="text-sm text-white">
                      Continuidade da carteira
                    </strong>
                    <p className="mt-1">
                      {continuity.ownership.leadOwnerMissing} conversas têm
                      responsável, mas a lead está sem titular;{" "}
                      {continuity.ownership.bothUnassigned} permanecem sem
                      titular nos dois registros.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 text-xs leading-6 text-slate-400">
                    <strong className="text-sm text-white">
                      Fragmentação do histórico
                    </strong>
                    <p className="mt-1">
                      {continuity.fragmentation.leadsWithMultipleConversations}{" "}
                      leads possuem mais de uma conversa, somando{" "}
                      {continuity.fragmentation.extraConversations} conversas
                      excedentes para revisão.
                    </p>
                  </div>
                </div>
                {continuity.source.truncated ? (
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-xs leading-6 text-amber-100">
                    Leitura parcial: {continuity.source.observed} de{" "}
                    {continuity.source.total} conversas foram observadas. Os
                    indicadores não representam a base inteira.
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] leading-5 text-slate-500">
                  <span>
                    Somente evidência para revisão: o Atlas não redistribui nem
                    troca o responsável nesta leitura.
                  </span>
                  <span>
                    Medição:{" "}
                    {new Date(continuity.measuredAt).toLocaleString("pt-BR")} ·
                    sem PII
                  </span>
                </div>
              </>
            ) : null}
          </div>
        </AtlasCard>
      </section>
      <section data-phase="367-whatsapp-learning-capture-quality">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fase 367 · Qualidade para IA"
            title="Captura útil, memória estruturada e autorização"
            description="Separa registro técnico, evidência estruturada e autorização para aprendizado. O diagnóstico não abre o texto das conversas."
          />
          <div className="space-y-4 p-5 sm:p-6">
            {captureQualityLoading ? (
              <AtlasSkeleton className="h-32 w-full" />
            ) : captureQualityError ? (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-sm text-amber-100">
                {captureQualityError}
              </div>
            ) : captureQuality ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                  <div>
                    <p className="text-sm font-medium text-white">
                      Modo de aprendizado seguro
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      O Atlas utiliza somente eventos estruturados. Gravar a
                      conversa não autoriza treinar a IA com o texto.
                    </p>
                  </div>
                  <AtlasBadge tone="warning">
                    CONTEÚDO BRUTO · NÃO AUTORIZADO
                  </AtlasBadge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <AtlasMetric
                    label="Captura estrutural"
                    value={`${captureQuality.capture.structuralCoveragePercent}%`}
                    detail={`${captureQuality.capture.structurallyUsable} de ${captureQuality.capture.total} mensagens com direção, data, conversa e lead`}
                    trend="CAPTURA"
                    tone={
                      captureQuality.capture.structuralCoveragePercent === 100
                        ? "green"
                        : "amber"
                    }
                  />
                  <AtlasMetric
                    label="Memória canônica"
                    value={`${captureQuality.canonicalMemory.coveragePercent}%`}
                    detail={`${captureQuality.canonicalMemory.coveredMessages} mensagens cobertas por ${captureQuality.canonicalMemory.behaviorEvents} eventos`}
                    trend="EVENTOS"
                    tone={
                      captureQuality.canonicalMemory.structuredLearningReady
                        ? "green"
                        : "amber"
                    }
                  />
                  <AtlasMetric
                    label="Rastreabilidade externa"
                    value={`${captureQuality.traceability.coveragePercent}%`}
                    detail={`${captureQuality.traceability.externallyTraceable} mensagens com identificador externo`}
                    trend="META"
                    tone={
                      captureQuality.traceability.coveragePercent === 100
                        ? "green"
                        : "blue"
                    }
                  />
                  <AtlasMetric
                    label="Linhas gravando"
                    value={`${captureQuality.recording.recordingConfiguredLines}/${captureQuality.recording.registeredLines}`}
                    detail="Configuração operacional; não equivale a consentimento para IA"
                    trend="LINHAS"
                    tone={
                      captureQuality.recording.recordingConfiguredLines
                        ? "blue"
                        : "amber"
                    }
                  />
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 text-xs leading-6 text-slate-400">
                    <strong className="text-sm text-white">
                      Lacunas estruturais
                    </strong>
                    <p className="mt-1">
                      {captureQuality.gaps.missingLeadLink} sem vínculo com lead
                      · {captureQuality.gaps.missingConversation} sem conversa
                      válida · {captureQuality.gaps.missingTimestamp} sem data ·{" "}
                      {captureQuality.gaps.invalidDirection} sem direção válida.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 text-xs leading-6 text-slate-400">
                    <strong className="text-sm text-white">
                      Prontidão factual
                    </strong>
                    <p className="mt-1">
                      Metadados{" "}
                      {captureQuality.learning.metadataReady
                        ? "disponíveis"
                        : "ainda insuficientes"}
                      ; memória estruturada{" "}
                      {captureQuality.learning.structuredLearningReady
                        ? "completa na amostra"
                        : `com ${captureQuality.gaps.missingCanonicalEvent} mensagens sem evento canônico`}
                      .
                    </p>
                  </div>
                </div>
                {captureQuality.source.truncated ? (
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-xs leading-6 text-amber-100">
                    Leitura parcial: {captureQuality.source.observed} de{" "}
                    {captureQuality.source.total} mensagens foram observadas. Os
                    percentuais não representam a base inteira.
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] leading-5 text-slate-500">
                  <span>
                    Sem conteúdo, telefone, remetente, destinatário ou mídia.
                  </span>
                  <span>
                    Medição:{" "}
                    {new Date(captureQuality.measuredAt).toLocaleString(
                      "pt-BR",
                    )}{" "}
                    · structured_only
                  </span>
                </div>
              </>
            ) : null}
          </div>
        </AtlasCard>
      </section>
      <section data-phase="368-commercial-context-readiness">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fase 368 · Contexto decisório"
            title="Prontidão da memória comercial para IA"
            description="Mede se a memória estruturada já contém projeto, etapa, responsável e próxima ação. Não lê conversas nem transforma lacunas em decisões automáticas."
          />
          <div className="space-y-4 p-5 sm:p-6">
            {contextReadinessLoading ? (
              <AtlasSkeleton className="h-32 w-full" />
            ) : contextReadinessError ? (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-sm text-amber-100">
                {contextReadinessError}
              </div>
            ) : contextReadiness ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                  <div>
                    <p className="text-sm font-medium text-white">
                      Contexto para apoio à decisão
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Uma memória só é completa quando os quatro vínculos
                      operacionais estão presentes e válidos.
                    </p>
                  </div>
                  <AtlasBadge
                    tone={
                      contextReadiness.readiness.decisionSupportReady
                        ? "success"
                        : "warning"
                    }
                  >
                    CONTEXTO ESTRUTURADO ·{" "}
                    {contextReadiness.readiness.decisionSupportReady
                      ? "COMPLETO"
                      : "EM PREPARAÇÃO"}
                  </AtlasBadge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <AtlasMetric
                    label="Contexto completo"
                    value={`${contextReadiness.context.completenessPercent}%`}
                    detail={`${contextReadiness.context.complete} de ${contextReadiness.context.total} memórias com os quatro vínculos`}
                    trend="PRONTIDÃO"
                    tone={
                      contextReadiness.readiness.decisionSupportReady
                        ? "green"
                        : "amber"
                    }
                  />
                  <AtlasMetric
                    label="Projeto vinculado"
                    value={`${contextReadiness.context.projectCoveragePercent}%`}
                    detail={`${contextReadiness.context.projectLinked} vinculadas · ${contextReadiness.gaps.missingProject} sem empreendimento`}
                    trend="PROJETO"
                    tone={
                      contextReadiness.gaps.missingProject ? "amber" : "blue"
                    }
                  />
                  <AtlasMetric
                    label="Etapa válida"
                    value={`${contextReadiness.context.stageCoveragePercent}%`}
                    detail={`${contextReadiness.context.stageValid} reconhecidas · ${contextReadiness.gaps.invalidStage} ausentes ou inválidas`}
                    trend="FUNIL"
                    tone={
                      contextReadiness.gaps.invalidStage ? "amber" : "violet"
                    }
                  />
                  <AtlasMetric
                    label="Próxima ação válida"
                    value={`${contextReadiness.context.nextActionCoveragePercent}%`}
                    detail={`${contextReadiness.context.nextActionValid} válidas · ${contextReadiness.gaps.invalidNextAction} sem ação canônica`}
                    trend="AÇÃO"
                    tone={
                      contextReadiness.gaps.invalidNextAction
                        ? "amber"
                        : "green"
                    }
                  />
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 text-xs leading-6 text-slate-400">
                    <strong className="text-sm text-white">
                      Responsabilidade e atividade
                    </strong>
                    <p className="mt-1">
                      Responsável em{" "}
                      {contextReadiness.context.responsibleCoveragePercent}% da
                      memória ({contextReadiness.gaps.missingResponsible} sem
                      corretor). {contextReadiness.activity.nonExpired} estados
                      permanecem vigentes e{" "}
                      {contextReadiness.activity.totalInteractions} interações
                      estruturadas foram acumuladas.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 text-xs leading-6 text-slate-400">
                    <strong className="text-sm text-white">Regra de uso</strong>
                    <p className="mt-1">
                      A cobertura informa disponibilidade de contexto. Toda
                      recomendação continua sujeita à revisão humana e não
                      comprova precisão preditiva.
                    </p>
                  </div>
                </div>
                {contextReadiness.source.truncated ? (
                  <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-xs leading-6 text-amber-100">
                    Leitura parcial: {contextReadiness.source.observed} de{" "}
                    {contextReadiness.source.total} memórias foram observadas. O
                    gate permanece bloqueado até a leitura integral.
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] leading-5 text-slate-500">
                  <span>
                    Sem nomes, telefones, mensagens ou decisão automática.
                  </span>
                  <span>
                    Medição:{" "}
                    {new Date(contextReadiness.measuredAt).toLocaleString(
                      "pt-BR",
                    )}{" "}
                    · evidence_only
                  </span>
                </div>
              </>
            ) : null}
          </div>
        </AtlasCard>
      </section>
      <section data-phase="369-whatsapp-memory-release-gate">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fase 369 · Gate de liberação"
            title="Prova de rastreabilidade e segurança"
            description="Consolida as evidências das fases anteriores antes de qualquer uso operacional da memória. Cobertura técnica não equivale a aprovação automática."
          />
          <div className="space-y-4 p-5 sm:p-6">
            {continuityLoading ||
            captureQualityLoading ||
            contextReadinessLoading ? (
              <AtlasSkeleton className="h-32 w-full" />
            ) : memoryReleaseGate ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {memoryReleaseGate.gate.readyForHumanRelease
                        ? "Evidência técnica completa"
                        : "Liberação bloqueada por evidência incompleta"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      {memoryReleaseGate.gate.passedControls} de{" "}
                      {memoryReleaseGate.gate.totalControls} controles
                      aprovados. A decisão final continua humana.
                    </p>
                  </div>
                  <AtlasBadge
                    tone={
                      memoryReleaseGate.gate.readyForHumanRelease
                        ? "success"
                        : "warning"
                    }
                  >
                    {memoryReleaseGate.gate.readyForHumanRelease
                      ? "PRONTO PARA APROVAÇÃO HUMANA"
                      : "BLOQUEADO"}
                  </AtlasBadge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <AtlasMetric
                    label="Rastreabilidade mínima"
                    value={`${memoryReleaseGate.proof.minimumTraceabilityPercent}%`}
                    detail="Menor cobertura entre titularidade, captura, Meta, memória e contexto"
                    trend="PROVA"
                    tone={
                      memoryReleaseGate.proof.minimumTraceabilityPercent === 100
                        ? "green"
                        : "amber"
                    }
                  />
                  <AtlasMetric
                    label="Mensagens úteis"
                    value={String(memoryReleaseGate.proof.usableMessages)}
                    detail={`${memoryReleaseGate.proof.observedMessages} observadas sem abrir conteúdo`}
                    trend="CAPTURA"
                    tone="blue"
                  />
                  <AtlasMetric
                    label="Memória canônica"
                    value={String(memoryReleaseGate.proof.canonicalMessages)}
                    detail={`${memoryReleaseGate.proof.completeCommercialMemories} contextos comerciais completos`}
                    trend="MEMÓRIA"
                    tone="violet"
                  />
                  <AtlasMetric
                    label="Controles aprovados"
                    value={`${memoryReleaseGate.gate.passedControls}/${memoryReleaseGate.gate.totalControls}`}
                    detail={
                      memoryReleaseGate.gate.blockers.length
                        ? memoryReleaseGate.gate.blockers.join(" · ")
                        : "Nenhum bloqueio técnico"
                    }
                    trend="GATE"
                    tone={
                      memoryReleaseGate.gate.readyForHumanRelease
                        ? "green"
                        : "amber"
                    }
                  />
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {memoryReleaseGate.controls.map((control) => (
                    <div
                      key={control.code}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-3 text-xs text-slate-300"
                    >
                      <span>{control.label}</span>
                      <AtlasBadge tone={control.passed ? "success" : "warning"}>
                        {control.passed ? "COMPROVADO" : "PENDENTE"}
                      </AtlasBadge>
                    </div>
                  ))}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] leading-5 text-slate-500">
                  <span>{"Sem PII, conteúdo bruto ou decisão automática. Não comprova ganho de vendas."}</span>
                  <span>
                    Aprovação humana obrigatória ·{" "}
                    {new Date(memoryReleaseGate.measuredAt).toLocaleString(
                      "pt-BR",
                    )}
                  </span>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-sm text-amber-100">
                Conclua as três medições anteriores para calcular o gate.
              </div>
            )}
          </div>
        </AtlasCard>
      </section>
      <section data-phase="370-whatsapp-memory-human-review">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fase 370 · Decisão humana"
            title="Dossiê de revisão da memória"
            description="Organiza a evidência para a diretoria sem liberar, persistir ou executar qualquer decisão automaticamente."
          />
          <div className="space-y-4 p-5 sm:p-6">
            {continuityLoading ||
            captureQualityLoading ||
            contextReadinessLoading ? (
              <AtlasSkeleton className="h-32 w-full" />
            ) : memoryHumanReview ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {memoryHumanReview.review.canBeReviewed
                        ? "Evidência pronta para leitura do diretor"
                        : "Revisão bloqueada pela prova técnica"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      {memoryHumanReview.review.evidenceReady} de{" "}
                      {memoryHumanReview.review.totalChecklistItems} itens
                      possuem evidência pronta. A aprovação permanece desativada
                      nesta leitura.
                    </p>
                  </div>
                  <AtlasBadge
                    tone={
                      memoryHumanReview.review.canBeReviewed
                        ? "warning"
                        : "danger"
                    }
                  >
                    {memoryHumanReview.review.canBeReviewed
                      ? "AGUARDANDO DECISÃO HUMANA"
                      : "BLOQUEADO"}
                  </AtlasBadge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {memoryHumanReview.review.checklist.map((item) => (
                    <div
                      key={item.code}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-3 text-xs text-slate-300"
                    >
                      <span>{item.label}</span>
                      <AtlasBadge
                        tone={
                          item.evidenceReady
                            ? item.humanConfirmationRequired
                              ? "warning"
                              : "success"
                            : "danger"
                        }
                      >
                        {item.evidenceReady
                          ? item.humanConfirmationRequired
                            ? "CONFIRMAÇÃO HUMANA"
                            : "EVIDÊNCIA PRONTA"
                          : "PENDENTE"}
                      </AtlasBadge>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-xs leading-6 text-amber-100">
                  <strong className="text-sm">Governança da decisão</strong>
                  <p className="mt-1">{memoryHumanReview.decisionGuard}</p>
                  <p className="mt-1">{"A revisão não comprova aumento de vendas nem precisão preditiva e não abre conteúdo bruto ou dados pessoais."}</p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] leading-5 text-slate-500">
                  <span>
                    {memoryHumanReview.review.blockers.length
                      ? `Bloqueios: ${memoryHumanReview.review.blockers.join(" · ")}`
                      : "Sem bloqueios técnicos; confirmação do diretor autenticado continua pendente."}
                  </span>
                  <span>
                    Decisão automática: não · aprovação registrada: não
                  </span>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-sm text-amber-100">
                Conclua o gate técnico para montar o dossiê de revisão humana.
              </div>
            )}
          </div>
        </AtlasCard>
      </section>
      <section data-phase="371-whatsapp-memory-director-decision-contract">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fase 371 · Governança"
            title="Contrato da decisão do diretor"
            description="Define o fluxo futuro de decisão autenticada, idempotente e auditável. Esta fase não registra nem executa qualquer decisão."
          />
          <div className="space-y-4 p-5 sm:p-6">
            {continuityLoading ||
            captureQualityLoading ||
            contextReadinessLoading ? (
              <AtlasSkeleton className="h-32 w-full" />
            ) : memoryDirectorDecisionContract ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {memoryDirectorDecisionContract.contract
                        .technicallyDecidable
                        ? "Contrato pronto para o fluxo autenticado"
                        : "Contrato bloqueado pela evidência técnica"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Somente admin ou diretor da mesma organização poderá
                      registrar aprovação ou rejeição explícita no fluxo futuro.
                    </p>
                  </div>
                  <AtlasBadge
                    tone={
                      memoryDirectorDecisionContract.contract
                        .technicallyDecidable
                        ? "warning"
                        : "danger"
                    }
                  >
                    {memoryDirectorDecisionContract.contract
                      .technicallyDecidable
                      ? "PERSISTÊNCIA PENDENTE"
                      : "BLOQUEADO"}
                  </AtlasBadge>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {memoryDirectorDecisionContract.contract.requirements.map(
                    (requirement) => (
                      <div
                        key={requirement.code}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-3 text-xs text-slate-300"
                      >
                        <span>{requirement.label}</span>
                        <AtlasBadge tone="warning">OBRIGATÓRIO</AtlasBadge>
                      </div>
                    ),
                  )}
                </div>
                <div className="rounded-2xl border border-cyan-300/20 bg-cyan-300/[.05] p-4 text-xs leading-6 text-cyan-100">
                  <strong className="text-sm">Limite desta fase</strong>
                  <p className="mt-1">
                    {memoryDirectorDecisionContract.decisionGuard}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] leading-5 text-slate-500">
                  <span>
                    Justificativa mínima:{" "}
                    {
                      memoryDirectorDecisionContract.contract
                        .minimumReasonLength
                    }{" "}
                    caracteres · confirmações humanas:{" "}
                    {
                      memoryDirectorDecisionContract.contract
                        .requiredHumanConfirmations
                    }
                  </span>
                  <span>
                    Persistida: não · executada: não · auditoria exigida: sim
                  </span>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-sm text-amber-100">
                Conclua o dossiê humano para montar o contrato da decisão.
              </div>
            )}
          </div>
        </AtlasCard>
      </section>
      <section data-phase="372-whatsapp-memory-director-decision-persistence">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Fase 372 · Persistência protegida"
            title="Ledger seguro da decisão"
            description="Prepara o registro imutável e auditável por organização. A migration local ainda não foi aplicada e nenhuma ação foi liberada na interface."
          />
          <div className="space-y-4 p-5 sm:p-6">
            {continuityLoading ||
            captureQualityLoading ||
            contextReadinessLoading ? (
              <AtlasSkeleton className="h-32 w-full" />
            ) : memoryDirectorDecisionPersistence ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                  <div>
                    <p className="text-sm font-medium text-white">
                      {memoryDirectorDecisionPersistence.persistence
                        .persistenceReady
                        ? "Fronteira local pronta para reconciliação"
                        : "Persistência bloqueada pela evidência técnica"}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-400">
                      Ledger append-only, tenant-scoped, idempotente e com
                      auditoria atômica. A escrita futura será exclusiva do
                      servidor.
                    </p>
                  </div>
                  <AtlasBadge
                    tone={
                      memoryDirectorDecisionPersistence.persistence
                        .persistenceReady
                        ? "warning"
                        : "danger"
                    }
                  >
                    {memoryDirectorDecisionPersistence.persistence
                      .persistenceReady
                      ? "MIGRATION LOCAL"
                      : "BLOQUEADO"}
                  </AtlasBadge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <AtlasMetric
                    label="Imutabilidade"
                    value="APPEND-ONLY"
                    detail="Sem atualização ou exclusão pela aplicação"
                    trend="LEDGER"
                    tone="blue"
                  />
                  <AtlasMetric
                    label="Isolamento"
                    value="TENANT"
                    detail="Leitura diretiva limitada à própria organização"
                    trend="RLS"
                    tone="green"
                  />
                  <AtlasMetric
                    label="Reexecução"
                    value="IDEMPOTENTE"
                    detail="Replay seguro e conflito de chave bloqueado"
                    trend="SAFE"
                    tone="violet"
                  />
                  <AtlasMetric
                    label="Aplicação remota"
                    value="PENDENTE"
                    detail="Nenhuma alteração aplicada ao Supabase"
                    trend="GATE"
                    tone="amber"
                  />
                </div>
                <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-xs leading-6 text-amber-100">
                  <strong className="text-sm">Sem decisão liberada</strong>
                  <p className="mt-1">
                    {memoryDirectorDecisionPersistence.guard}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] leading-5 text-slate-500">
                  <span>
                    Evidência válida por{" "}
                    {
                      memoryDirectorDecisionPersistence.persistence
                        .evidenceFreshnessHours
                    }
                    h · auditoria na mesma transação
                  </span>
                  <span>
                    Endpoint: {memoryDirectorDecisionPersistence.persistence.endpointExposed ? "sim" : "não"} · decisão persistida: não · aprendizado ativo: não
                  </span>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4 text-sm text-amber-100">
                Conclua o contrato da decisão para preparar a fronteira de
                persistência.
              </div>
            )}
          </div>
        </AtlasCard>
      </section>
      <section
        data-phase="373-whatsapp-memory-director-decision-endpoint"
        data-phase-ui="375-whatsapp-memory-director-decision-ui"
      >
        <WhatsAppMemoryDirectorDecisionPanel />
      </section>
      {loading ? (
        <AtlasSkeleton className="h-48 w-full" />
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AtlasMetric
            label="Número"
            value={String(data?.phone?.displayNumber || "Não confirmado")}
            detail={`${String(data?.phone?.verifiedName || data?.reason || "")} ${data?.phone?.idMasked || ""}`.trim()}
            trend="BUSINESS"
            tone={data?.homologation?.numberConfirmed ? "green" : "amber"}
          />
          <AtlasMetric
            label="Qualidade Meta"
            value={quality}
            detail="Avaliação oficial do número"
            trend="QUALITY"
            tone={quality === "GREEN" ? "green" : "amber"}
          />
          <AtlasMetric
            label="Limite de mensagens"
            value={String(data?.phone?.messagingLimitTier || "Não informado")}
            detail="Tier retornado pela Meta"
            trend="LIMIT"
            tone={data?.homologation?.limitConfirmed ? "blue" : "amber"}
          />
          <AtlasMetric
            label="Throughput"
            value={
              typeof data?.phone?.throughput === "object"
                ? String(data.phone.throughput.level || "Ativo")
                : String(data?.phone?.throughput || "Não informado")
            }
            detail={
              data?.phone?.platformType
                ? `${data.phone.platformType} · ${data.phone.verificationStatus || ""}`
                : "Capacidade oficial da conta"
            }
            trend="API"
            tone="violet"
          />
        </section>
      )}
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Fase 27 · Evidência"
          title="Confirmação da Graph API"
          description="Cada item abaixo precisa ser confirmado pela própria Meta para o aceite funcional."
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
          {[
            ["Conta acessível", data?.homologation?.graphConfirmed],
            ["Número confirmado", data?.homologation?.numberConfirmed],
            ["Qualidade disponível", data?.homologation?.qualityConfirmed],
            ["Limite disponível", data?.homologation?.limitConfirmed],
          ].map(([label, value]) => (
            <div
              key={String(label)}
              className="flex items-center justify-between rounded-2xl border border-white/[.07] bg-white/[.025] p-4"
            >
              <span className="text-sm text-slate-300">{label}</span>
              <AtlasBadge tone={value ? "success" : "warning"}>
                {value ? "CONFIRMADO" : "PENDENTE"}
              </AtlasBadge>
            </div>
          ))}
        </div>
        {data?.checkedAt ? (
          <p className="px-5 pb-5 text-[10px] text-slate-500 sm:px-6 sm:pb-6">
            Última consulta: {new Date(data.checkedAt).toLocaleString("pt-BR")}{" "}
            · operação somente leitura
          </p>
        ) : null}
      </AtlasCard>
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Fase 28 · Template oficial"
          title="Comprovar envio, entrega e leitura"
          description={`O envio é restrito ao número de homologação ${data?.testRecipientMasked || "não configurado"} e a templates aprovados sem variáveis. Após abrir a mensagem no aparelho, atualize o diagnóstico.`}
        />
        <div className="space-y-4 p-5 sm:p-6">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <select
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/40"
            >
              <option value="">Selecione um template aprovado</option>
              {data?.templates?.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name} · {template.language} · {template.category}
                </option>
              ))}
            </select>
            <button
              disabled={
                !templateId ||
                sending ||
                !data?.connected ||
                !data?.testRecipientMasked
              }
              onClick={() => void sendTemplateTest()}
              className="atlas-button-primary min-w-52 disabled:opacity-40"
            >
              {sending ? "Enviando pela API..." : "Enviar para teste"}
            </button>
          </div>
          {!data?.templates?.length ? (
            <p className="text-xs text-amber-300">
              Cadastre e sincronize ao menos um template aprovado sem variáveis
              para executar esta fase.
            </p>
          ) : null}
          <div className="space-y-2">
            {data?.templateTests?.length ? (
              data.templateTests.map((test) => (
                <div
                  key={test.id}
                  className="grid gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4 sm:grid-cols-[1fr_auto_auto_auto]"
                >
                  <div>
                    <strong className="text-sm text-white">
                      Teste {new Date(test.created_at).toLocaleString("pt-BR")}
                    </strong>
                    {test.error ? (
                      <p className="mt-1 text-xs text-rose-300">{test.error}</p>
                    ) : null}
                  </div>
                  {[
                    ["Enviado", test.sent_at],
                    ["Entregue", test.delivered_at],
                    ["Lido", test.read_at],
                  ].map(([label, at]) => (
                    <div key={String(label)}>
                      <AtlasBadge tone={at ? "success" : "warning"}>
                        {at ? "CONFIRMADO" : "AGUARDANDO"}
                      </AtlasBadge>
                      <p className="mt-1 text-[10px] text-slate-500">
                        {label}
                        {at
                          ? ` · ${new Date(at).toLocaleTimeString("pt-BR")}`
                          : ""}
                      </p>
                    </div>
                  ))}
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500">
                Nenhum ensaio de template registrado nesta organização.
              </p>
            )}
          </div>
        </div>
      </AtlasCard>
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Linhas por corretor"
          title="WhatsApp Business vinculado à carteira"
          description="Vincule apenas números oficiais cadastrados no Meta Business. Mensagens recebidas e enviadas por essas linhas ficam registradas no CRM, no lead e no histórico do responsável. WhatsApp pessoal não é acessado pelo Atlas."
        />
        <div className="space-y-4 p-5 sm:p-6">
          {pendingLines.length ? (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-300/[.06] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.16em] text-amber-200">
                    Aprovação da diretoria necessária
                  </p>
                  <p className="mt-1 text-sm text-slate-200">
                    {pendingLines.length}{" "}
                    {pendingLines.length === 1
                      ? "linha solicitada"
                      : "linhas solicitadas"}{" "}
                    por corretores aguardando validação oficial.
                  </p>
                </div>
                <AtlasBadge tone="warning">
                  {pendingLines.length} PENDENTE
                  {pendingLines.length > 1 ? "S" : ""}
                </AtlasBadge>
              </div>
            </div>
          ) : null}
          <div className="grid gap-3 lg:grid-cols-4">
            <select
              value={brokerProfileId}
              onChange={(event) => setBrokerProfileId(event.target.value)}
              className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-400/40"
            >
              <option value="">Selecione o corretor</option>
              {data?.brokerProfiles?.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name} · {profile.role}
                </option>
              ))}
            </select>
            <input
              value={brokerPhoneNumberId}
              onChange={(event) =>
                setBrokerPhoneNumberId(event.target.value.replace(/\D/g, ""))
              }
              inputMode="numeric"
              placeholder="Phone Number ID da Meta"
              className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-400/40"
            />
            <input
              value={brokerDisplayPhone}
              onChange={(event) => setBrokerDisplayPhone(event.target.value)}
              placeholder="Número exibido (opcional)"
              className="rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-emerald-400/40"
            />
            <button
              disabled={
                !brokerProfileId ||
                !brokerPhoneNumberId ||
                savingLine ||
                !data?.connected
              }
              onClick={() => void saveBrokerLine()}
              className="atlas-button-primary disabled:opacity-40"
            >
              {savingLine ? "Validando..." : "Validar e vincular"}
            </button>
          </div>
          <p className="text-xs leading-6 text-slate-500">
            O Atlas consulta a Graph API antes de salvar o vínculo. O token já
            configurado precisa ter acesso ao Phone Number ID informado; chaves
            e tokens nunca são exibidos nesta tela.
          </p>
          <div className="space-y-2">
            {data?.brokerLines?.filter((line) => line.brokerProfileId)
              .length ? (
              data.brokerLines
                .filter((line) => line.brokerProfileId)
                .map((line) => (
                  <div
                    key={line.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] p-4"
                  >
                    <div>
                      <p className="text-sm font-medium text-white">
                        {line.brokerName || "Corretor"}{" "}
                        <span className="ml-2 text-xs font-normal text-slate-500">
                          {line.displayPhone || line.phoneNumberIdMasked}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        {line.status === "pending_approval"
                          ? `Solicitada ${line.requestedAt ? new Date(line.requestedAt).toLocaleString("pt-BR") : "agora"} · ainda não registra conversas`
                          : `Registro no CRM ${line.recordConversations ? "ativo" : "desativado"} · atualizado ${line.updatedAt ? new Date(line.updatedAt).toLocaleDateString("pt-BR") : "agora"}`}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <AtlasBadge
                        tone={
                          line.status === "connected" ? "success" : "warning"
                        }
                      >
                        {line.status === "connected"
                          ? "CONECTADA"
                          : line.status === "pending_approval"
                            ? "AGUARDANDO APROVAÇÃO"
                            : "DESCONECTADA"}
                      </AtlasBadge>
                      {line.status === "pending_approval" ? (
                        <button
                          disabled={
                            savingLine ||
                            !line.brokerProfileId ||
                            !data?.connected
                          }
                          onClick={() =>
                            line.brokerProfileId &&
                            void approveBrokerLine(line.brokerProfileId)
                          }
                          className="rounded-lg border border-emerald-400/30 px-3 py-2 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-400/10 disabled:opacity-40"
                        >
                          Aprovar e validar na Meta
                        </button>
                      ) : (
                        <button
                          disabled={
                            savingLine ||
                            !line.brokerProfileId ||
                            line.status !== "connected"
                          }
                          onClick={() =>
                            line.brokerProfileId &&
                            void disconnectBrokerLine(line.brokerProfileId)
                          }
                          className="rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-300 transition hover:border-rose-400/40 hover:text-rose-200 disabled:opacity-40"
                        >
                          Desconectar
                        </button>
                      )}
                    </div>
                  </div>
                ))
            ) : (
              <p className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-500">
                Nenhum corretor possui uma linha oficial vinculada ainda.
              </p>
            )}
          </div>
        </div>
      </AtlasCard>
      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Fase 48 · Opt-out imediato"
          title="Pedido do cliente vence qualquer automação"
          description="SAIR e frases equivalentes bloqueiam o número, cancelam aprovações e retiram mensagens pendentes da fila antes de qualquer nova chamada à API oficial."
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-3">
          {[
            "Bloqueio universal antes de cada envio",
            "Pendências canceladas automaticamente",
            "Aprovações interrompidas",
            "Reativação e jornada noturna protegidas",
            "Evento e timeline auditáveis",
            "IA e corretor respeitam a mesma supressão",
          ].map((item) => (
            <div
              key={item}
              className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 text-sm text-slate-300"
            >
              <span className="mr-2 text-emerald-300">✓</span>
              {item}
            </div>
          ))}
        </div>
      </AtlasCard>
    </div>
  );
}
