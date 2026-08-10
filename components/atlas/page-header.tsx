import {
  AtlasActionLink,
  type AtlasActionLinkProps,
} from "./action-link";

export type PageHeaderAction = Pick<
  AtlasActionLinkProps,
  "href" | "label" | "icon" | "priority" | "aria-label" | "title"
>;

type PageHeaderProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  decision?: string;
  action?: PageHeaderAction;
};

export function PageHeader({ eyebrow, title, description, decision, action }: PageHeaderProps) {
  return (
    <header
      className="atlas-page-header"
      data-v30-layout="decision-header"
      data-page-header="decision"
      data-header-density="compact"
      data-visible-action-count={action ? 1 : 0}
      data-primary-action-count={action?.priority === "secondary" ? 0 : action ? 1 : 0}
    >
      <div className="atlas-page-heading" data-information-depth="glance">
        {eyebrow ? <p className="atlas-page-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {decision ? <p className="atlas-page-decision">{decision}</p> : null}
        {description && decision ? (
          <details
            className="atlas-page-context-disclosure"
            data-information-depth="context"
          >
            <summary>Entender esta visão</summary>
            <p className="atlas-page-description">{description}</p>
          </details>
        ) : description ? (
          <p className="atlas-page-description">{description}</p>
        ) : null}
      </div>
      {action ? (
        <div
          className="atlas-page-actions"
          aria-label="Ação do contexto"
          data-action-count="1"
        >
          <AtlasActionLink {...action} className="atlas-page-action" showArrow />
        </div>
      ) : null}
    </header>
  );
}
