import type { ReactNode } from "react";

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="atlas-state" role="status">
      <span className="atlas-state-icon" aria-hidden="true">◇</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="atlas-state-action">{action}</div> : null}
    </div>
  );
}
