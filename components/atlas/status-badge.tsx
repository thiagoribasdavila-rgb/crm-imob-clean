import type { ReactNode } from "react";
import { AtlasBadge } from "@/components/ui/AtlasUI";

type StatusBadgeProps = {
  children: ReactNode;
  tone?: "neutral" | "info" | "success" | "warning" | "danger" | "violet";
};

export function StatusBadge({ children, tone = "neutral" }: StatusBadgeProps) {
  return <AtlasBadge tone={tone}>{children}</AtlasBadge>;
}
