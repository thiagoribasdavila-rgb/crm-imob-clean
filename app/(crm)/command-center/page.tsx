"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { supabase } from "@/lib/supabase";
import { CommandCenterModuleHealth } from "@/app/(crm)/dashboard/page";
import type { ProposalSignalKind } from "@/lib/ai/action-proposals";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { NextBestActionPanel } from "@/components/atlas/NextBestActionPanel";
import { CampaignApprovalsPanel } from "@/components/atlas/CampaignApprovalsPanel";
import { ProactiveNudgesPanel } from "@/components/atlas/ProactiveNudgesPanel";
import {
  AtlasBadge,
  AtlasEmpty,
  AtlasRecoverableError,
  AtlasSkeleton,
} from "@/components/ui/AtlasUI";

// Command Center · única home do Atlas (fusão com o antigo Início//dashboard).
// Camadas por grau de importância — primário (a decisão do papel), secundário
// (contexto operacional) e terciário (telemetria + régua de módulos) — com
// dados 100% dos endpoints existentes; único fetch novo: campaign-quality
// (Marketing · Meta, exclusivo da diretoria).

type DataRow = Record<string, unknown>;

type ModuleWriteReadiness = {
  state: "ready" | "source-mediated" | "blocked";
  label: string;
  detail: string;
  href: string;
  actionLabel: string;
};

type ModuleHealth = {
  id: string;
  label: string;
  state: "operational" | "degraded" | "unavailable";
  detail: string;
  href: string;
  count: number | null;
  write: ModuleWriteReadiness;
};

type SnapshotData = {
  leads: DataRow[];
  opportunities: DataRow[];
  tasks: DataRow[];
  insights: DataRow[];
  developments: DataRow[];
  profiles: DataRow[];
};

type ModuleHealthApiEnvelope = {
  ok: boolean;
  data?: {
    generatedAt: string;
    snapshot: SnapshotData;
    health: {
      state: "operational" | "degraded" | "attention";
      modules: ModuleHealth[];
    };
  };
  error?: { message?: string };
};

type BriefingSignal = {
  id: string;
  severity: "critical" | "attention" | "opportunity" | "healthy";
  area: string;
  title: string;
  evidence: string;
  action: string;
  href: string;
  impact: number;
};

type Briefing = {
  generatedAt: string;
  status: "critical" | "attention" | "healthy";
  signals: BriefingSignal[];
  /** O que o briefing não enxerga — rodapé de cobertura, nunca fila de trabalho. */
  coverage?: { blindSpots?: Array<{ id: string; title: string; reason: string }> };
  model: { generativeReady: boolean; localIntelligenceReady: boolean };
};

type AttentionSignalItem = {
  kind: string;
  severity: "critical" | "warning" | "info";
  reason: string;
  detail: string;
  since: string | null;
  metric: number;
};

type AttentionQueueItem = {
  leadId: string;
  leadName: string;
  status: string;
  score: number;
  topSeverity: "critical" | "warning" | "info";
  topReason: string;
  signals: AttentionSignalItem[];
};

type BrokerDaily = {
  summary: {
    activeLeads: number;
    hotLeads: number;
    openTasks: number;
    overdueTasks: number;
    firstContactOverdue: number;
    followUpOverdue: number;
    agendaNext7Days: number;
    leadsNeedingAttention: number;
  };
  priorities: Array<{
    leadId: string;
    leadName: string;
    status: string;
    score: number;
    priorityScore: number;
    conversionProbability: number;
    reason: string;
    nextBestAction: string;
    dueAt: string | null;
    hot: boolean;
  }>;
  attention: { queue: AttentionQueueItem[] };
  generatedAt: string;
};

type ManagerDaily = {
  totals: {
    brokers: number;
    online: number;
    available: number;
    activeLeads: number;
    hotLeads: number;
    firstContactOverdue: number;
    followUpOverdue: number;
    withoutNextAction: number;
  };
  // Linhas por corretor que o endpoint já devolve (subconjunto consumido aqui).
  brokers: Array<{
    brokerId: string;
    brokerName: string;
    activeLeads: number;
    firstContactOverdue: number;
    followUpOverdue: number;
    withoutNextAction: number;
  }>;
  interventions: Array<{
    brokerId: string;
    brokerName: string;
    severity: "critical" | "attention" | "opportunity";
    reason: string;
    action: string;
    href: string;
  }>;
  generatedAt: string;
};

type TeamSla = {
  totals: {
    alerts: number;
    firstContactOverdue: number;
    followUpOverdue: number;
    brokersWithAlerts: number;
    followUpComplianceRate: number | null;
  };
  generatedAt: string;
};

type SuperintendentSummary = {
  totals: {
    managers: number;
    brokers: number;
    online: number;
    activeLeads: number;
    hotLeads: number;
    firstContactOverdue: number;
    followUpOverdue: number;
  };
  interventions: Array<{
    managerId: string;
    managerName: string;
    severity: "critical" | "attention" | "opportunity";
    reason: string;
    action: string;
    href: string;
  }>;
  generatedAt: string;
};

type DirectorDaily = {
  commercial: {
    activeLeads: number;
    hotLeads: number;
    conversionRate: number;
    firstContactOverdue: number;
    followUpOverdue: number;
  };
  risks: Array<{
    severity: "critical" | "attention";
    area: string;
    reason: string;
    action: string;
  }>;
  generatedAt: string;
};

type GovernanceSummary = {
  status: "ready" | "blocked" | "unknown";
  generatedAt: string;
  health: {
    databaseOk: boolean;
    databaseLatencyMs: number;
    environment: string;
    hosting: string;
  };
  queues: {
    tasks: number | null;
    approvals: number | null;
    pendingOutbox: number | null;
    failedOutbox: number | null;
  };
  homologation: { passed: number | null; failed: number | null };
  ai: { calls30d: number; estimatedCostUsd30d: number; measured: boolean };
  critical: Record<string, boolean | null>;
};

// Marketing · Meta (diretoria): shape REAL de /api/v1/analytics/campaign-quality
// (lib/atlas/campaign-quality.ts) — declarado só o subconjunto consumido aqui.
type MarketingQuality = {
  period: { start: string; end: string; days: number };
  totals: {
    campaigns: number;
    campaignsRanked: number;
    leads: number;
    qualified: number;
    sales: number;
    discarded: number;
    spend: number;
  };
  policy: {
    minimumLeadsForDecision: number;
    spendMeasured: boolean;
    windowComplete?: boolean;
  };
};

const emptySnapshot: SnapshotData = {
  leads: [],
  opportunities: [],
  tasks: [],
  insights: [],
  developments: [],
  profiles: [],
};

const brl = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

// Fusão com o Início: mesma régua de estágios que o /dashboard usava no funil,
// agora derivada do snapshot que esta página JÁ busca via module-health.
const PIPELINE_STAGES = [
  { key: "novo", label: "Novo" },
  { key: "contato", label: "Contato" },
  { key: "qualificacao", label: "Qualificação" },
  { key: "visita", label: "Visita" },
  { key: "proposta", label: "Proposta" },
  { key: "negociacao", label: "Negociação" },
] as const;

const criticalGateLabels: Record<string, string> = {
  database: "Banco",
  https: "HTTPS",
  workerSecret: "Workers",
  failedOutbox: "Fila sem falhas",
  restoreEvidence: "Restauração",
};

// Preferências locais do Command Center (mesmo padrão do pipeline): chave
// versionada em sessionStorage, hidratação com try/catch e flag antes de gravar.
const COMMAND_CENTER_PREFERENCES_KEY = "atlas:command-center-preferences:v1";

type LayerKey = "ia" | "operacao" | "fila" | "feed";

type CollapsedLayers = Record<LayerKey, boolean>;

const defaultCollapsedLayers: CollapsedLayers = {
  ia: false,
  operacao: false,
  fila: false,
  feed: false,
};

type CommandCenterPreferences = {
  collapsed?: Partial<CollapsedLayers>;
  density?: "compact" | "comfortable";
  seenSignalIds?: string[];
};

// Profundidade 3D sutil: perspective própria no transform (autocontida) e tudo
// condicionado a motion-safe — sob prefers-reduced-motion nada se move.
const depthShell =
  "motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:hover:[transform:perspective(1200px)_translateZ(12px)_rotateX(1deg)]";
const depthShellSoft =
  "motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:hover:[transform:perspective(1200px)_translateZ(8px)]";
const quickActionClass =
  "grid h-11 w-11 place-items-center rounded-xl border border-white/[.07] bg-white/[.02] text-sm text-slate-300 transition-colors hover:border-white/[.12] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

