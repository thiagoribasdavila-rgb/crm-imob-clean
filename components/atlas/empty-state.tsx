import type { ReactNode } from "react";
import { AtlasEmpty, type AtlasEmptyReason } from "@/components/ui/AtlasUI";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  reason?: AtlasEmptyReason;
  eyebrow?: string;
};

export function EmptyState({ title, description, action, reason, eyebrow }: EmptyStateProps) {
  return <AtlasEmpty title={title} description={description} action={action} reason={reason} eyebrow={eyebrow} />;
}
