import type { ReactNode } from "react";
import {
  ReliableState,
  type AtlasReliableStateKind,
} from "./reliable-state";

type ErrorStateProps = {
  title?: string;
  description: string;
  action?: ReactNode;
  kind?: Extract<
    AtlasReliableStateKind,
    "partial" | "stale" | "recoverable-error" | "permission-blocked"
  >;
};

export function ErrorState({
  title = "Não foi possível carregar",
  description,
  action,
  kind = "recoverable-error",
}: ErrorStateProps) {
  return (
    <ReliableState
      kind={kind}
      title={title}
      description={description}
      action={action}
    />
  );
}
