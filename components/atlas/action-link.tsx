import type { ComponentProps } from "react";
import Link from "next/link";

export type AtlasActionPriority = "primary" | "secondary";

export type AtlasActionLinkProps = Omit<ComponentProps<typeof Link>, "children"> & {
  label: string;
  icon?: string;
  priority?: AtlasActionPriority;
  showArrow?: boolean;
};

export function AtlasActionLink({
  label,
  icon,
  priority = "primary",
  showArrow = false,
  className = "",
  ...props
}: AtlasActionLinkProps) {
  const priorityClass = priority === "primary"
    ? "atlas-button-primary"
    : "atlas-button-secondary";

  return (
    <Link
      {...props}
      className={`atlas-action-link ${priorityClass} ${className}`.trim()}
      data-atlas-action-priority={priority}
      aria-label={props["aria-label"] ?? label}
    >
      {icon ? <span className="atlas-action-icon" aria-hidden="true">{icon}</span> : null}
      <strong className="atlas-action-label">{label}</strong>
      {showArrow ? <span className="atlas-action-arrow" aria-hidden="true">→</span> : null}
    </Link>
  );
}
