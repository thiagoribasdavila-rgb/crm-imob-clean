import type { ReactNode } from "react";

type AtlasSectionProps = {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  density?: "compact" | "comfortable";
};

export function AtlasSection({
  title,
  description,
  eyebrow,
  action,
  children,
  density = "comfortable",
}: AtlasSectionProps) {
  return (
    <section className="atlas-information-section" data-section-density={density}>
      <header className="atlas-section-heading">
        <div>
          {eyebrow ? <p className="atlas-section-eyebrow">{eyebrow}</p> : null}
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action ? <div className="atlas-section-action">{action}</div> : null}
      </header>
      {children}
    </section>
  );
}

export function AtlasDecisionStrip({
  children,
  label = "Indicadores para decisão",
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <section className="atlas-decision-strip" aria-label={label}>
      {children}
    </section>
  );
}

export function AtlasPriorityQueue({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="atlas-priority-queue">
      <header className="atlas-priority-heading">
        <div>
          <p className="atlas-section-eyebrow">Prioridade</p>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {action}
      </header>
      <div className="atlas-priority-content">{children}</div>
    </section>
  );
}

export function AtlasDetailDisclosure({
  label = "Ver detalhes",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <details className="atlas-detail-disclosure">
      <summary>{label}</summary>
      <div className="atlas-detail-content">{children}</div>
    </details>
  );
}
