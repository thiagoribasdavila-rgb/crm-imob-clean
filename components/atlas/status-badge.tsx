import type { ReactNode } from "react";
import { AtlasBadge } from "@/components/ui/AtlasUI";
import {
  resolveOperationalState,
  type OperationalState,
  type OperationalTone,
} from "@/lib/ui/operational-state";

type StatusBadgeProps = {
  children?: ReactNode;
  tone?: OperationalTone;
  state?: OperationalState | string;
  showSymbol?: boolean;
};

export function StatusBadge({ children, tone, state, showSymbol = false }: StatusBadgeProps) {
  const definition = resolveOperationalState(state);
  const resolvedTone = tone ?? (state ? definition.tone : "neutral");
  const content = children ?? definition.label;
  return (
    <AtlasBadge
      tone={resolvedTone}
      operationalState={state ? definition.state : undefined}
      title={state ? definition.meaning : undefined}
    >
      {showSymbol && state ? <span aria-hidden="true">{definition.symbol} </span> : null}
      {content}
    </AtlasBadge>
  );
}
