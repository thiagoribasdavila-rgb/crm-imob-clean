import type { ReactNode } from "react";
import type { AtlasEmptyReason } from "@/components/ui/AtlasUI";
import { ReliableState } from "./reliable-state";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  reason?: AtlasEmptyReason;
  eyebrow?: string;
};

export function EmptyState({
  title,
  description,
  action,
  reason,
  eyebrow,
}: EmptyStateProps) {
  return (
    <ReliableState
      kind="empty"
      title={title}
      description={description}
      action={action}
      zeroMeaning="verified-empty"
      emptyReason={reason}
      eyebrow={eyebrow}
    />
  );
}
