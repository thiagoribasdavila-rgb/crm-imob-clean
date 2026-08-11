import type { ReactNode } from "react";

export const ATLAS_DECISION_CARD_LAYERS = [
  "identity",
  "evidence",
  "relevance",
  "urgency",
  "primary-action",
  "explanation",
  "updated-at",
] as const;

export const ATLAS_DECISION_CARD_CONTRACT =
  "identity-evidence-relevance-urgency-primary-action-explanation-updated-at";

export const ATLAS_PROGRESSIVE_DECISION_LAYERS = [
  "decision-in-3s",
  "context-on-demand",
  "history-in-lead-360",
] as const;

export const ATLAS_PROGRESSIVE_DECISION_CONTRACT =
  "one-message-three-signals-one-action-before-disclosure";

export const ATLAS_ADAPTIVE_DENSITY_MODES = [
  "compact",
  "comfortable",
  "executive",
] as const;

export const ATLAS_ADAPTIVE_DENSITY_CONTRACT =
  "shared-data-role-device-density-primary-action-always-visible";

export type AtlasDecisionDensity =
  | "adaptive"
  | (typeof ATLAS_ADAPTIVE_DENSITY_MODES)[number];

export type AtlasDecisionTone =
  | "blue"
  | "green"
  | "amber"
  | "violet"
  | "rose";

export type AtlasDecisionUrgency = "now" | "today" | "monitor" | "none";

export type AtlasDecisionUpdateState =
  | "live"
  | "recent"
  | "stale"
  | "estimated";

export type AtlasDecisionCardProps = {
  identity: {
    eyebrow?: string;
    title: string;
    description?: string;
    badge?: ReactNode;
  };
  evidence: readonly {
    label: string;
    value: ReactNode;
    detail?: ReactNode;
  }[];
  relevance: {
    label: string;
    value: ReactNode;
    detail?: ReactNode;
    tone?: AtlasDecisionTone;
  };
  urgency: {
    label: string;
    value: ReactNode;
    detail?: ReactNode;
    level: AtlasDecisionUrgency;
  };
  primaryAction: {
    label: string;
    control: ReactNode;
    detail?: ReactNode;
  };
  explanation: {
    label?: string;
    value: ReactNode;
  };
  updatedAt: {
    value: ReactNode;
    source?: ReactNode;
    state?: AtlasDecisionUpdateState;
  };
  progressiveDisclosure?: {
    contextLabel?: string;
    historyControl?: ReactNode;
    defaultOpen?: boolean;
  };
  className?: string;
  density?: AtlasDecisionDensity;
  emphasis?: "standard" | "primary" | "quiet";
};

const decisionToneClasses: Record<AtlasDecisionTone, string> = {
  blue: "border-blue-400/20 bg-blue-400/[0.06] text-blue-200",
  green: "border-emerald-400/20 bg-emerald-400/[0.06] text-emerald-200",
  amber: "border-amber-400/20 bg-amber-400/[0.06] text-amber-200",
  violet: "border-violet-400/20 bg-violet-400/[0.06] text-violet-200",
  rose: "border-rose-400/20 bg-rose-400/[0.06] text-rose-200",
};

const urgencyClasses: Record<AtlasDecisionUrgency, string> = {
  now: "border-rose-400/25 bg-rose-400/[0.07] text-rose-200",
  today: "border-amber-400/25 bg-amber-400/[0.07] text-amber-200",
  monitor: "border-blue-400/20 bg-blue-400/[0.06] text-blue-200",
  none: "border-slate-700/70 bg-slate-900/35 text-slate-300",
};

const updateStateClasses: Record<AtlasDecisionUpdateState, string> = {
  live: "text-emerald-300",
  recent: "text-cyan-300",
  stale: "text-amber-300",
  estimated: "text-violet-300",
};

export function AtlasCard({
  children,
  className = "",
  density = "comfortable",
  emphasis = "standard",
  purpose = "work",
}: {
  children: ReactNode;
  className?: string;
  density?: AtlasDecisionDensity;
  emphasis?: "standard" | "primary" | "quiet";
  purpose?: "work" | "decision" | "queue" | "analysis";
}) {
  return (
    <section
      className={`atlas-panel atlas-panel-hover atlas-surface-card ${className}`.trim()}
      data-card-density={density}
      data-card-emphasis={emphasis}
      data-card-purpose={purpose}
    >
      {children}
    </section>
  );
}

export function AtlasCardHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="atlas-card-header flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
      <div className="min-w-0">
        {eyebrow ? <p className="atlas-eyebrow">{eyebrow}</p> : null}
        <h2 className="atlas-card-title mt-1 text-lg font-semibold text-white">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-400">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function AtlasMetric({
  label,
  value,
  detail,
  trend,
  tone = "blue",
  relevance = "supporting",
}: {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  trend?: ReactNode;
  tone?: "blue" | "green" | "amber" | "violet" | "rose";
  relevance?: "primary" | "supporting";
}) {
  return (
    <article
      className={`atlas-metric atlas-metric-${tone}`}
      data-card-purpose="metric"
      data-tone={tone}
      data-relevance={relevance}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-400">{label}</p>
        {trend ? (
          <span className="atlas-metric-trend">
            {trend}
          </span>
        ) : null}
      </div>
      <p className="atlas-metric-number mt-4 text-3xl font-semibold tracking-tight text-white">
        {value}
      </p>
      {detail ? (
        <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
      ) : null}
    </article>
  );
}

/**
 * Contrato visual canônico para cards que precisam apoiar uma decisão.
 *
 * O componente é deliberadamente server-safe: ações interativas entram como
 * ReactNode e continuam sob responsabilidade da superfície operacional.
 */
