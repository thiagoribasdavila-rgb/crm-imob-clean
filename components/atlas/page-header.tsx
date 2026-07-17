import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
};

export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return (
    <header className="atlas-page-header">
      <div className="atlas-page-heading">
        {eyebrow ? <p className="atlas-page-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="atlas-page-description">{description}</p> : null}
      </div>
      {actions ? <div className="atlas-page-actions">{actions}</div> : null}
    </header>
  );
}
