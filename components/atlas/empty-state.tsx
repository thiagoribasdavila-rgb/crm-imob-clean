import type { ReactNode } from "react";
import { AtlasEmpty } from "@/components/ui/AtlasUI";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return <AtlasEmpty title={title} description={description} action={action} />;
}
