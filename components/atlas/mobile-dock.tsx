"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getAtlasMobileNavigationForIdentity } from "@/lib/atlas/navigation";
import type { ShellIdentity } from "./shell-types";

/* legacy catalog removed in phase 004
  { label: "Início", href: "/dashboard", icon: "⌘" },
  { label: "Leads", href: "/leads", icon: "◎" },
  { label: "Pipeline", href: "/pipeline", icon: "⌁" },
  { label: "Tarefas", href: "/tasks", icon: "✓" },
*/

export function MobileDock({ identity }: { identity: Pick<ShellIdentity, "role" | "accessRole"> }) {
  const pathname = usePathname();
  const items = getAtlasMobileNavigationForIdentity(identity);

  return (
    <nav className="atlas-mobile-dock" aria-label="Ações rápidas">
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`);
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
      })}
      <button
        type="button"
        className="atlas-mobile-dock-action"
        onClick={() =>
          window.dispatchEvent(new Event("atlas:open-command-palette"))
        }
        aria-label="Abrir busca global"
      >
        <span aria-hidden="true">⌕</span>
        <small>Buscar</small>
      </button>
    </nav>
  );
}