export function AtlasDecisionCard({
  identity,
  evidence,
  relevance,
  urgency,
  primaryAction,
  explanation,
  updatedAt,
  progressiveDisclosure,
  className = "",
  density = "adaptive",
  emphasis = "standard",
}: AtlasDecisionCardProps) {
  const relevanceTone = relevance.tone ?? "blue";
  const updateState = updatedAt.state ?? "recent";
  const [primaryEvidence, ...additionalEvidence] = evidence;
  const visibleSignalCount = Math.min(3, evidence.length + 2);

  return (
    <AtlasCard
      className={`atlas-decision-card overflow-hidden ${className}`.trim()}
      density={density}
      emphasis={emphasis}
      purpose="decision"
    >
      <article
        data-v3000-component="atlas-decision-card"
        data-decision-contract={ATLAS_DECISION_CARD_CONTRACT}
        data-decision-tone={relevanceTone}
        data-urgency-level={urgency.level}
        data-update-state={updateState}
        data-progressive-contract={ATLAS_PROGRESSIVE_DECISION_CONTRACT}
        data-adaptive-density={density}
      >
        <div data-progressive-layer="decision-in-3s">
          <div data-decision-layer="identity">
            <AtlasCardHeader
              eyebrow={identity.eyebrow}
              title={identity.title}
              action={identity.badge}
            />
          </div>

          <div
            className="grid gap-3 border-y border-slate-800/80 p-5 sm:grid-cols-3"
            data-visible-signal-count={visibleSignalCount}
          >
            <div
              className={`rounded-2xl border p-4 ${decisionToneClasses[relevanceTone]}`}
              data-decision-layer="relevance"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">
                {relevance.label}
              </p>
              <div className="mt-2 text-base font-semibold text-white">
                {relevance.value}
              </div>
              {relevance.detail ? (
                <div
                  className="mt-1 text-xs leading-5 text-slate-400"
                  data-density-detail="supporting"
                >
                  {relevance.detail}
                </div>
              ) : null}
            </div>

            <div
              className={`rounded-2xl border p-4 ${urgencyClasses[urgency.level]}`}
              data-decision-layer="urgency"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-70">
                {urgency.label}
              </p>
              <div className="mt-2 text-base font-semibold text-white">
                {urgency.value}
              </div>
              {urgency.detail ? (
                <div
                  className="mt-1 text-xs leading-5 text-slate-400"
                  data-density-detail="supporting"
                >
                  {urgency.detail}
                </div>
              ) : null}
            </div>

            <div
              className="rounded-2xl border border-slate-700/70 bg-slate-950/35 p-4"
              data-decision-layer="evidence"
            >
              {primaryEvidence ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {primaryEvidence.label}
                  </p>
                  <div className="mt-2 text-base font-semibold text-slate-100">
                    {primaryEvidence.value}
                  </div>
                  {primaryEvidence.detail ? (
                    <div
                      className="mt-1 text-xs leading-5 text-slate-500"
                      data-density-detail="supporting"
                    >
                      {primaryEvidence.detail}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>

          <div
            className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            data-decision-layer="primary-action"
            data-density-anchor="primary-action"
          >
            <div>
              <p className="text-xs font-semibold text-slate-200">
                {primaryAction.label}
              </p>
              {primaryAction.detail ? (
                <div className="mt-1 text-xs leading-5 text-slate-500">
                  {primaryAction.detail}
                </div>
              ) : null}
            </div>
            <div className="shrink-0">{primaryAction.control}</div>
          </div>
        </div>

        <details
          className="group border-t border-slate-800/80 bg-slate-950/30"
          data-progressive-layer="context-on-demand"
          open={progressiveDisclosure?.defaultOpen}
        >
          <summary className="cursor-pointer list-none px-5 py-4 text-xs font-semibold text-cyan-200 marker:hidden">
            {progressiveDisclosure?.contextLabel ??
              "Ver contexto e histórico"}
          </summary>

          <div className="border-t border-slate-800/80">
            {identity.description ? (
              <div className="px-5 py-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Contexto da decisão
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  {identity.description}
                </p>
              </div>
            ) : null}

            {additionalEvidence.length > 0 ? (
              <div className="grid gap-px border-t border-slate-800/80 bg-slate-800/70 sm:grid-cols-2">
                {additionalEvidence.map((item) => (
                  <div
                    className="bg-slate-950/75 px-5 py-4"
                    key={item.label}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                      {item.label}
                    </p>
                    <div className="mt-2 text-sm font-semibold text-slate-100">
                      {item.value}
                    </div>
                    {item.detail ? (
                      <div className="mt-1 text-xs leading-5 text-slate-500">
                        {item.detail}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}

            <div
              className="border-t border-slate-800/80 px-5 py-4"
              data-decision-layer="explanation"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {explanation.label ?? "Por que isso importa"}
              </p>
              <div className="mt-2 text-sm leading-6 text-slate-300">
                {explanation.value}
              </div>
            </div>

            {progressiveDisclosure?.historyControl ? (
              <div
                className="border-t border-slate-800/80 px-5 py-4"
                data-progressive-layer="history-in-lead-360"
              >
                {progressiveDisclosure.historyControl}
              </div>
            ) : null}

            <footer
              className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-800/80 px-5 py-3 text-[11px] text-slate-500"
              data-decision-layer="updated-at"
            >
              <span className={updateStateClasses[updateState]}>
                {updatedAt.value}
              </span>
              {updatedAt.source ? <span>{updatedAt.source}</span> : null}
            </footer>
          </div>
        </details>
      </article>
    </AtlasCard>
  );
}
