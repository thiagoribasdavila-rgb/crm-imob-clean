import type { ReactNode } from "react";

import { ATLAS_RELIABLE_STATE_CONTRACT } from "./reliable-state";

import {
  AtlasDetailDisclosure,
  AtlasMetricDeck,
  AtlasPriorityQueue,
  AtlasSection,
} from "./information-primitives";
import { PageHeader, type PageHeaderAction } from "./page-header";

export type V3000MetricDeck = {
  primary: ReactNode;
  secondary?: ReactNode;
  label?: string;
  secondaryLabel?: string;
};

export type V3000PriorityBlock = {
  title: string;
  description?: string;
  action?: ReactNode;
  content: ReactNode;
};

export type V3000Workspace = {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  content: ReactNode;
  density?: "compact" | "comfortable";
};

export type V3000Analysis = {
  label?: string;
  group?: string;
  content: ReactNode;
};

export type V3000PageTemplateProps = {
  eyebrow?: string;
  title: string;
  decision?: string;
  description?: string;
  action?: PageHeaderAction;
  feedback?: ReactNode;
  metrics?: V3000MetricDeck;
  priority?: V3000PriorityBlock;
  workspace: V3000Workspace;
  aside?: ReactNode;
  asideLabel?: string;
  analysis?: V3000Analysis;
  workspaceId?: string;
};

/**
 * Estrutura canônica das páginas V3000.
 *
 * O componente organiza conteúdo existente, mas não busca dados, controla
 * sessão ou cria estado cliente. Loading, vazio, falha recuperável e conteúdo
 * pronto entram pelos slots `feedback` e `workspace.content`.
 */
export function V3000PageTemplate({
  eyebrow,
  title,
  decision,
  description,
  action,
  feedback,
  metrics,
  priority,
  workspace,
  aside,
  asideLabel = "Contexto da operação",
  analysis,
  workspaceId = "atlas-v3000-workspace",
}: V3000PageTemplateProps) {
  return (
    <div
      className="atlas-v3000-page min-w-0 space-y-6"
      data-atlas-template="v3000"
      data-information-order="decision-metrics-priority-workspace-analysis"
      data-responsive-contract="mobile-first"
      data-focus-contract="skip-link-and-visible-ring"
      data-reliable-state-contract={ATLAS_RELIABLE_STATE_CONTRACT}
    >
      <a className="atlas-v3000-skip-link" href={`#${workspaceId}`}>
        Ir para a área de trabalho
      </a>

      <PageHeader
        eyebrow={eyebrow}
        title={title}
        decision={decision}
        description={description}
        action={action}
      />

      {feedback ? (
        <div
          aria-atomic="true"
          aria-live="polite"
          data-page-feedback="reliable-operational-state"
          data-reliable-state-system="loading-empty-partial-stale-error-permission-success"
        >
          {feedback}
        </div>
      ) : null}

      {metrics ? (
        <AtlasMetricDeck
          primary={metrics.primary}
          secondary={metrics.secondary}
          label={metrics.label}
          secondaryLabel={metrics.secondaryLabel}
        />
      ) : null}

      {priority ? (
        <AtlasPriorityQueue
          title={priority.title}
          description={priority.description}
          action={priority.action}
        >
          {priority.content}
        </AtlasPriorityQueue>
      ) : null}

      <div
        className={
          aside
            ? "grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.32fr)]"
            : "min-w-0"
        }
        data-workspace-layout={aside ? "workspace-with-context" : "workspace-only"}
      >
        <div
          id={workspaceId}
          className="atlas-v3000-focus-target min-w-0"
          role="region"
          aria-label={workspace.title}
          tabIndex={-1}
          data-workspace-focus-target="true"
        >
          <AtlasSection
            title={workspace.title}
            description={workspace.description}
            eyebrow={workspace.eyebrow}
            action={workspace.action}
            density={workspace.density}
          >
            {workspace.content}
          </AtlasSection>
        </div>

        {aside ? (
          <aside className="min-w-0 self-start" aria-label={asideLabel}>
            {aside}
          </aside>
        ) : null}
      </div>

      {analysis ? (
        <AtlasDetailDisclosure label={analysis.label} group={analysis.group}>
          {analysis.content}
        </AtlasDetailDisclosure>
      ) : null}
    </div>
  );
}
