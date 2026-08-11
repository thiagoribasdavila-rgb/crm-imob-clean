import type { ReactNode } from "react";

export const ATLAS_RELIABLE_STATE_KINDS = [
  "loading",
  "empty",
  "partial",
  "stale",
  "recoverable-error",
  "permission-blocked",
  "success",
] as const;

export type AtlasReliableStateKind =
  (typeof ATLAS_RELIABLE_STATE_KINDS)[number];

export const ATLAS_RELIABLE_STATE_CONTRACT =
  "loading-empty-partial-stale-recoverable-permission-success-v1";

const technicalFailurePattern =
  /(?:column\s+.+does not exist|could not find.+(?:table|column|schema)|schema cache|relation\s+.+does not exist|postgres|pgrst|prisma|syntaxerror|stack trace|at\s+ignore-listed frames)/i;

const STATE_LABEL: Record<AtlasReliableStateKind, string> = {
  loading: "Sincronizando",
  empty: "Sem registros neste recorte",
  partial: "Leitura parcial",
  stale: "Atualização pendente",
  "recoverable-error": "Recuperação disponível",
  "permission-blocked": "Acesso restrito",
  success: "Atualização concluída",
};

export function safeOperationalDescription(description: string) {
  return technicalFailurePattern.test(description)
    ? "O Atlas registrou a inconsistência. Seus dados continuam protegidos."
    : description;
}

type ReliableStateProps = {
  kind: AtlasReliableStateKind;
  title?: string;
  description?: string;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  rows?: number;
  compact?: boolean;
  zeroMeaning?: "verified-empty" | "not-applicable";
  eyebrow?: string;
  emptyReason?: string;
};

/**
 * Estado operacional compartilhado e server-safe.
 *
 * Não consulta dados nem controla interação. A página entrega texto e ações
 * reais para que zero, falha, permissão e atualização nunca sejam ambíguos.
 */
export function ReliableState({
  kind,
  title,
  description,
  action,
  secondaryAction,
  rows = 3,
  compact = false,
  zeroMeaning,
  eyebrow,
  emptyReason,
}: ReliableStateProps) {
  const isLoading = kind === "loading";
  const isError = kind === "recoverable-error";
  const resolvedDescription = description
    ? safeOperationalDescription(description)
    : isLoading
      ? "Aguarde enquanto os dados desta área são confirmados."
      : "";
  const resolvedZeroMeaning =
    kind === "empty" ? zeroMeaning ?? "verified-empty" : undefined;

  return (
    <section
      className="atlas-reliable-state"
      data-reliable-state={kind}
      data-reliable-state-contract={ATLAS_RELIABLE_STATE_CONTRACT}
      data-zero-meaning={resolvedZeroMeaning}
      data-empty-reason={kind === "empty" ? emptyReason : undefined}
      data-data-safety={isError ? "protected" : undefined}
      data-recovery-action={
        isError ? (action ? "available" : "required") : undefined
      }
      data-density={compact ? "compact" : "comfortable"}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      aria-atomic="true"
      aria-busy={isLoading || undefined}
    >
      <div className="atlas-reliable-state-heading">
        <span className="atlas-reliable-state-symbol" aria-hidden="true" />
        <div>
          <span className="atlas-reliable-state-label">
            {eyebrow ?? STATE_LABEL[kind]}
          </span>
          {title ? <h2>{title}</h2> : null}
          {resolvedDescription ? <p>{resolvedDescription}</p> : null}
        </div>
      </div>

      {isLoading ? (
        <div
          className="atlas-reliable-state-skeleton"
          aria-label="Carregando detalhes desta área"
        >
          {Array.from({ length: rows }, (_, index) => (
            <span key={index} aria-hidden="true" />
          ))}
        </div>
      ) : null}

      {action || secondaryAction ? (
        <div className="atlas-reliable-state-actions">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </section>
  );
}
