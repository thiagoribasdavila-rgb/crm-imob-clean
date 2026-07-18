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
  action?: PageHeaderAction;
};

export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <header className="atlas-page-header">
      <div className="atlas-page-heading">
        {eyebrow ? <p className="atlas-page-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <p className="atlas-page-description">{description}</p> : null}
      </div>
      {action ? (
        <div className="atlas-page-actions" aria-label="Ação do contexto">
          <AtlasActionLink {...action} className="atlas-page-action" showArrow />
        </div>
      ) : null}
    </header>
  );
}