function stringValue(row: DataRow, ...keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function numberValue(row: DataRow, ...keys: string[]) {
  for (const key of keys) {
    const value = Number(row[key]);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

function dateValue(row: DataRow, ...keys: string[]) {
  const value = stringValue(row, ...keys);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalized(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function displayName(row: DataRow, fallback: string) {
  return stringValue(row, "name", "title", "full_name") || fallback;
}

function ownerId(row: DataRow) {
  return stringValue(row, "assigned_to", "broker_id", "owner_id", "user_id");
}

function isDoneTask(row: DataRow) {
  return ["done", "concluido", "concluida", "completed", "cancelado"].includes(
    normalized(row.status),
  );
}

function phoneLinks(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  const international = digits.startsWith("55") ? digits : `55${digits}`;
  return { call: `tel:+${international}`, whatsapp: `https://wa.me/${international}` };
}

function openCopilot(prompt: string, context: DataRow) {
  window.dispatchEvent(
    new CustomEvent("atlas:open-copilot", { detail: { prompt, context } }),
  );
}

// Ticker: tempo relativo que se atualiza sozinho via nowTick (interval de 30s).
function relativeTimestamp(date: Date | null, nowMs: number) {
  if (!date) return "Data não informada";
  const diff = nowMs - date.getTime();
  if (diff < 45_000) return "agora";
  if (diff < 3_600_000) return `há ${Math.max(1, Math.round(diff / 60_000))}min`;
  if (diff < 86_400_000) return `há ${Math.round(diff / 3_600_000)}h`;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function briefingTone(severity: BriefingSignal["severity"]) {
  if (severity === "critical") return "danger" as const;
  if (severity === "attention") return "warning" as const;
  if (severity === "opportunity") return "info" as const;
  return "success" as const;
}

function attentionTone(severity: AttentionQueueItem["topSeverity"]) {
  if (severity === "critical") return "danger" as const;
  if (severity === "warning") return "warning" as const;
  return "info" as const;
}

function interventionTone(severity: "critical" | "attention" | "opportunity") {
  if (severity === "critical") return "danger" as const;
  if (severity === "attention") return "warning" as const;
  return "info" as const;
}

// CC-5 · herói "Prioridades agora": normaliza os sinais proativos que a página já
// busca (briefing.signals para gestão, brokerDaily.attention.queue para corretor)
// em cards de decisão unificados. Nenhum dado novo é inventado nem buscado.
type ProactiveSeverity = "critical" | "attention" | "opportunity";

type ProactivePriority = {
  id: string;
  severity: ProactiveSeverity;
  glyph: string;
  title: string;
  reason: string;
  primaryLabel: string;
  primaryHref: string;
  // SALTO V4.1 — quando o sinal tem ação preparável a partir dos dados do
  // cockpit, o card ganha "Preparar ação". `id` já é o leadId (fila do corretor).
  actionSignal?: ProposalSignalKind;
  actionMetric?: number;
};

// Sinais que produzem ação preparável só com o que o cockpit tem em mãos.
// follow_up_overdue exige o id do followup (ausente aqui) — fica de fora para
// não gerar proposta vazia; o corretor reagenda pela tela do lead ("Atender").
const COCKPIT_ACTIONABLE_SIGNALS = new Set<ProposalSignalKind>([
  "stale_stage",
  "high_score_no_contact",
  "objection_open",
]);

// Ordem de decisão: crítico → atenção → oportunidade.
const PRIORITY_SEVERITY_RANK: Record<ProactiveSeverity, number> = {
  critical: 0,
  attention: 1,
  opportunity: 2,
};

// Glyph mono geométrico por severidade (a cor vem da faixa, via CSS).
function priorityGlyph(severity: ProactiveSeverity) {
  if (severity === "critical") return "▲";
  if (severity === "attention") return "●";
  return "◆";
}

// ——— Camada tecnológica local (sem lib nova, sem backend novo) ———

// Ordem fixa dos grupos de fetch na telemetria de latência.
const TELEMETRY_ORDER = [
  "Operação",
  "IA",
  "Fila",
  "Gestão",
  "SLA",
  "Rede",
  "Executivo",
  "Governança",
  "Marketing",
] as const;

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// Count-up curto (~400ms) via requestAnimationFrame; sob reduced-motion o valor
// troca sem animação. Cleanup cancela o frame pendente no unmount.
function useCountUp(target: number) {
  const [display, setDisplay] = useState(target);
  const previousRef = useRef(target);
  useEffect(() => {
    const from = previousRef.current;
    previousRef.current = target;
    if (from === target) return;
    if (prefersReducedMotion()) {
      setDisplay(target);
      return;
    }
    const duration = 400;
    const startedAt = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return display;
}

// Sparkline em <canvas> puro: redesenha apenas quando a série muda (dependência
// do useEffect), com devicePixelRatio respeitado para nitidez em retina.
// Interatividade sem tooltip DOM: o ponteiro encontra o bucket mais próximo e o
// marcador (ponto + hairline + valor) é desenhado no próprio canvas, sem estado
// React por frame — só refs e redesenho imperativo; pointerleave limpa.
const SPARKLINE_WIDTH = 120;
const SPARKLINE_HEIGHT = 28;

function Sparkline({ points, label }: { points: number[]; label: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawRef = useRef<(highlightIndex: number | null) => void>(() => {});
  const bucketCountRef = useRef(0);
  const highlightRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    bucketCountRef.current = points.length;
    highlightRef.current = null;
    if (!canvas || !points.length) return;
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = SPARKLINE_WIDTH * ratio;
    canvas.height = SPARKLINE_HEIGHT * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const max = Math.max(...points, 1);
    const stepX = points.length > 1 ? SPARKLINE_WIDTH / (points.length - 1) : SPARKLINE_WIDTH;
    const yFor = (value: number) => SPARKLINE_HEIGHT - 3 - (value / max) * (SPARKLINE_HEIGHT - 6);
    const trace = () => {
      points.forEach((value, index) => {
        if (index === 0) ctx.moveTo(0, yFor(value));
        else ctx.lineTo(index * stepX, yFor(value));
      });
    };
    const draw = (highlightIndex: number | null) => {
      ctx.clearRect(0, 0, SPARKLINE_WIDTH, SPARKLINE_HEIGHT);
      // Área sutil sob o traço.
      ctx.beginPath();
      trace();
      ctx.lineTo((points.length - 1) * stepX, SPARKLINE_HEIGHT);
      ctx.lineTo(0, SPARKLINE_HEIGHT);
      ctx.closePath();
      ctx.fillStyle = "rgba(56, 189, 248, 0.12)";
      ctx.fill();
      // Traço fino na cor de acento.
      ctx.beginPath();
      trace();
      ctx.strokeStyle = "#38bdf8";
      ctx.lineWidth = 1.25;
      ctx.stroke();
      // Ponto final destacado.
      ctx.beginPath();
      ctx.arc((points.length - 1) * stepX, yFor(points[points.length - 1] ?? 0), 2, 0, Math.PI * 2);
      ctx.fillStyle = "#38bdf8";
      ctx.fill();
      if (highlightIndex === null) return;
      // Marcador do bucket sob o ponteiro: hairline vertical + ponto + valor.
      const value = points[highlightIndex] ?? 0;
      const markerX = highlightIndex * stepX;
      ctx.beginPath();
      ctx.moveTo(markerX, 2);
      ctx.lineTo(markerX, SPARKLINE_HEIGHT - 2);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(markerX, yFor(value), 2.5, 0, Math.PI * 2);
      ctx.fillStyle = "#e2e8f0";
      ctx.fill();
      // Rótulo do valor dentro do canvas (10px mono, fundo discreto pra legibilidade).
      const text = String(value);
      ctx.font = "10px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textBaseline = "top";
      const textWidth = ctx.measureText(text).width;
      const labelX = Math.min(Math.max(markerX - textWidth / 2, 2), SPARKLINE_WIDTH - textWidth - 2);
      ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
      ctx.fillRect(labelX - 2, 0, textWidth + 4, 12);
      ctx.fillStyle = "#e2e8f0";
      ctx.fillText(text, labelX, 2);
    };
    drawRef.current = draw;
    draw(null);
  }, [points]);

  const handlePointerMove = useCallback((event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const count = bucketCountRef.current;
    if (!canvas || !count) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return;
    const pointerX = ((event.clientX - rect.left) / rect.width) * SPARKLINE_WIDTH;
    const stepX = count > 1 ? SPARKLINE_WIDTH / (count - 1) : SPARKLINE_WIDTH;
    const index = Math.min(count - 1, Math.max(0, Math.round(pointerX / stepX)));
    if (highlightRef.current === index) return;
    highlightRef.current = index;
    drawRef.current(index);
  }, []);

  const clearHighlight = useCallback(() => {
    if (highlightRef.current === null) return;
    highlightRef.current = null;
    drawRef.current(null);
  }, []);

  // Via acessível completa continua no aria-label (o canvas segue não-focável).
  const lastValue = points.length ? points[points.length - 1] : 0;
  const minValue = points.length ? Math.min(...points) : 0;
  const maxValue = points.length ? Math.max(...points) : 0;
  const detailedLabel = points.length
    ? `${label}. Mínimo ${minValue}, máximo ${maxValue}, último ${lastValue}.`
    : label;

  return (
    <canvas
      ref={canvasRef}
      className="h-7 w-[120px] cursor-crosshair"
      role="img"
      aria-label={detailedLabel}
      onPointerMove={handlePointerMove}
      onPointerLeave={clearHighlight}
      onPointerCancel={clearHighlight}
    />
  );
}

// Anel de profundidade: gauge em canvas (devicePixelRatio) com trilho discreto
// e dupla passada do arco — um arco deslocado com alpha baixo por baixo dá a
// sensação de espessura (transform/tinta, nunca glow/blur). O arco anima até o
// valor com rAF ~500ms; sob reduced-motion pinta direto. Redesenha só quando o
// valor muda (dependência do useEffect).
const RING_SIZE = 64;
const RING_STROKE = 5;

function DepthRing({
  fraction,
  centerLabel,
  detail,
  label,
}: {
  fraction: number;
  centerLabel: string;
  detail: string;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const shownRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const target = Math.min(1, Math.max(0, fraction));
    const ratio = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = RING_SIZE * ratio;
    canvas.height = RING_SIZE * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    const center = RING_SIZE / 2;
    const radius = center - RING_STROKE - 1;
    const startAngle = -Math.PI / 2;
    const paint = (value: number) => {
      ctx.clearRect(0, 0, RING_SIZE, RING_SIZE);
      ctx.lineCap = "round";
      ctx.lineWidth = RING_STROKE;
      // Trilho discreto.
      ctx.beginPath();
      ctx.arc(center, center, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
      ctx.stroke();
      if (value <= 0.002) return;
      const endAngle = startAngle + Math.PI * 2 * value;
      // Dupla passada: arco deslocado com alpha baixo por baixo = espessura.
      ctx.beginPath();
      ctx.arc(center, center + 1.5, radius, startAngle, endAngle);
      ctx.strokeStyle = "rgba(56, 189, 248, 0.28)";
      ctx.stroke();
      // Arco principal no acento, terminação arredondada.
      ctx.beginPath();
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.strokeStyle = "#38bdf8";
      ctx.stroke();
    };
    cancelAnimationFrame(frameRef.current);
    if (prefersReducedMotion() || Math.abs(shownRef.current - target) < 0.001) {
      shownRef.current = target;
      paint(target);
      return;
    }
    const from = shownRef.current;
    const startedAt = performance.now();
    const duration = 500;
    const step = (now: number) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      const value = from + (target - from) * eased;
      shownRef.current = value;
      paint(value);
      if (progress < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [fraction]);

  return (
    <span
      role="img"
      tabIndex={0}
      aria-label={`${label}: ${detail}`}
      title={detail}
      className="relative inline-grid place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
    >
      <canvas ref={canvasRef} aria-hidden="true" className="h-16 w-16" />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute font-mono text-[11px] font-semibold tabular-nums text-slate-200"
      >
        {centerLabel}
      </span>
    </span>
  );
}

// Chevron de camada: recolhe apenas o corpo — os fetches continuam rodando e os
// contadores do cabeçalho continuam vivos com a camada colapsada.
function LayerToggle({
  collapsed,
  onToggle,
  layerLabel,
}: {
  collapsed: boolean;
  onToggle: () => void;
  layerLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? `Expandir camada ${layerLabel}` : `Recolher camada ${layerLabel}`}
      className={quickActionClass}
    >
      <span
        aria-hidden="true"
        className={`inline-block motion-safe:transition-transform motion-safe:duration-200 ${collapsed ? "-rotate-90" : ""}`}
      >
        ⌄
      </span>
    </button>
  );
}

export default function CommandCenterPage() {
  const [snapshot, setSnapshot] = useState<SnapshotData>(emptySnapshot);
  const [moduleHealth, setModuleHealth] = useState<ModuleHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [viewerId, setViewerId] = useState("");
  const [liveConnected, setLiveConnected] = useState(false);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [briefingUnavailable, setBriefingUnavailable] = useState(false);
  const [brokerDaily, setBrokerDaily] = useState<BrokerDaily | null>(null);
  const [managerDaily, setManagerDaily] = useState<ManagerDaily | null>(null);
  const [teamSla, setTeamSla] = useState<TeamSla | null>(null);
  const [superintendentSummary, setSuperintendentSummary] = useState<SuperintendentSummary | null>(null);
  const [directorDaily, setDirectorDaily] = useState<DirectorDaily | null>(null);
  const [governance, setGovernance] = useState<GovernanceSummary | null>(null);
  const [governanceNote, setGovernanceNote] = useState("");
  // Marketing · Meta: null = sem painel (carregando, sem papel ou falha silenciosa).
  const [marketingQuality, setMarketingQuality] = useState<MarketingQuality | null>(null);
  // Telemetria honesta: latência real medida por grupo de fetch (performance.now).
  const [fetchLatency, setFetchLatency] = useState<Record<string, number>>({});
  // Relógio de 30s para "atualizado há Xs" e para o ticker do feed.
  const [nowTick, setNowTick] = useState(() => Date.now());
  // CC-3 · experiência: modo apresentação, preferências locais e triagem de sinais.
  const [presentationMode, setPresentationMode] = useState(false);
  const [presentationAnnouncement, setPresentationAnnouncement] = useState("");
  const presentationAnnouncedRef = useRef(false);
  const [collapsedLayers, setCollapsedLayers] = useState<CollapsedLayers>(defaultCollapsedLayers);
  const [density, setDensity] = useState<"compact" | "comfortable">("comfortable");
  const [seenSignalIds, setSeenSignalIds] = useState<string[]>([]);
  const [showSeenSignals, setShowSeenSignals] = useState(false);
  const [preferencesHydrated, setPreferencesHydrated] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const session = sessionData.session;
      if (!session) throw new Error("ATLAS_SESSION_REQUIRED");

      const fetchStartedAt = performance.now();
      const response = await fetch("/api/v1/core-v2/module-health", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const body = (await response.json().catch(() => null)) as ModuleHealthApiEnvelope | null;
      setFetchLatency((current) => ({
        ...current,
        "Operação": Math.round(performance.now() - fetchStartedAt),
      }));
      if (!response.ok || !body?.ok || !body.data) throw new Error("ATLAS_MODULE_HEALTH_UNAVAILABLE");

      setViewerId(session.user.id);
      setSnapshot(body.data.snapshot);
      setModuleHealth(body.data.health.modules);
      setWarnings(
        body.data.health.modules
          .filter((module) => module.state !== "operational")
          .map((module) => `${module.label}: ${module.detail}.`),
      );
      setLastUpdated(new Date(body.data.generatedAt));
    } catch {
      setSnapshot(emptySnapshot);
      setModuleHealth([]);
      setWarnings(["Não foi possível atualizar a sala de comando agora. Seus dados permanecem protegidos."]);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Pulso ao vivo: mesma assinatura do /dashboard, com topic próprio para não colidir.
  useEffect(() => {
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => void load(), 700);
    };
    const channel = supabase
      .channel("atlas-command-center-page-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, refresh)
      .subscribe((status) => setLiveConnected(status === "SUBSCRIBED"));
    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      setLiveConnected(false);
      void supabase.removeChannel(channel);
    };
  }, [load]);

  // Relógio de 30s: re-render para "atualizado há Xs" e o ticker do feed.
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Atalho local: r = atualizar agora. Ignora campos de texto e combinações com
  // meta/ctrl/alt; listener no window com cleanup no unmount.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "r" && event.key !== "R") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      event.preventDefault();
      void load();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [load]);

  // Preferências persistidas (mesmo padrão do pipeline): hidrata uma vez com
  // try/catch e só grava depois de hidratado, em chave versionada.
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(COMMAND_CENTER_PREFERENCES_KEY);
      if (saved) {
        const preferences = JSON.parse(saved) as CommandCenterPreferences;
        if (preferences.collapsed) {
          setCollapsedLayers((current) => ({ ...current, ...preferences.collapsed }));
        }
        if (preferences.density === "compact" || preferences.density === "comfortable") {
          setDensity(preferences.density);
        }
        if (Array.isArray(preferences.seenSignalIds)) {
          setSeenSignalIds(
            preferences.seenSignalIds.filter((id): id is string => typeof id === "string"),
          );
        }
      }
    } catch {
      window.sessionStorage.removeItem(COMMAND_CENTER_PREFERENCES_KEY);
    } finally {
      setPreferencesHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!preferencesHydrated) return;
    window.sessionStorage.setItem(
      COMMAND_CENTER_PREFERENCES_KEY,
      JSON.stringify({ collapsed: collapsedLayers, density, seenSignalIds }),
    );
  }, [collapsedLayers, density, preferencesHydrated, seenSignalIds]);

  // Modo apresentação: fullscreen quando a API existir; sem ela o modo segue
  // apenas visual na página (fallback silencioso).
  const togglePresentation = useCallback(() => {
    setPresentationMode((current) => {
      const next = !current;
      try {
        if (next && typeof document.documentElement.requestFullscreen === "function") {
          void document.documentElement.requestFullscreen().catch(() => {});
        } else if (
          !next &&
          document.fullscreenElement &&
          typeof document.exitFullscreen === "function"
        ) {
          void document.exitFullscreen().catch(() => {});
        }
      } catch {
        // Sem fullscreen disponível: o modo apresentação continua só visual.
      }
      return next;
    });
  }, []);

  // Sincroniza o estado quando o usuário sai do fullscreen pelo próprio
  // navegador (Esc nativo, gesto do sistema); listener com cleanup.
  useEffect(() => {
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) setPresentationMode(false);
    };
    document.addEventListener("fullscreenchange", onFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", onFullscreenChange);
  }, []);

  // Atalho f = modo apresentação (mesma disciplina do atalho r: ignora campos de
  // texto e modificadores); Esc cobre o fallback sem fullscreen nativo.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const isF = event.key === "f" || event.key === "F";
      const isEscape = event.key === "Escape";
      if (!isF && !isEscape) return;
      const target = event.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      if (isF) {
        event.preventDefault();
        togglePresentation();
        return;
      }
      // Esc: dentro do fullscreen nativo quem responde é o fullscreenchange acima.
      if (presentationMode && !document.fullscreenElement) setPresentationMode(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [presentationMode, togglePresentation]);

  // Anúncio acessível do modo apresentação (aria-live polite), pulando o mount.
  useEffect(() => {
    if (!presentationAnnouncedRef.current) {
      presentationAnnouncedRef.current = true;
      return;
    }
    setPresentationAnnouncement(
      presentationMode
        ? "Modo apresentação ativado. Pressione Esc ou f para sair."
        : "Modo apresentação desativado.",
    );
  }, [presentationMode]);

  // Poda dos ids vistos: mantém apenas ids presentes na resposta atual, para o
  // armazenamento local não crescer para sempre.
  useEffect(() => {
    if (!preferencesHydrated) return;
    if (!briefing && !brokerDaily) return;
    const currentIds = new Set<string>();
    for (const signal of briefing?.signals ?? []) currentIds.add(signal.id);
    for (const item of brokerDaily?.attention.queue ?? []) currentIds.add(item.leadId);
    setSeenSignalIds((current) => {
      const next = current.filter((id) => currentIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [briefing, brokerDaily, preferencesHydrated]);

  const toggleLayer = useCallback((layer: LayerKey) => {
    setCollapsedLayers((current) => ({ ...current, [layer]: !current[layer] }));
  }, []);

  const toggleSignalSeen = useCallback((id: string) => {
    setSeenSignalIds((current) =>
      current.includes(id) ? current.filter((seenId) => seenId !== id) : [...current, id],
    );
  }, []);

  // SALTO V4.1 — "Preparar ação": transforma o sinal do herói numa proposta
  // concreta que entra na Caixa de Aprovações. Estado por lead, honesto:
  // idle → loading → (sent | deduped | error). Zero dado inventado.
  const [proposalState, setProposalState] = useState<
    Record<string, { status: "loading" | "sent" | "deduped" | "error"; message?: string }>
  >({});
  const prepareAction = useCallback(
    async (leadId: string, signal: ProposalSignalKind, metric?: number) => {
      setProposalState((current) => ({ ...current, [leadId]: { status: "loading" } }));
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token || "";
        const context =
          typeof metric === "number" && (signal === "stale_stage" || signal === "high_score_no_contact")
            ? { daysStalled: metric }
            : {};
        const response = await fetch("/api/v2/approvals", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({ leadId, signal, context }),
        });
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
          const message =
            response.status >= 500
              ? "Indisponível até a ativação do banco."
              : payload?.error?.message || "Não foi possível preparar a ação.";
          setProposalState((current) => ({ ...current, [leadId]: { status: "error", message } }));
          return;
        }
        const payload = (await response.json()) as { data?: { deduped?: boolean } };
        setProposalState((current) => ({
          ...current,
          [leadId]: { status: payload.data?.deduped ? "deduped" : "sent" },
        }));
      } catch {
        setProposalState((current) => ({
          ...current,
          [leadId]: { status: "error", message: "Indisponível até a ativação do banco." },
        }));
      }
    },
    [],
  );

  const referenceTime = lastUpdated?.getTime() ?? 0;
  const viewer = snapshot.profiles.find((profile) => String(profile.id) === viewerId);
  const viewerRole = viewer ? normalized(stringValue(viewer, "commercial_role", "role")) : "";
  const isDirector = viewerRole === "director" || stringValue(viewer ?? {}, "role") === "admin";
  const isSuperintendent = viewerRole === "superintendent";
  const isManager = viewerRole === "manager";
  const isBroker = viewerRole === "broker";

  // O briefing só é renderizado para papéis de gestão (o corretor vê a fila de
  // atenção da própria carteira), então o fetch é condicionado a esses papéis.
  useEffect(() => {
    if (!viewerId || isBroker) {
      setBriefing(null);
      setBriefingUnavailable(false);
      return;
    }
    let active = true;
    setBriefingUnavailable(false);
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const fetchStartedAt = performance.now();
      const response = await fetch("/api/ai/briefing", {
        headers: { Authorization: `Bearer ${session.session?.access_token || ""}` },
        cache: "no-store",
      });
      if (!active) return;
      setFetchLatency((current) => ({
        ...current,
        "IA": Math.round(performance.now() - fetchStartedAt),
      }));
      if (!response.ok) {
        setBriefingUnavailable(true);
        return;
      }
      const body = await response.json();
      if (active) setBriefing(body as Briefing);
    });
    return () => {
      active = false;
    };
  }, [viewerId, isBroker]);

  useEffect(() => {
    if (!isBroker) {
      setBrokerDaily(null);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const fetchStartedAt = performance.now();
      const response = await fetch("/api/v1/analytics/broker-daily", {
        headers: { Authorization: `Bearer ${session.session?.access_token || ""}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!active) return;
      setFetchLatency((current) => ({
        ...current,
        "Fila": Math.round(performance.now() - fetchStartedAt),
      }));
      if (response.ok) setBrokerDaily(body.data as BrokerDaily);
      else setWarnings((current) => [...current, "Sua fila do dia está temporariamente indisponível."]);
    });
    return () => {
      active = false;
    };
  }, [isBroker]);

  useEffect(() => {
    if (!isManager) {
      setManagerDaily(null);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const fetchStartedAt = performance.now();
      const response = await fetch("/api/v1/analytics/manager-daily", {
        headers: { Authorization: `Bearer ${session.session?.access_token || ""}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!active) return;
      setFetchLatency((current) => ({
        ...current,
        "Gestão": Math.round(performance.now() - fetchStartedAt),
      }));
      if (response.ok) setManagerDaily(body.data as ManagerDaily);
      else setWarnings((current) => [...current, "Cockpit do gerente temporariamente indisponível."]);
    });
    return () => {
      active = false;
    };
  }, [isManager]);

  useEffect(() => {
    if (!isManager) {
      setTeamSla(null);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const fetchStartedAt = performance.now();
      const response = await fetch("/api/v1/analytics/team-sla", {
        headers: { Authorization: `Bearer ${session.session?.access_token || ""}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!active) return;
      setFetchLatency((current) => ({
        ...current,
        "SLA": Math.round(performance.now() - fetchStartedAt),
      }));
      if (response.ok) setTeamSla(body.data as TeamSla);
      else setWarnings((current) => [...current, "Fila de SLA temporariamente indisponível."]);
    });
    return () => {
      active = false;
    };
  }, [isManager]);

  useEffect(() => {
    if (!isSuperintendent) {
      setSuperintendentSummary(null);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const fetchStartedAt = performance.now();
      const response = await fetch("/api/v1/analytics/dashboard", {
        headers: { Authorization: `Bearer ${session.session?.access_token || ""}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!active) return;
      setFetchLatency((current) => ({
        ...current,
        "Rede": Math.round(performance.now() - fetchStartedAt),
      }));
      if (response.ok) setSuperintendentSummary(body.data as SuperintendentSummary);
      else setWarnings((current) => [...current, "Painel da superintendência temporariamente indisponível."]);
    });
    return () => {
      active = false;
    };
  }, [isSuperintendent]);

  useEffect(() => {
    if (!isDirector) {
      setDirectorDaily(null);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const fetchStartedAt = performance.now();
      const response = await fetch("/api/v1/analytics/director-daily", {
        headers: { Authorization: `Bearer ${session.session?.access_token || ""}` },
        cache: "no-store",
      });
      const body = await response.json();
      if (!active) return;
      setFetchLatency((current) => ({
        ...current,
        "Executivo": Math.round(performance.now() - fetchStartedAt),
      }));
      if (response.ok) setDirectorDaily(body.data as DirectorDaily);
      else setWarnings((current) => [...current, "Visão executiva temporariamente indisponível."]);
    });
    return () => {
      active = false;
    };
  }, [isDirector]);

  useEffect(() => {
    if (!isDirector) {
      setGovernance(null);
      setGovernanceNote("");
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const fetchStartedAt = performance.now();
      const response = await fetch("/api/v1/governance/command-center", {
        headers: { Authorization: `Bearer ${session.session?.access_token || ""}` },
        cache: "no-store",
      });
      const body = await response.json().catch(() => null);
      if (!active) return;
      setFetchLatency((current) => ({
        ...current,
        "Governança": Math.round(performance.now() - fetchStartedAt),
      }));
      if (response.status === 403) {
        setGovernanceNote("Visão executiva disponível somente para a diretoria.");
        return;
      }
      if (!response.ok || !body?.ok || !body.data) {
        setGovernanceNote("Resumo de governança temporariamente indisponível.");
        return;
      }
      setGovernance(body.data as GovernanceSummary);
    });
    return () => {
      active = false;
    };
  }, [isDirector]);

  // Marketing · Meta — único fetch NOVO da fusão com o Início, role-gated para
  // a diretoria. Qualquer falha (rede, 403, shape) = painel ausente, sem erro
  // na tela; a latência real ainda entra na telemetria quando há resposta.
  useEffect(() => {
    if (!isDirector) {
      setMarketingQuality(null);
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(async ({ data: session }) => {
      const fetchStartedAt = performance.now();
      const response = await fetch("/api/v1/analytics/campaign-quality?days=30", {
        headers: { Authorization: `Bearer ${session.session?.access_token || ""}` },
        cache: "no-store",
      }).catch(() => null);
      if (!active) return;
      setFetchLatency((current) => ({
        ...current,
        "Marketing": Math.round(performance.now() - fetchStartedAt),
      }));
      if (!response?.ok) return;
      const body = (await response.json().catch(() => null)) as
        | { ok?: boolean; data?: MarketingQuality }
        | null;
      if (!active || !body?.ok || !body.data) return;
      setMarketingQuality(body.data);
    });
    return () => {
      active = false;
    };
  }, [isDirector]);

  const metrics = useMemo(() => {
    const active = snapshot.leads.filter(
      (lead) => !["ganho", "perdido", "arquivado", "comprou_outro"].includes(normalized(lead.status)),
    );
    const hot = active.filter(
      (lead) =>
        normalized(lead.temperature) === "quente" ||
        numberValue(lead, "score", "score_ia") >= 70,
    );
    const unassigned = active.filter((lead) => !ownerId(lead));
    const overdueTasks = snapshot.tasks.filter((task) => {
      const dueAt = dateValue(task, "due_at", "due_date");
      return Boolean(dueAt && dueAt.getTime() < referenceTime && !isDoneTask(task));
    });
    return {
      active: active.length,
      hot: hot.length,
      unassigned: unassigned.length,
      overdueTasks: overdueTasks.length,
    };
  }, [snapshot.leads, snapshot.tasks, referenceTime]);

  // Números vivos: count-up curto quando o valor muda (sem animação sob reduced-motion).
  const activeDisplay = useCountUp(metrics.active);
  const hotDisplay = useCountUp(metrics.hot);
  const overdueDisplay = useCountUp(metrics.overdueTasks);
  const unassignedDisplay = useCountUp(metrics.unassigned);

  // Séries das últimas 24h derivadas apenas dos dados já carregados na página:
  // leads por hora (created_at) e atividade do feed (updated_at de leads e tarefas).
  const sparkSeries = useMemo(() => {
    // referenceTime é sempre > 0 quando a barra renderiza (initialLoading cobre o resto).
    const reference = referenceTime;
    const hourMs = 3_600_000;
    const bucketIndex = (date: Date | null) => {
      if (!date) return -1;
      const diff = reference - date.getTime();
      if (diff < 0) return 23;
      if (diff >= 24 * hourMs) return -1;
      return 23 - Math.floor(diff / hourMs);
    };
    const leadsPerHour = Array.from({ length: 24 }, () => 0);
    for (const lead of snapshot.leads) {
      const index = bucketIndex(dateValue(lead, "created_at"));
      if (index >= 0) leadsPerHour[index] += 1;
    }
    const activityPerHour = Array.from({ length: 24 }, () => 0);
    for (const row of [...snapshot.leads, ...snapshot.tasks]) {
      const index = bucketIndex(dateValue(row, "updated_at", "created_at"));
      if (index >= 0) activityPerHour[index] += 1;
    }
    return { leadsPerHour, activityPerHour };
  }, [snapshot.leads, snapshot.tasks, referenceTime]);

  // Anéis de profundidade: razões derivadas apenas de dados já carregados na
  // página. (a) módulos operacionais X/Y; (b) a razão mais relevante do papel.
  const operationalModuleCount = moduleHealth.filter(
    (module) => module.state === "operational",
  ).length;
  const moduleRing = moduleHealth.length
    ? {
        fraction: operationalModuleCount / moduleHealth.length,
        centerLabel: `${operationalModuleCount}/${moduleHealth.length}`,
        detail: `${operationalModuleCount} de ${moduleHealth.length} módulos operacionais`,
        label: "Módulos operacionais",
      }
    : null;
  const roleRing = useMemo(() => {
    if (isBroker) {
      if (!brokerDaily || brokerDaily.summary.activeLeads <= 0) return null;
      const { activeLeads, leadsNeedingAttention } = brokerDaily.summary;
      const attended = Math.max(0, activeLeads - leadsNeedingAttention);
      const fraction = Math.min(1, Math.max(0, attended / activeLeads));
      return {
        fraction,
        centerLabel: `${Math.round(fraction * 100)}%`,
        detail: `${attended} de ${activeLeads} leads ativos sem sinal de atenção`,
        label: "Fila atendida",
        caption: "Fila atendida",
      };
    }
    if (isManager && teamSla && teamSla.totals.followUpComplianceRate !== null) {
      const rate = teamSla.totals.followUpComplianceRate;
      return {
        fraction: Math.min(1, Math.max(0, rate / 100)),
        centerLabel: `${Math.round(rate)}%`,
        detail: `Follow-up dentro do SLA em ${rate}% dos casos`,
        label: "SLA de follow-up",
        caption: "SLA follow-up",
      };
    }
    if (briefing?.signals.length) {
      const total = briefing.signals.length;
      const underControl = briefing.signals.filter(
        (signal) => signal.severity !== "critical",
      ).length;
      return {
        fraction: underControl / total,
        centerLabel: `${underControl}/${total}`,
        detail: `${underControl} de ${total} sinais da IA sem severidade crítica`,
        label: "Sinais sob controle",
        caption: "Sinais IA",
      };
    }
    return null;
  }, [briefing, brokerDaily, isBroker, isManager, teamSla]);

  // Fusão com o Início · distribuição por estágio do pipeline, derivada apenas
  // do snapshot já carregado (mesma contagem por status que o /dashboard fazia).
  const stageDistribution = useMemo(() => {
    const stages = PIPELINE_STAGES.map((stage) => ({
      ...stage,
      count: snapshot.leads.filter((lead) => normalized(lead.status) === stage.key).length,
    }));
    return { stages, total: stages.reduce((sum, stage) => sum + stage.count, 0) };
  }, [snapshot.leads]);

  // Primário do gerente: gargalos por corretor (SLA vencido + leads parados),
  // linhas reais do manager-daily ordenadas pelo total de travas.
  const managerBottlenecks = useMemo(() => {
    if (!isManager || !managerDaily) return [];
    return managerDaily.brokers
      .map((broker) => ({
        ...broker,
        stuck: broker.firstContactOverdue + broker.followUpOverdue + broker.withoutNextAction,
      }))
      .filter((broker) => broker.stuck > 0)
      .sort((a, b) => b.stuck - a.stuck)
      .slice(0, 5);
  }, [isManager, managerDaily]);

  // Primário da diretoria: sinais críticos = riscos executivos + sinais da IA
  // com severidade crítica (somente fontes que a página já busca).
  const directorCriticalSignals = useMemo(() => {
    if (!isDirector) return 0;
    const briefingCritical = (briefing?.signals ?? []).filter(
      (signal) => signal.severity === "critical",
    ).length;
    const riskCritical = (directorDaily?.risks ?? []).filter(
      (risk) => risk.severity === "critical",
    ).length;
    return briefingCritical + riskCritical;
  }, [briefing, directorDaily, isDirector]);

  // Marketing · Meta: taxas decisivas derivadas do shape real, com as mesmas
  // guardas de divisão por zero e de gasto não medido da página de campanhas.
  const marketingRates = useMemo(() => {
    if (!marketingQuality) return null;
    const { totals, policy } = marketingQuality;
    const rate = (part: number) =>
      totals.leads > 0 ? `${Math.round((part / totals.leads) * 1000) / 10}%` : "—";
    return {
      qualificationRate: rate(totals.qualified),
      discardRate: rate(totals.discarded),
      discardHigh: totals.leads > 0 && totals.discarded / totals.leads > 0.25,
      costPerLead:
        policy.spendMeasured && totals.spend > 0 && totals.leads > 0
          ? brl.format(totals.spend / totals.leads)
          : null,
      costPerQualified:
        policy.spendMeasured && totals.spend > 0 && totals.qualified > 0
          ? brl.format(totals.spend / totals.qualified)
          : null,
    };
  }, [marketingQuality]);

  // Relógio efetivo: nunca anterior à última atualização (o interval é de 30s).
  const nowMs = Math.max(nowTick, referenceTime);
  const updatedAgoSeconds = lastUpdated
    ? Math.max(0, Math.round((nowMs - lastUpdated.getTime()) / 1000))
    : null;
  const updatedAgoLabel =
    updatedAgoSeconds === null
      ? "Sincronizando"
      : updatedAgoSeconds < 90
        ? `atualizado há ${updatedAgoSeconds}s`
        : `atualizado há ${Math.round(updatedAgoSeconds / 60)}min`;
  const latencyEntries = TELEMETRY_ORDER.filter((key) => fetchLatency[key] !== undefined).map(
    (key) => `${key} ${fetchLatency[key]}ms`,
  );

  // CC-5 · saudação personalizada e data operacional (Intl/Date nativos, sem lib).
  // Período pela hora local; nome real do viewer; data pt-BR capitalizada.
  const viewerFirstName = displayName(viewer ?? {}, "").trim().split(/\s+/)[0] ?? "";
  const greetingHour = new Date(nowTick).getHours();
  const greetingPeriod =
    greetingHour < 12 ? "Bom dia" : greetingHour < 18 ? "Boa tarde" : "Boa noite";
  const greeting = viewerFirstName ? `${greetingPeriod}, ${viewerFirstName}.` : `${greetingPeriod}.`;
  const operationalDateRaw = new Date(nowTick).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const operationalDate =
    operationalDateRaw.charAt(0).toUpperCase() + operationalDateRaw.slice(1);

  // CC-3 · derivados de experiência: densidade, escala de apresentação e triagem.
  const layerBodyPad = density === "compact" ? "p-4" : "p-5 sm:p-6";
  const metricValueClass = presentationMode
    ? "tabular-nums text-[1.5em] leading-tight"
    : "tabular-nums";
  const seenSignalSet = useMemo(() => new Set(seenSignalIds), [seenSignalIds]);
  const brokerAttentionQueue = brokerDaily?.attention.queue ?? [];
  const briefingSignals = briefing?.signals ?? [];
  const iaSignalIds = isBroker
    ? brokerAttentionQueue.map((item) => item.leadId)
    : briefingSignals.map((signal) => signal.id);
  const iaSeenCount = iaSignalIds.filter((id) => seenSignalSet.has(id)).length;
  const iaNewCount = iaSignalIds.length - iaSeenCount;
  const visibleAttentionQueue = brokerAttentionQueue.filter(
    (item) => showSeenSignals || !seenSignalSet.has(item.leadId),
  );
  const visibleBriefingSignals = briefingSignals.filter(
    (signal) => showSeenSignals || !seenSignalSet.has(signal.id),
  );

  // CC-5 · sinais elevados para o herói "Prioridades agora", respeitando a mesma
  // triagem (seenSignalIds/showSeenSignals) das camadas existentes. Sinais
  // "healthy" não pedem decisão, então caem fora e alimentam o estado vazio.
  const priorities: ProactivePriority[] = (
    isBroker
      ? visibleAttentionQueue.map((item) => {
          const severity: ProactiveSeverity =
            item.topSeverity === "critical"
              ? "critical"
              : item.topSeverity === "warning"
                ? "attention"
                : "opportunity";
          // O 1º sinal é o de maior severidade (ordenação do backend). Só
          // oferecemos "Preparar ação" quando o kind é acionável do cockpit.
          const top = item.signals[0];
          const actionable =
            top && COCKPIT_ACTIONABLE_SIGNALS.has(top.kind as ProposalSignalKind)
              ? (top.kind as ProposalSignalKind)
              : undefined;
          return {
            id: item.leadId,
            severity,
            glyph: priorityGlyph(severity),
            title: item.leadName,
            reason: item.topReason,
            primaryLabel: "Atender",
            primaryHref: `/leads/${item.leadId}`,
            actionSignal: actionable,
            actionMetric: actionable ? top?.metric : undefined,
          };
        })
      : visibleBriefingSignals
          .filter((signal) => signal.severity !== "healthy")
          .map((signal) => {
            const severity = signal.severity as ProactiveSeverity;
            return {
              id: signal.id,
              severity,
              glyph: priorityGlyph(severity),
              title: signal.title,
              reason: signal.evidence,
              primaryLabel: signal.action,
              primaryHref: signal.href,
            };
          })
  )
    .sort((a, b) => PRIORITY_SEVERITY_RANK[a.severity] - PRIORITY_SEVERITY_RANK[b.severity])
    .slice(0, 6);
  // Enquanto a fonte do papel ainda carrega, o herói mostra skeleton (não vazio).
  const prioritiesLoading = isBroker
    ? brokerDaily === null
    : briefing === null && !briefingUnavailable;

  const liveFeed = useMemo(() => {
    const reference = referenceTime;
    const dayMs = 86_400_000;
    const leadEvents = snapshot.leads.map((lead) => {
      const at = dateValue(lead, "updated_at", "created_at");
      const createdAt = dateValue(lead, "created_at");
      return {
        id: `lead-${String(lead.id)}`,
        href: `/leads/${String(lead.id)}`,
        title: displayName(lead, "Lead sem nome"),
        detail: `Lead · ${stringValue(lead, "status") || "novo"}`,
        at: at?.getTime() ?? 0,
        when: at,
        isNew: Boolean(reference > 0 && createdAt && reference - createdAt.getTime() <= dayMs),
      };
    });
    const taskEvents = snapshot.tasks.map((task) => {
      const at = dateValue(task, "updated_at", "created_at", "due_at", "due_date");
      const leadId = stringValue(task, "lead_id");
      return {
        id: `task-${String(task.id)}`,
        href: leadId ? `/leads/${leadId}` : "/tasks",
        title: displayName(task, "Tarefa"),
        detail: `Tarefa · ${stringValue(task, "status") || "pendente"}`,
        at: at?.getTime() ?? 0,
        when: at,
        isNew: false,
      };
    });
    return [...leadEvents, ...taskEvents].sort((a, b) => b.at - a.at).slice(0, 8);
  }, [snapshot.leads, snapshot.tasks, referenceTime]);

  const phoneByLead = useMemo(
    () =>
      new Map(
        snapshot.leads.map((lead) => [String(lead.id), stringValue(lead, "phone")] as const),
      ),
    [snapshot.leads],
  );

  const managementQueue = useMemo(() => {
    if (isManager) {
      return {
        title: "Onde intervir no time",
        description: "Somente corretores diretamente subordinados. A decisão final continua com você.",
        ready: Boolean(managerDaily),
        items: (managerDaily?.interventions ?? []).slice(0, 5).map((item, index) => ({
          key: `${item.brokerId}-${index}`,
          label: item.brokerName,
          severity: item.severity,
          reason: item.reason,
          action: item.action,
          href: item.href,
        })),
      };
    }
    if (isSuperintendent) {
      return {
        title: "Onde apoiar os gerentes",
        description: "Comparação apenas da sua estrutura direta, sem misturar equipes paralelas.",
        ready: Boolean(superintendentSummary),
        items: (superintendentSummary?.interventions ?? []).slice(0, 5).map((item, index) => ({
          key: `${item.managerId}-${index}`,
          label: item.managerName,
          severity: item.severity,
          reason: item.reason,
          action: item.action,
          href: item.href,
        })),
      };
    }
    if (isDirector) {
      return {
        title: "Decisões que exigem a diretoria",
        description: "Riscos por exceção, com evidência e aprovação humana obrigatória.",
        ready: Boolean(directorDaily),
        items: (directorDaily?.risks ?? []).slice(0, 5).map((risk, index) => ({
          key: `${risk.area}-${index}`,
          label: risk.area,
          severity: risk.severity,
          reason: risk.reason,
          action: risk.action,
          href: "/reports",
        })),
      };
    }
    return null;
  }, [directorDaily, isDirector, isManager, isSuperintendent, managerDaily, superintendentSummary]);

  const roleLabel = isDirector
    ? "Diretoria"
    : isSuperintendent
      ? "Superintendência"
      : isManager
        ? "Gerência"
        : "Corretor";
  const roleDescription = isDirector
    ? "Pulso da organização, sinais da IA e governança consolidados em tempo real."
    : isSuperintendent
      ? "Estrutura direta, movimentos e sinais da IA atualizados ao vivo."
      : isManager
        ? "Time direto, SLA e sinais da IA atualizados ao vivo para intervir cedo."
        : "Sua carteira, sua fila do dia e os sinais da IA em tempo real.";

  const initialLoading = loading && !lastUpdated;

  if (initialLoading) {
    return (
      <div className="space-y-5 pb-12" aria-busy="true" aria-label="Carregando a sala de comando">
        <AtlasSkeleton className="h-28 w-full" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <AtlasSkeleton className="h-36 w-full" />
          <AtlasSkeleton className="h-36 w-full" />
          <AtlasSkeleton className="h-36 w-full" />
          <AtlasSkeleton className="h-36 w-full" />
        </div>
        <div className="grid gap-4 xl:grid-cols-2">
          <AtlasSkeleton className="h-80 w-full" />
          <AtlasSkeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }

  if (viewer && viewer.active !== true) {
    return (
      <div className="atlas-panel rounded-2xl p-6">
        <p className="atlas-page-eyebrow">Sala de comando</p>
        <h1 className="mt-1 text-xl font-semibold text-white">Perfil aguardando ativação</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
          Seu login está correto, mas o perfil comercial está inativo. Um administrador deve ativar
          seu acesso antes de abrir a operação.
        </p>
        <Link href="/settings/profile" className="atlas-button-secondary mt-5 inline-flex min-h-11 items-center">
          Ver situação do perfil
        </Link>
      </div>
    );
  }

  if (!viewerRole) {
    return (
      <div className="atlas-panel rounded-2xl p-6">
        <p className="atlas-page-eyebrow">Sala de comando</p>
        <h1 className="mt-1 text-xl font-semibold text-white">Perfil comercial não identificado</h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">
          Seu usuário está autenticado, mas ainda não possui um papel comercial ativo nesta
          organização.
        </p>
        <Link href="/settings/profile" className="atlas-button-secondary mt-5 inline-flex min-h-11 items-center">
          Revisar meu perfil
        </Link>
      </div>
    );
  }

  return (
    <div
      className={`${density === "compact" ? "space-y-3" : "space-y-5"} pb-12 [perspective:1400px]`}
      data-page="command-center-live"
      data-presentation={presentationMode ? "true" : undefined}
    >
      <span role="status" aria-live="polite" className="sr-only">
        {presentationAnnouncement}
      </span>
      <section
        aria-label="Estado da sala de comando"
        className={`cc5-reveal atlas-panel flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5 sm:p-6 ${depthShellSoft}`}
      >
        <div className="min-w-0">
          <p className="cc5-eyebrow">Sala de comando · {roleLabel}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">{greeting}</h1>
          <p className="cc5-opdate mt-1">{operationalDate}</p>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">{roleDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span
            role="status"
            aria-live="polite"
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[.07] bg-white/[.02] px-4 text-xs font-medium text-slate-300"
          >
            <span aria-hidden="true" className="relative inline-flex h-2 w-2">
              {liveConnected ? (
                <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--atlas-success)] opacity-60 motion-safe:animate-ping" />
              ) : null}
              <span
                className={`relative inline-flex h-2 w-2 rounded-full ${liveConnected ? "bg-[var(--atlas-success)]" : "bg-[var(--atlas-warning)]"}`}
              />
            </span>
            {liveConnected ? "Ao vivo" : "Reconectando"}
          </span>
          <span className="text-xs text-slate-500">
            {loading
              ? "Atualizando…"
              : lastUpdated
                ? `Atualizado às ${lastUpdated.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                : "Sincronizando"}
          </span>
          {!presentationMode ? (
            <button
              type="button"
              onClick={() =>
                setDensity((current) => (current === "compact" ? "comfortable" : "compact"))
              }
              aria-pressed={density === "compact"}
              aria-label="Alternar densidade entre compacta e confortável"
              className="atlas-button-secondary min-h-11"
            >
              {density === "compact" ? "Compacta" : "Confortável"}
            </button>
          ) : null}
          {!presentationMode ? (
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              aria-label="Atualizar a sala de comando"
              className="atlas-button-secondary min-h-11 min-w-11 disabled:cursor-wait disabled:opacity-60"
            >
              ↻
            </button>
          ) : null}
          <button
            type="button"
            onClick={togglePresentation}
            aria-pressed={presentationMode}
            className="atlas-button-secondary min-h-11"
          >
            {presentationMode ? "Sair da apresentação" : "Modo apresentação"}
          </button>
        </div>
      </section>

      {/* PRIMÁRIO · gerente — a decisão do papel vem antes de tudo: gargalos da
          equipe (team-sla + manager-daily). O herói de IA vira secundário. */}
      {isManager ? (
        <section
          aria-label="Gargalos da equipe"
          className="cc5-reveal atlas-panel rounded-2xl p-5 sm:p-6"
          style={{ animationDelay: "40ms" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p
                className="cc5-eyebrow"
                title="Primário do gerente: cumprimento de follow-up, SLA por corretor e leads sem próxima ação, medidos por team-sla e manager-daily."
              >
                Equipe · Gargalos · SLA
              </p>
              <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">
                Onde o time está travando
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                Follow-up dentro do prazo, SLA por corretor e leads parados — decida onde intervir
                primeiro.
              </p>
            </div>
            <Link
              href="/distribution"
              className="inline-flex min-h-11 items-center text-xs font-semibold text-[var(--atlas-accent)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
            >
              Abrir distribuição →
            </Link>
          </div>
          {!managerDaily && !teamSla ? (
            <AtlasSkeleton className="mt-4 h-40 w-full" />
          ) : (
            <div className="mt-4 grid gap-4 xl:grid-cols-[.9fr_1.1fr]">
              {/* Lista densa no lugar de 4 tiles bordados: a borda de cada tile competia
                  com a do painel. O compliance é o número que decide, então é o único
                  em escala de herói; os contadores ficam em peso de leitura tabular.
                  As cores de limiar levam `!` porque `.cc23-display`/`.cc6-metric-value`
                  moram fora de @layer e venceriam o utilitário de cor sem ele. */}
              <div className="cc23-quiet">
                <ul className="cc23-rows">
                  <li className="cc23-row">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-500">Follow-up no prazo</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {teamSla?.totals.followUpComplianceRate == null
                          ? "Sem amostra medida"
                          : `Cumprimento do time direto · ${
                              teamSla.totals.followUpComplianceRate >= 80
                                ? "na meta"
                                : "abaixo da meta (80%)"
                            }`}
                      </p>
                    </div>
                    {/* O limiar também é dito por texto na legenda acima — o sinal
                        nunca depende só do matiz. */}
                    {teamSla?.totals.followUpComplianceRate == null ? (
                      <span className="cc23-display text-slate-400!">—</span>
                    ) : (
                      <span
                        className={`cc23-display ${
                          teamSla.totals.followUpComplianceRate >= 80
                            ? "text-[var(--atlas-success)]!"
                            : "text-[var(--atlas-warning)]!"
                        }`}
                      >
                        {Math.round(teamSla.totals.followUpComplianceRate)}
                        <span className="cc23-unit-label">%</span>
                      </span>
                    )}
                  </li>
                  <li className="cc23-row">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-500">Sem 1º contato</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">SLA inicial vencido</p>
                    </div>
                    <span
                      className={`cc6-metric-value text-xl ${
                        (teamSla?.totals.firstContactOverdue ?? managerDaily?.totals.firstContactOverdue ?? 0) > 0
                          ? "text-[var(--atlas-danger)]!"
                          : ""
                      }`}
                    >
                      {teamSla?.totals.firstContactOverdue ?? managerDaily?.totals.firstContactOverdue ?? 0}
                    </span>
                  </li>
                  <li className="cc23-row">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-500">Follow-ups vencidos</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Próxima ação atrasada</p>
                    </div>
                    <span
                      className={`cc6-metric-value text-xl ${
                        (teamSla?.totals.followUpOverdue ?? managerDaily?.totals.followUpOverdue ?? 0) > 0
                          ? "text-[var(--atlas-warning)]!"
                          : ""
                      }`}
                    >
                      {teamSla?.totals.followUpOverdue ?? managerDaily?.totals.followUpOverdue ?? 0}
                    </span>
                  </li>
                  <li className="cc23-row">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-500">Sem próxima ação</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Leads parados na carteira</p>
                    </div>
                    <span
                      className={`cc6-metric-value text-xl ${
                        (managerDaily?.totals.withoutNextAction ?? 0) > 0
                          ? "text-[var(--atlas-warning)]!"
                          : ""
                      }`}
                    >
                      {managerDaily?.totals.withoutNextAction ?? 0}
                    </span>
                  </li>
                </ul>
              </div>
              {managerBottlenecks.length ? (
                <ul className="grid content-start gap-2" aria-label="Corretores com gargalos">
                  {managerBottlenecks.map((broker) => (
                    <li key={broker.brokerId}>
                      <Link
                        href={`/leads?assigned_to=${broker.brokerId}`}
                        title={`${broker.brokerName}: ${broker.firstContactOverdue} sem 1º contato, ${broker.followUpOverdue} follow-ups vencidos, ${broker.withoutNextAction} sem próxima ação`}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-white/[.06] bg-white/[.02] px-4 py-2.5 transition-colors hover:border-white/[.12] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                      >
                        <span className="flex min-w-0 items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 shrink-0 rounded-full ${
                              broker.firstContactOverdue > 0
                                ? "bg-[var(--atlas-danger)]"
                                : "bg-[var(--atlas-warning)]"
                            }`}
                          />
                          <span className="truncate text-sm font-medium text-white">
                            {broker.brokerName}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-400">
                          {broker.firstContactOverdue + broker.followUpOverdue} SLA ·{" "}
                          {broker.withoutNextAction} sem ação
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : managerDaily ? (
                <div className="rounded-xl border border-white/[.06] bg-white/[.02] p-4 text-sm leading-6 text-slate-400">
                  Nenhum corretor direto com SLA vencido ou leads parados neste momento.
                </div>
              ) : (
                <AtlasSkeleton className="h-40 w-full" />
              )}
            </div>
          )}
        </section>
      ) : null}

      {/* PRIMÁRIO · diretoria — saúde do negócio (director-daily + briefing) e o
          módulo de Marketing · Meta (único fetch novo, ausente em falha/403). */}
      {isDirector ? (
        <section
          aria-label="Saúde do negócio e marketing"
          className={`cc5-reveal grid gap-4 ${marketingRates ? "xl:grid-cols-[1.05fr_.95fr]" : ""}`}
          style={{ animationDelay: "40ms" }}
        >
          <div className="atlas-panel rounded-2xl p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p
                  className="cc5-eyebrow"
                  title="Primário da diretoria: conversão, SLA agregado e sinais críticos, medidos por director-daily e pelo briefing da IA."
                >
                  Negócio · Saúde · Agora
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">
                  Saúde do negócio
                </h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
                  Conversão, SLA agregado e sinais críticos do escopo inteiro — o essencial antes de
                  qualquer decisão.
                </p>
              </div>
              <Link
                href="/reports"
                className="inline-flex min-h-11 items-center text-xs font-semibold text-[var(--atlas-accent)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
              >
                Abrir relatórios →
              </Link>
            </div>
            {!directorDaily ? (
              <AtlasSkeleton className="mt-4 h-32 w-full" />
            ) : (
              /* Mesma conversão do primário do gerente: 4 tiles bordados viram lista
                 densa. Conversão geral é o número que abre a decisão, então recebe a
                 escala de herói com a unidade recuada (aninhada, para o 0.5em resolver
                 contra o display e não contra a linha). */
              <div className="cc23-quiet mt-4">
                <ul className="cc23-rows">
                  <li className="cc23-row">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-500">Conversão geral</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {directorDaily.commercial.activeLeads} ativos ·{" "}
                        {directorDaily.commercial.hotLeads} quentes
                      </p>
                    </div>
                    <span className="cc23-display">
                      {directorDaily.commercial.conversionRate}
                      <span className="cc23-unit-label">%</span>
                    </span>
                  </li>
                  <li className="cc23-row">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-500">Sem 1º contato</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">SLA inicial vencido</p>
                    </div>
                    <span
                      className={`cc6-metric-value text-xl ${
                        directorDaily.commercial.firstContactOverdue > 0
                          ? "text-[var(--atlas-danger)]!"
                          : ""
                      }`}
                    >
                      {directorDaily.commercial.firstContactOverdue}
                    </span>
                  </li>
                  <li className="cc23-row">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-500">Follow-ups vencidos</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Próxima ação atrasada</p>
                    </div>
                    <span
                      className={`cc6-metric-value text-xl ${
                        directorDaily.commercial.followUpOverdue > 0
                          ? "text-[var(--atlas-warning)]!"
                          : ""
                      }`}
                    >
                      {directorDaily.commercial.followUpOverdue}
                    </span>
                  </li>
                  <li className="cc23-row">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-500">Sinais críticos</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">Riscos executivos + IA</p>
                    </div>
                    <span
                      className={`cc6-metric-value text-xl ${
                        directorCriticalSignals > 0 ? "text-[var(--atlas-danger)]!" : ""
                      }`}
                    >
                      {directorCriticalSignals}
                    </span>
                  </li>
                </ul>
              </div>
            )}
          </div>
          {marketingQuality && marketingRates ? (
            <div className="atlas-panel rounded-2xl p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p
                    className="cc5-eyebrow"
                    title="Qualidade dos leads de campanha medida no CRM: quem qualifica, quem é descartado e quanto custou — janela de 30 dias."
                  >
                    Marketing · Meta · {marketingQuality.period.days}d
                  </p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight text-white">
                    Qualidade das campanhas
                  </h2>
                </div>
                <Link
                  href="/marketing/campaigns"
                  className="inline-flex min-h-11 items-center text-xs font-semibold text-[var(--atlas-accent)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                >
                  Abrir campanhas →
                </Link>
              </div>
              {/* Descarte é a taxa que dispara decisão (tem limiar), então é o único
                  herói do bloco. Qualificação, CPL e o custo por qualificado já chegam
                  como string formatada pelo useMemo (Intl com NBSP), então entram
                  inteiros — fatiar a unidade aqui quebraria o caso "—". */}
              <div className="cc23-quiet mt-4">
                <ul className="cc23-rows">
                  <li className="cc23-row">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-500">Qualificação</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {marketingQuality.totals.qualified} de {marketingQuality.totals.leads} leads ·{" "}
                        {marketingQuality.totals.sales} vendas
                      </p>
                    </div>
                    <span className="cc6-metric-value text-xl">
                      {marketingRates.qualificationRate}
                    </span>
                  </li>
                  <li className="cc23-row">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-500">Descarte</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {marketingQuality.totals.discarded} descartados na janela
                        {marketingRates.discardHigh ? " · acima do limiar (25%)" : ""}
                      </p>
                    </div>
                    <span
                      className={`cc23-display ${
                        marketingRates.discardHigh ? "text-[var(--atlas-danger)]!" : ""
                      }`}
                    >
                      {marketingRates.discardRate}
                    </span>
                  </li>
                  <li className="cc23-row">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-500">CPL</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {marketingRates.costPerQualified
                          ? `${marketingRates.costPerQualified} por qualificado`
                          : marketingQuality.policy.spendMeasured
                            ? `${brl.format(marketingQuality.totals.spend)} investidos`
                            : "Custo não medido"}
                      </p>
                    </div>
                    <span className="cc6-metric-value text-xl">
                      {marketingRates.costPerLead ?? "—"}
                    </span>
                  </li>
                  <li className="cc23-row">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-slate-500">Campanhas com leads</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {marketingQuality.totals.campaigns} na organização
                      </p>
                    </div>
                    <span className="cc6-metric-value text-xl">
                      {marketingQuality.totals.campaignsRanked}
                    </span>
                  </li>
                </ul>
              </div>
              {marketingQuality.policy.windowComplete === false ||
              !marketingQuality.policy.spendMeasured ? (
                <p className="mt-3 text-[11px] leading-5 text-[var(--atlas-warning)]">
                  {marketingQuality.policy.windowComplete === false
                    ? "Janela truncada no teto de paginação — números são piso, não total. "
                    : ""}
                  {!marketingQuality.policy.spendMeasured
                    ? "Gasto não medido (marketing_spend indisponível) — CPL omitido em vez de fingir zero."
                    : ""}
                </p>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      <section
        aria-label="Prioridades agora"
        className="cc5-reveal atlas-panel rounded-2xl p-5 sm:p-6"
        style={{ animationDelay: "70ms" }}
      >
        <div className="cc5-hero-head">
          <div className="min-w-0">
            <p className="cc5-eyebrow">Prioridades agora</p>
            <h2 className="cc5-hero-title">
              {isBroker ? "O que atender primeiro" : "O que pede a sua decisão"}
            </h2>
          </div>
          <span className="cc5-tag">
            <span aria-hidden="true">◇</span> IA proativa · {priorities.length}
          </span>
        </div>
        {prioritiesLoading ? (
          <AtlasSkeleton className="mt-4 h-40 w-full" />
        ) : priorities.length ? (
          <ul className="cc5-priority-list">
            {priorities.map((card, index) => (
              <li
                key={card.id}
                className={`cc5-priority cc5-sev-${card.severity}${index === 0 ? " cc5-priority-lead" : ""}`}
              >
                <span aria-hidden="true" className="cc5-priority-band" />
                <span aria-hidden="true" className="cc5-priority-glyph">
                  {card.glyph}
                </span>
                <div className="cc5-priority-body">
                  <p className="cc5-priority-title">{card.title}</p>
                  <p className="cc5-priority-reason">{card.reason}</p>
                </div>
                <div
                  className="cc5-priority-actions"
                  role="group"
                  aria-label={`Ações para ${card.title}`}
                >
                  <Link
                    href={card.primaryHref}
                    className="cc5-action cc5-action-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                  >
                    {card.primaryLabel}
                  </Link>
                  {card.actionSignal ? (
                    (() => {
                      const state = proposalState[card.id];
                      if (state?.status === "sent" || state?.status === "deduped") {
                        return (
                          /* "A IA propõe, o humano aprova": o tracejado vai para a borda
                             que a pílula JÁ tem — o `.cc23-seam` desenharia uma reta de
                             1px cruzando o raio de 999px, virando artefato. O `!` é
                             obrigatório porque `.cc6-chip` declara `border: 1px solid`
                             fora de @layer e venceria o utilitário. */
                          <span className="cc6-chip border-dashed! tabular-nums" role="status">
                            {state.status === "deduped"
                              ? "Já havia proposta · aguarda aprovação"
                              : "Proposta enviada · aguarda aprovação"}
                            <Link
                              href="/approvals"
                              className="ml-2 underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                            >
                              Abrir aprovações →
                            </Link>
                          </span>
                        );
                      }
                      if (state?.status === "error") {
                        return (
                          <span className="cc6-crit text-sm" role="status">
                            {state.message}
                          </span>
                        );
                      }
                      return (
                        <button
                          type="button"
                          onClick={() =>
                            prepareAction(card.id, card.actionSignal as ProposalSignalKind, card.actionMetric)
                          }
                          className="cc5-action"
                          aria-busy={state?.status === "loading"}
                          disabled={state?.status === "loading"}
                          aria-label={`Preparar ação para ${card.title}`}
                        >
                          {state?.status === "loading" ? "Preparando…" : "Preparar ação"}
                        </button>
                      );
                    })()
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggleSignalSeen(card.id)}
                    className="cc5-action"
                    aria-label={`Adiar o sinal ${card.title}`}
                  >
                    Adiar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <div className="cc5-hero-empty">
            <p className="cc5-hero-empty-title">Nada pede sua decisão agora.</p>
            <p className="cc5-hero-empty-detail">
              A IA proativa não encontrou sinais que exijam sua decisão neste momento. Assim que
              algo mudar no seu escopo, aparece aqui primeiro.
            </p>
          </div>
        )}
      </section>

      {/* SECUNDÁRIO · corretor — números do dia direto do broker-daily. */}
      {isBroker ? (
        <section
          aria-label="Meus números do dia"
          className="cc5-reveal atlas-panel rounded-2xl px-5 py-4 sm:px-6"
          style={{ animationDelay: "100ms" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              className="cc5-eyebrow"
              title="Secundário do corretor: contexto operacional do seu dia — carteira, tarefas e agenda, direto do broker-daily."
            >
              Meu dia · Números
            </p>
            <Link
              href="/tasks"
              className="inline-flex min-h-11 items-center text-xs font-semibold text-[var(--atlas-accent)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
            >
              Abrir tarefas →
            </Link>
          </div>
          {!brokerDaily ? (
            <AtlasSkeleton className="mt-3 h-16 w-full" />
          ) : (
            /* Faixa de CONTEXTO: a densidade vem de matar as 5 bordas e agrupar por
               fundo, não de empilhar — empilhar triplicaria a altura e faria números
               de apoio gritarem logo abaixo do herói "Prioridades agora". */
            <dl className="cc23-quiet mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
              <div className="min-w-0" title="Leads da sua carteira em atendimento">
                <dt className="text-[11px] text-slate-500">Leads ativos</dt>
                <dd className="cc6-metric-value mt-0.5 text-xl">
                  {brokerDaily.summary.activeLeads}
                </dd>
              </div>
              <div className="min-w-0" title="Alta intenção ou score elevado">
                <dt className="text-[11px] text-slate-500">Quentes</dt>
                <dd
                  className={`cc6-metric-value mt-0.5 text-xl ${
                    brokerDaily.summary.hotLeads > 0 ? "text-[var(--atlas-warning)]!" : ""
                  }`}
                >
                  {brokerDaily.summary.hotLeads}
                </dd>
              </div>
              <div className="min-w-0" title="Tarefas em aberto na sua fila">
                <dt className="text-[11px] text-slate-500">Tarefas abertas</dt>
                <dd className="cc6-metric-value mt-0.5 text-xl">
                  {brokerDaily.summary.openTasks}
                </dd>
              </div>
              <div className="min-w-0" title="Prazos vencidos aguardando ação">
                <dt className="text-[11px] text-slate-500">Atrasadas</dt>
                <dd
                  className={`cc6-metric-value mt-0.5 text-xl ${
                    brokerDaily.summary.overdueTasks > 0 ? "text-[var(--atlas-danger)]!" : ""
                  }`}
                >
                  {brokerDaily.summary.overdueTasks}
                </dd>
              </div>
              <div className="min-w-0" title="Compromissos com prazo nos próximos 7 dias">
                <dt className="text-[11px] text-slate-500">Agenda 7 dias</dt>
                <dd className="cc6-metric-value mt-0.5 text-xl">
                  {brokerDaily.summary.agendaNext7Days}
                </dd>
              </div>
            </dl>
          )}
        </section>
      ) : null}

      {/* IA mais ativa · corretor — a playlist de próxima-melhor-ação (motor que
          já existia e não tinha UI), surfada direto na Sala de Comando. */}
      {isBroker ? (
        <section
          aria-label="Próxima melhor ação"
          className="cc5-reveal [transform-style:preserve-3d]"
          style={{ animationDelay: "120ms" }}
        >
          <NextBestActionPanel max={5} />
        </section>
      ) : null}

      {/* IA · liderança — a fila dos leads ABERTOS sem responsável. O painel só
          existia para o corretor, e a maior massa de receita parada da base não
          está em carteira nenhuma: está sem dono, invisível em todas as telas.
          Aditivo e sem automação — o painel leva ao lead, quem escolhe o dono
          continua sendo gente.
          A condição espelha o conjunto LEADERSHIP da rota (director |
          superintendent | manager). Com `!isBroker`, papéis como marketing,
          finance, developer e viewer renderizavam a seção e recebiam 403 —
          erro fixo na tela para quem nunca deveria ver a seção. */}
      {isDirector || isSuperintendent || isManager ? (
        <section
          aria-label="Leads abertos sem responsável"
          className="cc5-reveal [transform-style:preserve-3d]"
          style={{ animationDelay: "125ms" }}
        >
          <NextBestActionPanel max={5} scope="sem_dono" />
        </section>
      ) : null}

      {/* Governança · liderança — aprovar as campanhas Meta prontas (Arvo/Spin)
          com 1 clique, direto para a Caixa de Aprovações. */}
      {!isBroker ? (
        <section
          aria-label="Aprovar campanhas Meta"
          className="cc5-reveal [transform-style:preserve-3d]"
          style={{ animationDelay: "130ms" }}
        >
          <CampaignApprovalsPanel />
        </section>
      ) : null}

      {/* IA proativa · todos os papéis — os "próximos passos" endereçados ao papel
          (motor proactive-hierarchy, antes sem UI). Cada papel só vê o seu mundo. */}
      <section
        aria-label="Próximos passos da IA"
        className="cc5-reveal [transform-style:preserve-3d]"
        style={{ animationDelay: "140ms" }}
      >
        <ProactiveNudgesPanel max={4} />
      </section>

      {/* O tilt 3D mutava style.transform a cada pointermove sem carregar informação
          nenhuma; sai a mutação por frame e fica a métrica. Nada de `.cc23-lift` aqui:
          `.atlas-metric` já desenha borda, raio, fundo e elevação — somar o lift criaria
          o anel duplo que este redesenho existe para matar. */}
      <section
        aria-label="Pulso da operação"
        className="cc5-reveal grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        style={{ animationDelay: "140ms" }}
      >
        <AtlasMetric label="Leads ativos" value={<span className={metricValueClass}>{activeDisplay}</span>} detail="Base em atendimento no seu escopo" tone="blue" />
        <AtlasMetric label="Leads quentes" value={<span className={metricValueClass}>{hotDisplay}</span>} detail="Score alto ou temperatura quente" tone={metrics.hot ? "amber" : "green"} />
        <AtlasMetric label="Tarefas atrasadas" value={<span className={metricValueClass}>{overdueDisplay}</span>} detail="Prazos vencidos aguardando ação" tone={metrics.overdueTasks ? "rose" : "green"} />
        <AtlasMetric label="Sem responsável" value={<span className={metricValueClass}>{unassignedDisplay}</span>} detail="Leads aguardando distribuição" tone={metrics.unassigned ? "amber" : "green"} />
      </section>

      {/* SECUNDÁRIO · herança do Início — distribuição por estágio derivada do
          snapshot já buscado: barra segmentada fina, um acento em rampa. */}
      <section
        aria-label="Distribuição do pipeline por estágio"
        className="cc5-reveal atlas-panel rounded-2xl px-5 py-4 sm:px-6"
        style={{ animationDelay: "170ms" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className="cc5-eyebrow"
            title="Quantos leads do snapshot atual estão em cada estágio do funil: novo → contato → qualificação → visita → proposta → negociação."
          >
            Pipeline · Estágios
          </p>
          <Link
            href="/pipeline"
            className="inline-flex min-h-11 items-center text-xs font-semibold text-[var(--atlas-accent)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
          >
            Abrir pipeline →
          </Link>
        </div>
        {stageDistribution.total ? (
          <>
            <div
              role="img"
              aria-label={`Distribuição por estágio: ${stageDistribution.stages
                .map((stage) => `${stage.label} ${stage.count}`)
                .join(", ")}.`}
              className="mt-3 flex h-2 w-full gap-px overflow-hidden rounded-full bg-white/[.04]"
            >
              {stageDistribution.stages.map((stage, index) =>
                stage.count > 0 ? (
                  <span
                    key={stage.key}
                    title={`${stage.label}: ${stage.count} lead(s)`}
                    className="h-full min-w-[6px] bg-[var(--atlas-accent)]"
                    style={{
                      width: `${(stage.count / stageDistribution.total) * 100}%`,
                      opacity: 0.92 - index * 0.12,
                    }}
                  />
                ) : null,
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {stageDistribution.stages.map((stage, index) => (
                <span
                  key={stage.key}
                  className="inline-flex items-center gap-1.5 text-[11px] text-slate-500"
                >
                  <span
                    aria-hidden="true"
                    className="h-1.5 w-1.5 rounded-[2px] bg-[var(--atlas-accent)]"
                    style={{ opacity: 0.92 - index * 0.12 }}
                  />
                  {stage.label}
                  <span className="font-mono font-semibold tabular-nums text-slate-300">
                    {stage.count}
                  </span>
                </span>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-3 text-xs text-slate-500">
            Nenhum lead nos estágios do funil neste escopo agora.
          </p>
        )}
      </section>

      {/* TERCIÁRIO · telemetria + régua de módulos — discreto e colapsável
          (reusa collapsedLayers; contadores do cabeçalho seguem vivos). */}
      <section
        aria-label="Telemetria e régua de módulos"
        className="cc5-reveal atlas-panel rounded-2xl px-5 py-3"
        style={{ animationDelay: "210ms" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p
            className="cc5-eyebrow"
            title="Camada terciária: latência real medida por grupo de dados, séries das últimas 24h e a régua de módulos com contagem e estado de saúde."
          >
            Telemetria · Módulos
          </p>
          <div className="flex items-center gap-3">
            <span className="font-mono text-[11px] tabular-nums text-slate-500">
              {moduleHealth.length
                ? `${operationalModuleCount}/${moduleHealth.length} módulos · ${updatedAgoLabel}`
                : updatedAgoLabel}
            </span>
            <LayerToggle
              collapsed={collapsedLayers.operacao}
              onToggle={() => toggleLayer("operacao")}
              layerLabel="telemetria e módulos"
            />
          </div>
        </div>
        {collapsedLayers.operacao ? null : (
        <>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <span
            className={`inline-flex items-center gap-2 text-[11px] font-medium ${
              liveConnected ? "text-slate-300" : "text-[var(--atlas-warning)]"
            }`}
          >
            <span aria-hidden="true" className="relative inline-flex h-1.5 w-1.5">
              {liveConnected ? (
                <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--atlas-success)] opacity-60 motion-safe:animate-ping" />
              ) : null}
              <span
                className={`relative inline-flex h-1.5 w-1.5 rounded-full ${
                  liveConnected ? "bg-[var(--atlas-success)]" : "bg-[var(--atlas-warning)]"
                }`}
              />
            </span>
            {liveConnected ? "canal ao vivo" : "canal reconectando"}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-slate-500">
            {latencyEntries.length ? latencyEntries.join(" · ") : "medindo latência…"}
          </span>
          <span className="text-[11px] tabular-nums text-slate-500">{updatedAgoLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {/* O anel de módulos era um gauge em canvas rodando rAF só para redesenhar
              "X/Y", que já aparece em texto no cabeçalho desta mesma faixa. Vira par
              textual — e o `detail`, que antes só existia no aria-label do canvas,
              passa a ser lido no fluxo (sr-only), em vez de ficar preso num `title`
              inalcançável por teclado. O anel do papel (roleRing) fica. */}
          {moduleRing ? (
            <span className="flex items-center gap-2">
              <span aria-hidden="true" className="cc6-num text-[11px] text-slate-300">
                {moduleRing.centerLabel}
              </span>
              <span aria-hidden="true" className="text-[11px] text-slate-500">
                Módulos
              </span>
              <span className="sr-only">
                {moduleRing.label}: {moduleRing.detail}
              </span>
            </span>
          ) : null}
          {roleRing ? (
            <span className="flex items-center gap-2">
              <DepthRing
                fraction={roleRing.fraction}
                centerLabel={roleRing.centerLabel}
                detail={roleRing.detail}
                label={roleRing.label}
              />
              <span className="text-[11px] text-slate-500">{roleRing.caption}</span>
            </span>
          ) : null}
          <span className="flex items-center gap-2">
            <Sparkline
              points={sparkSeries.leadsPerHour}
              label="Leads criados nas últimas 24 horas, por hora"
            />
            <span className="text-[11px] text-slate-500">Leads · 24h</span>
          </span>
          <span className="flex items-center gap-2">
            <Sparkline
              points={sparkSeries.activityPerHour}
              label="Atividade de leads e tarefas nas últimas 24 horas, por hora"
            />
            <span className="text-[11px] text-slate-500">Atividade · 24h</span>
          </span>
          <span className="text-[11px] text-slate-600">
            <kbd className="rounded border border-white/[.12] bg-white/[.03] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              r
            </kbd>{" "}
            atualizar
          </span>
          <span className="text-[11px] text-slate-600">
            <kbd className="rounded border border-white/[.12] bg-white/[.03] px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
              f
            </kbd>{" "}
            apresentação
          </span>
        </div>
        </div>
        {/* Bloco de menor valor decisório da tela: perde as até 10 bordas, mas MANTÉM
            a grade (empilhar em coluna única faria a régua virar a lista mais alta da
            página) e a hairline de topo que a separa da faixa de telemetria. Os itens
            passam a ser <li> de verdade, então a AT volta a anunciar "lista de N". */}
        <nav aria-label="Régua de módulos" className="mt-3 border-t border-white/[.06] pt-3">
          {moduleHealth.length ? (
            <ul className="grid gap-x-4 sm:grid-cols-2 xl:grid-cols-5">
              {moduleHealth.map((module) => (
                <li key={module.id}>
                  <Link
                    href={module.href}
                    title={`${module.label}: ${module.detail}`}
                    className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 transition-colors hover:bg-white/[.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        module.state === "operational"
                          ? "bg-[var(--atlas-success)]"
                          : module.state === "degraded"
                            ? "bg-[var(--atlas-warning)]"
                            : "bg-[var(--atlas-danger)]"
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium text-white">
                        {module.label}
                      </span>
                      <span className="block truncate text-[10px] text-slate-500">
                        {module.detail}
                      </span>
                    </span>
                    <span className="cc6-num shrink-0 text-xs font-semibold text-slate-300">
                      {module.count ?? "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-500">
              Régua de módulos indisponível — restabeleça a conexão para voltar a navegar com
              contagens e estado de saúde.
            </p>
          )}
        </nav>
        </>
        )}
      </section>

      {/* TERCIÁRIO · saúde operacional dos módulos + orientação de escrita segura.
          Fronteira protegida única (fetch a /api/v1/core-v2/module-health, sem
          leitura direta ao banco). Restaura a governança CC-6 dos cinco módulos
          prioritários com semáforo e ação de escrita segura. */}
      <CommandCenterModuleHealth />

      {warnings.length ? (
        <AtlasRecoverableError
          title="Atualização parcial da sala de comando"
          description={warnings.join(" · ")}
          onRetry={() => void load()}
          busy={loading}
          scope="page"
        />
      ) : null}

      <section
        aria-label="Agora e sinais da IA"
        className="grid gap-4 xl:grid-cols-[1.05fr_.95fr] [transform-style:preserve-3d]"
      >
        <div className={depthShell}>
          <AtlasCard>
            <AtlasCardHeader
              eyebrow="Pulso ao vivo"
              title="Agora"
              description="Novos leads e movimentos recentes, atualizados automaticamente."
              action={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="text-xs tabular-nums text-slate-500">
                    {liveFeed.length} movimento(s)
                  </span>
                  <AtlasBadge tone={liveConnected ? "success" : "neutral"}>
                    {liveConnected ? "TEMPO REAL" : "ATUALIZAÇÃO SEGURA"}
                  </AtlasBadge>
                  <LayerToggle
                    collapsed={collapsedLayers.feed}
                    onToggle={() => toggleLayer("feed")}
                    layerLabel="feed ao vivo"
                  />
                </div>
              }
            />
            {collapsedLayers.feed ? null : (
            <div className={`border-t border-white/[.06] ${layerBodyPad}`}>
              {liveFeed.length ? (
                /* O `.cc23-row` fica no li (não no Link): assim o
                   `.cc23-rows > .cc23-row:first-child` casa e o Link conserva o próprio
                   anel de foco e os 44px de alvo de toque, que o `.cc23-row` engoliria. */
                <ul className="cc23-rows" aria-live="polite">
                  {liveFeed.map((event) => (
                    <li key={event.id} className="cc23-row">
                      <Link
                        href={event.href}
                        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-2 transition-colors hover:bg-white/[.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-medium text-white">{event.title}</span>
                            <span className="block text-xs text-slate-500">{event.detail}</span>
                          </span>
                          {event.isNew ? <AtlasBadge tone="info">NOVO</AtlasBadge> : null}
                        </span>
                        <span className="shrink-0 text-xs tabular-nums text-slate-500">
                          {relativeTimestamp(event.when, nowMs)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <AtlasEmpty
                  reason="no-activity"
                  title="Sem movimentos recentes"
                  description="Assim que um lead entrar ou uma tarefa mudar, o feed atualiza sozinho."
                />
              )}
            </div>
            )}
          </AtlasCard>
        </div>

        <div className={depthShell}>
          <AtlasCard>
            <AtlasCardHeader
              eyebrow="Camada IA"
              title={isBroker ? "Sinais de atenção da sua carteira" : "O que a IA está sinalizando"}
              description={
                isBroker
                  ? "Sinais explicáveis da sua carteira. A IA aponta; a decisão é sua."
                  : "Sinais priorizados por severidade dentro do seu escopo autorizado."
              }
              action={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <span className="text-xs tabular-nums text-slate-500">
                    {iaNewCount} novos · {iaSeenCount} vistos
                  </span>
                  {iaSeenCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowSeenSignals((current) => !current)}
                      aria-pressed={showSeenSignals}
                      className="inline-flex min-h-11 items-center rounded-full border border-white/[.07] bg-white/[.02] px-4 text-xs font-medium text-slate-300 transition-colors hover:border-white/[.12] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                    >
                      {showSeenSignals ? "Ocultar vistos" : "Mostrar vistos"}
                    </button>
                  ) : null}
                  {briefing && !isBroker ? (
                    <AtlasBadge tone={briefing.status === "critical" ? "danger" : briefing.status === "attention" ? "warning" : "success"}>
                      {briefing.status === "critical" ? "CRÍTICO" : briefing.status === "attention" ? "ATENÇÃO" : "SAUDÁVEL"}
                    </AtlasBadge>
                  ) : null}
                  <LayerToggle
                    collapsed={collapsedLayers.ia}
                    onToggle={() => toggleLayer("ia")}
                    layerLabel="IA"
                  />
                </div>
              }
            />
            {collapsedLayers.ia ? null : (
            <div className={`border-t border-white/[.06] ${layerBodyPad}`}>
              {isBroker ? (
                !brokerDaily ? (
                  <AtlasSkeleton className="h-48 w-full" />
                ) : visibleAttentionQueue.length ? (
                  /* Borda cheia vira hairline e a origem-IA passa a ser marcada pelo seam
                     de 1px no acento. A ordem do DOM não muda (o Tab continua seguindo a
                     leitura). O primeiro item não leva hairline para não encostar na
                     borda do corpo do card. */
                  <ul className="cc23-rows">
                    {visibleAttentionQueue.slice(0, 6).map((item, index) => {
                      const seen = seenSignalSet.has(item.leadId);
                      return (
                        <li
                          key={item.leadId}
                          className={`cc23-seam py-3 transition-colors hover:bg-white/[.02] ${index === 0 ? "" : "cc6-hairline"} ${seen ? "opacity-60" : ""}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <Link
                              href={`/leads/${item.leadId}`}
                              className="min-w-0 flex-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                            >
                              <span className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-medium text-white">{item.leadName}</span>
                                <AtlasBadge tone={attentionTone(item.topSeverity)}>
                                  {item.topSeverity === "critical" ? "CRÍTICO" : item.topSeverity === "warning" ? "ATENÇÃO" : "INFO"}
                                </AtlasBadge>
                              </span>
                              <span className="mt-1 block text-xs text-slate-400">{item.topReason}</span>
                              <span className="mt-1 block text-xs text-slate-500">
                                Score {item.score} · etapa {item.status}
                                {item.signals.length > 1 ? ` · +${item.signals.length - 1} sinal(is)` : ""}
                              </span>
                            </Link>
                            <button
                              type="button"
                              onClick={() => toggleSignalSeen(item.leadId)}
                              aria-pressed={seen}
                              aria-label={
                                seen
                                  ? `Marcar sinal de ${item.leadName} como não visto`
                                  : `Marcar sinal de ${item.leadName} como visto`
                              }
                              title={seen ? "Marcar como não visto" : "Marcar como visto"}
                              className={quickActionClass}
                            >
                              <span aria-hidden="true">✓</span>
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                ) : brokerAttentionQueue.length ? (
                  <AtlasEmpty
                    reason="completed"
                    title="Sinais triados"
                    description={`Todos os ${brokerAttentionQueue.length} sinais foram marcados como vistos. Use "Mostrar vistos" para revê-los.`}
                  />
                ) : (
                  <AtlasEmpty
                    reason="completed"
                    title="Nenhum sinal ativo"
                    description="Nenhum lead da sua carteira está parado, com follow-up vencido ou quente sem contato."
                  />
                )
              ) : briefingUnavailable ? (
                <AtlasEmpty
                  reason="not-configured"
                  title="Sinais indisponíveis agora"
                  description="A leitura preditiva não respondeu. Os demais painéis seguem atualizando normalmente."
                />
              ) : !briefing ? (
                <AtlasSkeleton className="h-48 w-full" />
              ) : !visibleBriefingSignals.length && briefingSignals.length ? (
                <AtlasEmpty
                  reason="completed"
                  title="Sinais triados"
                  description={`Todos os ${briefingSignals.length} sinais foram marcados como vistos. Use "Mostrar vistos" para revê-los.`}
                />
              ) : (
                /* Mesmo tratamento do card gêmeo do corretor: hairline + seam de IA, com
                   a ordem do DOM preservada (título, badge, visto, evidência, ação), para
                   foco e leitura visual continuarem casados. */
                <ul className="cc23-rows">
                  {visibleBriefingSignals.slice(0, 6).map((signal, index) => {
                    const seen = seenSignalSet.has(signal.id);
                    return (
                      <li
                        key={signal.id}
                        className={`cc23-seam py-3 ${index === 0 ? "" : "cc6-hairline"} ${seen ? "opacity-60" : ""}`}
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium text-white">{signal.title}</span>
                          <span className="flex items-center gap-2">
                            <AtlasBadge tone={briefingTone(signal.severity)}>
                              {signal.severity === "critical"
                                ? "CRÍTICO"
                                : signal.severity === "attention"
                                  ? "ATENÇÃO"
                                  : signal.severity === "opportunity"
                                    ? "OPORTUNIDADE"
                                    : "SAUDÁVEL"}
                            </AtlasBadge>
                            <button
                              type="button"
                              onClick={() => toggleSignalSeen(signal.id)}
                              aria-pressed={seen}
                              aria-label={
                                seen
                                  ? `Marcar sinal ${signal.title} como não visto`
                                  : `Marcar sinal ${signal.title} como visto`
                              }
                              title={seen ? "Marcar como não visto" : "Marcar como visto"}
                              className={quickActionClass}
                            >
                              <span aria-hidden="true">✓</span>
                            </button>
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-400">{signal.evidence}</p>
                        <Link
                          href={signal.href}
                          className="mt-2 inline-flex min-h-11 items-center text-xs font-semibold text-[var(--atlas-accent)] hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                        >
                          {signal.action} →
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {/* Rodapé de cobertura: o que a IA não enxerga fica FORA da fila
                  de sinais — é propriedade do sistema, não alerta do dia. */}
              {briefing?.coverage?.blindSpots?.length ? (
                <p className="cc6-hairline mt-3 pt-3 text-[11px] leading-5 text-slate-500">
                  O que este painel não enxerga:{" "}
                  {briefing.coverage.blindSpots.map((spot) => `${spot.title} (${spot.reason})`).join("; ")}.
                </p>
              ) : null}
            </div>
            )}
          </AtlasCard>
        </div>
      </section>

      {isBroker ? (
        <section aria-label="Fila do dia" className="[transform-style:preserve-3d]">
          <div className={depthShell}>
            <AtlasCard>
              <AtlasCardHeader
                eyebrow="Camada corretor"
                title="Fila do dia"
                description="Quem atender agora, por que entrou na fila e a próxima melhor ação — com atalhos de um clique."
                action={
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {brokerDaily ? (
                      <AtlasBadge tone={brokerDaily.priorities.length ? "info" : "success"}>
                        {brokerDaily.priorities.length
                          ? `${brokerDaily.priorities.length} NA FILA`
                          : "FILA CONCLUÍDA"}
                      </AtlasBadge>
                    ) : null}
                    <LayerToggle
                      collapsed={collapsedLayers.fila}
                      onToggle={() => toggleLayer("fila")}
                      layerLabel="fila do dia"
                    />
                  </div>
                }
              />
              {collapsedLayers.fila ? null : (
              <div className={`border-t border-white/[.06] ${layerBodyPad}`}>
                {!brokerDaily ? (
                  <AtlasSkeleton className="h-56 w-full" />
                ) : brokerDaily.priorities.length ? (
                  /* Superfície de trabalho do corretor: N cards bordados dentro de um
                     AtlasCard viravam caixa-dentro-de-caixa em série. O wrapper interno
                     com flex-wrap FICA (é ele que empurra as 4 ações para a segunda linha
                     no mobile) e ganha w-full para o justify-between não colapsar agora
                     que o article virou flex container. */
                  <div className="cc23-rows">
                    {brokerDaily.priorities.map((item, index) => {
                      const contact = phoneLinks(phoneByLead.get(item.leadId) ?? "");
                      const urgent = /sla|vencid|atrasad/i.test(item.reason);
                      return (
                        <article
                          key={item.leadId}
                          className="cc23-row transition-colors hover:bg-white/[.02]"
                        >
                          <div className="flex w-full flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 items-start gap-3">
                              <span
                                aria-hidden="true"
                                className="grid h-8 w-8 shrink-0 place-items-center text-xs font-semibold tabular-nums text-[var(--atlas-accent)]"
                              >
                                {index + 1}
                              </span>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Link
                                    href={`/leads/${item.leadId}`}
                                    className="font-semibold text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                                  >
                                    {item.leadName}
                                  </Link>
                                  <AtlasBadge tone={urgent ? "danger" : item.hot ? "warning" : "info"}>
                                    {item.reason}
                                  </AtlasBadge>
                                </div>
                                <p className="mt-1 text-sm leading-6 text-slate-300">{item.nextBestAction}</p>
                                <p className="mt-1 text-xs text-slate-500">
                                  Score {item.score} · etapa {item.status} · {item.conversionProbability}% de conversão estimada
                                  {item.dueAt
                                    ? ` · prazo ${new Date(item.dueAt).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`
                                    : ""}
                                </p>
                              </div>
                            </div>
                            <div
                              className="flex shrink-0 items-center gap-2"
                              role="group"
                              aria-label={`Ações rápidas para ${item.leadName}`}
                            >
                              <Link
                                href={`/leads/${item.leadId}`}
                                aria-label={`Abrir lead ${item.leadName}`}
                                title="Abrir lead"
                                className={quickActionClass}
                              >
                                <span aria-hidden="true">👁</span>
                              </Link>
                              {contact ? (
                                <a
                                  href={contact.call}
                                  aria-label={`Ligar para ${item.leadName}`}
                                  title="Ligar"
                                  className={quickActionClass}
                                >
                                  <span aria-hidden="true">📞</span>
                                </a>
                              ) : null}
                              {contact ? (
                                <a
                                  href={contact.whatsapp}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Abrir WhatsApp com ${item.leadName}`}
                                  title="WhatsApp"
                                  className={quickActionClass}
                                >
                                  <span aria-hidden="true">💬</span>
                                </a>
                              ) : null}
                              <button
                                type="button"
                                aria-label={`Preparar abordagem com IA para ${item.leadName}`}
                                title="Preparar com IA"
                                className={quickActionClass}
                                onClick={() =>
                                  openCopilot(
                                    "Prepare uma abordagem curta para esta lead usando apenas o contexto autorizado. Explique a recomendação e não envie mensagem nem altere o CRM.",
                                    {
                                      leadId: item.leadId,
                                      status: item.status,
                                      score: item.score,
                                      reason: item.reason,
                                      nextBestAction: item.nextBestAction,
                                      conversionProbability: item.conversionProbability,
                                    },
                                  )
                                }
                              >
                                <span aria-hidden="true">✦</span>
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <AtlasEmpty
                    reason="completed"
                    title="Fila do dia concluída"
                    description="Sua carteira não possui ação urgente neste momento."
                  />
                )}
              </div>
              )}
            </AtlasCard>
          </div>
        </section>
      ) : null}

      {managementQueue ? (
        <section aria-label="Camada gestão" className="[transform-style:preserve-3d]">
          <div className={depthShell}>
            <AtlasCard>
              <AtlasCardHeader
                eyebrow="Camada gestão"
                title={managementQueue.title}
                description={managementQueue.description}
                action={
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {managementQueue.ready ? (
                      <AtlasBadge tone={managementQueue.items.length ? "warning" : "success"}>
                        {managementQueue.items.length
                          ? `${managementQueue.items.length} PARA REVISAR`
                          : "SEM EXCEÇÕES"}
                      </AtlasBadge>
                    ) : null}
                    <LayerToggle
                      collapsed={collapsedLayers.fila}
                      onToggle={() => toggleLayer("fila")}
                      layerLabel="fila de gestão"
                    />
                  </div>
                }
              />
              {collapsedLayers.fila ? null : (
              <div className={`border-t border-white/[.06] ${layerBodyPad}`}>
                {isManager && teamSla ? (
                  /* Três pílulas desenhadas à mão viram o primitivo que já existe.
                     `whitespace-normal!` é necessário porque `.cc6-chip` fixa
                     `white-space: nowrap` fora de @layer, e estes rótulos são longos o
                     bastante para forçar rolagem horizontal em 320px. */
                  <div className="mb-4 flex flex-wrap gap-2 text-xs text-slate-400">
                    <span className="cc6-chip whitespace-normal!">
                      SLA de follow-up:{" "}
                      {teamSla.totals.followUpComplianceRate === null
                        ? "sem amostra"
                        : `${teamSla.totals.followUpComplianceRate}%`}
                    </span>
                    <span className="cc6-chip whitespace-normal!">
                      {teamSla.totals.firstContactOverdue} sem primeiro contato
                    </span>
                    <span className="cc6-chip whitespace-normal!">
                      {teamSla.totals.brokersWithAlerts} corretor(es) com alerta
                    </span>
                  </div>
                ) : null}
                {!managementQueue.ready ? (
                  <AtlasSkeleton className="h-40 w-full" />
                ) : managementQueue.items.length ? (
                  /* Fila de exceção da liderança: coluna única e densa, para a varredura
                     ir do mais severo ao menos sem borda concorrente. O Link continua
                     `block` (os três spans empilhados dependem disso) e mantém o próprio
                     anel de foco — `.cc23-row` NÃO vai no focável, porque o
                     `.cc23-row:focus-visible` do CSS resolve para outline inválido. */
                  <div className="cc23-quiet">
                    <ul className="cc23-rows">
                      {managementQueue.items.map((item, index) => (
                        <li key={item.key} className={index === 0 ? "" : "cc6-hairline"}>
                          <Link
                            href={item.href}
                            className="block rounded-lg px-2 py-3 transition-colors hover:bg-white/[.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]"
                          >
                            <span className="flex flex-wrap items-center gap-2">
                              <AtlasBadge tone={interventionTone(item.severity)}>
                                {item.severity === "critical" ? "AGORA" : item.severity === "attention" ? "ATENÇÃO" : "EQUILÍBRIO"}
                              </AtlasBadge>
                              <span className="text-sm font-medium text-white">{item.label}</span>
                            </span>
                            <span className="mt-2 block text-xs leading-5 text-slate-400">{item.reason}</span>
                            <span className="mt-2 block text-xs font-semibold text-[var(--atlas-accent)]">
                              {item.action} →
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <AtlasEmpty
                    reason="completed"
                    title="Sem exceções críticas"
                    description="O escopo visível não apresenta intervenção urgente neste momento."
                  />
                )}
              </div>
              )}
            </AtlasCard>
          </div>
        </section>
      ) : null}

      {/* A antiga "Saúde dos módulos" foi fundida na régua de módulos da camada
          terciária; a governança segue exclusiva da diretoria. */}
      {isDirector ? (
        <section
          aria-label="Governança e pulso do sistema"
          className="[transform-style:preserve-3d]"
        >
          <div className={depthShell}>
            <AtlasCard>
              <AtlasCardHeader
                eyebrow="Governança · diretoria"
                title="Pulso do sistema"
                description="Gates críticos, filas e custo medido — visão exclusiva da diretoria."
                action={
                  governance ? (
                    <AtlasBadge tone={governance.status === "ready" ? "success" : governance.status === "blocked" ? "danger" : "warning"}>
                      {governance.status === "ready" ? "PRONTO" : governance.status === "blocked" ? "BLOQUEADO" : "SEM EVIDÊNCIA"}
                    </AtlasBadge>
                  ) : undefined
                }
              />
              <div className="border-t border-white/[.06] p-5 sm:p-6">
                {governanceNote ? (
                  <p className="cc23-quiet text-sm text-slate-400">{governanceNote}</p>
                ) : !governance ? (
                  <AtlasSkeleton className="h-48 w-full" />
                ) : (
                  <div className="space-y-4">
                    {/* Números de SISTEMA: recuam para contexto em lista densa, sem
                        escala de herói — quem decide aqui são os gates críticos e as
                        métricas comerciais, não a latência do banco. */}
                    <div className="cc23-quiet">
                      <ul className="cc23-rows">
                        <li className="cc23-row">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-slate-500">Banco</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {governance.health.databaseOk ? "Consulta aprovada" : "Sem evidência"}
                            </p>
                          </div>
                          <span className="cc6-metric-value text-xl">
                            {governance.health.databaseLatencyMs} ms
                          </span>
                        </li>
                        <li className="cc23-row">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-slate-500">Fila de integração</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {governance.queues.failedOutbox ?? "—"} falhas ou dead letter
                            </p>
                          </div>
                          <span className="cc6-metric-value text-xl">
                            {governance.queues.pendingOutbox ?? "—"}
                          </span>
                        </li>
                        <li className="cc23-row">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-slate-500">Custo IA · 30 dias</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {governance.ai.calls30d} chamadas medidas
                            </p>
                          </div>
                          <span className="cc6-metric-value text-xl">
                            {governance.ai.measured
                              ? `US$ ${governance.ai.estimatedCostUsd30d.toFixed(2)}`
                              : "—"}
                          </span>
                        </li>
                        <li className="cc23-row">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs text-slate-500">Homologação</p>
                            <p className="mt-0.5 text-xs text-slate-500">
                              {governance.homologation.failed ?? "—"} reprovações
                            </p>
                          </div>
                          <span className="cc6-metric-value text-xl">
                            {governance.homologation.passed ?? "—"}
                          </span>
                        </li>
                      </ul>
                    </div>
                    <div className="flex flex-wrap gap-2" aria-label="Gates críticos">
                      {Object.entries(governance.critical).map(([key, value]) => (
                        <span
                          key={key}
                          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/[.07] px-4 text-xs text-slate-300"
                        >
                          <span
                            aria-hidden="true"
                            className={`h-2 w-2 rounded-full ${
                              value === true
                                ? "bg-[var(--atlas-success)]"
                                : value === false
                                  ? "bg-[var(--atlas-danger)]"
                                  : "bg-[var(--atlas-warning)]"
                            }`}
                          />
                          {criticalGateLabels[key] || key}
                        </span>
                      ))}
                    </div>
                    <p className="text-right text-[11px] text-slate-600">
                      Atualizado em {new Date(governance.generatedAt).toLocaleString("pt-BR")} ·{" "}
                      {governance.health.hosting} · {governance.health.environment}
                    </p>
                  </div>
                )}
              </div>
            </AtlasCard>
          </div>
        </section>
      ) : null}

      <p className="text-center text-[11px] text-slate-600">
        A IA sugere e explica; nenhuma ação é executada sem a sua confirmação.
      </p>
    </div>
  );
}
