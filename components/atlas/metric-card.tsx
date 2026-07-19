import type { ReactNode } from "react";
import { AtlasMetric } from "@/components/ui/AtlasCard";

type MetricCardProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  trend?: ReactNode;
  tone?: "info" | "success" | "warning" | "danger" | "violet" | "neutral";
  relevance?: "primary" | "supporting";
};

export function MetricCard({
  label,
  value,
  detail,
  trend,
  tone = "info",
  relevance = "supporting",
}: MetricCardProps) {
  const canonicalTone = {
    info: "blue",
    success: "green",
    warning: "amber",
    danger: "rose",
    violet: "violet",
    neutral: "blue",
  }[tone] as "blue" | "green" | "amber" | "rose" | "violet";

  return (
    <AtlasMetric
      label={label}
      value={value}
      detail={detail}
      trend={trend}
      tone={canonicalTone}
      relevance={relevance}
    />
  );
}
