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

/*
 * CC-5: eyebrow mono uppercase com tracking largo, título tight (cascata do
 * visual system) e hairline inferior rgba(148,163,184,.12) fechando o header.
 * Utilitários com `!` vencem as regras atlas-page-* unlayered de globals.css
 * (que zeram border-bottom e padding).
 */
export function PageHeader({ eyebrow, title, description, action }: PageHeaderProps) {
  return (
    <header className="atlas-page-header border-b! border-b-[rgba(148,163,184,0.12)]! pb-5!">
      <div className="atlas-page-heading" data-information-depth="glance">
        {eyebrow ? (
          <p className="atlas-page-eyebrow font-mono text-[11px]! font-medium uppercase! tracking-[0.16em]! text-[#6b7890]! [font-variant-numeric:tabular-nums]">
            {eyebrow}
          </p>
        ) : null}
        <h1>{title}</h1>
        {description ? <p className="atlas-page-description">{description}</p> : null}
      </div>
      {action ? (
        <div
          className="atlas-page-actions"
          aria-label="Ação principal do contexto"
          data-action-count="1"
        >
          <AtlasActionLink {...action} className="atlas-page-action" showArrow />
        </div>
      ) : null}
    </header>
  );
}
