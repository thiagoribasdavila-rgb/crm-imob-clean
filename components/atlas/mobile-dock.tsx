"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  getAtlasMobileNavigationForIdentity,
  getAtlasTaskActionForPathname,
} from "@/lib/atlas/navigation";
import type { ShellIdentity } from "./shell-types";

export function MobileDock({ identity }: { identity: Pick<ShellIdentity, "role" | "accessRole"> }) {
  const pathname = usePathname();
  const items = getAtlasMobileNavigationForIdentity(identity);
  const contextualAction = getAtlasTaskActionForPathname(pathname, identity);
  const primaryAction = contextualAction && !items.some((item) => item.href === contextualAction.href)
    ? contextualAction
    : { label: "Novo lead", href: "/leads/new", icon: "＋" };
  const leadingItems = items.slice(0, 2);
  const trailingItems = items.slice(2);

  const renderItem = (item: (typeof items)[number]) => {
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

    return (
      <Link
        key={item.href}
        href={item.href}
        className="atlas-mobile-dock-action"
        data-active={active ? "true" : "false"}
        aria-current={active ? "page" : undefined}
      >
        <span aria-hidden="true">{item.icon}</span>
        <small>{item.label}</small>
      </Link>
    );
  };

  return (
    <nav className="atlas-mobile-dock" aria-label="Navegação e ação rápida">
      {leadingItems.map(renderItem)}
      <Link
        href={primaryAction.href}
        className="atlas-mobile-dock-action"
        data-primary="true"
        aria-label={`Ação rápida: ${primaryAction.label}`}
        title={primaryAction.label}
      >
        <span aria-hidden="true">{primaryAction.icon}</span>
        <small>{primaryAction.label}</small>
      </Link>
      {trailingItems.map(renderItem)}
    </nav>
  );
}
