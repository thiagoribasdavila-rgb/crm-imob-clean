import type { ReactNode } from "react";

type MetricCardProps = {
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  trend?: ReactNode;
  tone?: "info" | "success" | "warning" | "danger" | "violet";
};

export function MetricCard({
  label,
  value,
  detail,
  trend,
  tone = "info",
}: MetricCardProps) {
  return (
    <article className="atlas-official-metric" data-tone={tone}>
      <div className="atlas-metric-heading">
        <span>{label}</span>
        {trend ? <span className="atlas-metric-trend">{trend}</span> : null}
      </div>
      <strong className="atlas-metric-value">{value}</strong>
      {detail ? <p className="atlas-metric-detail">{detail}</p> : null}
    </article>
  );
}
