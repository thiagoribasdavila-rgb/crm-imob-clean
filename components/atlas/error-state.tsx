import type { ReactNode } from "react";

type ErrorStateProps = {
  title?: string;
  description: string;
  action?: ReactNode;
};

export function ErrorState({
  title = "Não foi possível carregar",
  description,
  action,
}: ErrorStateProps) {
  return (
    <div className="atlas-state atlas-error-state" role="alert">
      <span className="atlas-state-icon" aria-hidden="true">!</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action ? <div className="atlas-state-action">{action}</div> : null}
    </div>
  );
}
