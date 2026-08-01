import type { ReactNode } from "react";

const technicalFailurePattern = /(?:column\s+.+does not exist|could not find.+(?:table|column|schema)|schema cache|relation\s+.+does not exist|postgres|pgrst|prisma|syntaxerror|stack trace)/i;

function safeDescription(description: string) {
  return technicalFailurePattern.test(description)
    ? "O Atlas registrou a inconsistência. Seus dados continuam protegidos."
    : description;
}

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
      <p>{safeDescription(description)}</p>
      {action ? <div className="atlas-state-action">{action}</div> : null}
    </div>
  );
}
