"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const dailyActions = [
  { label: "Início", href: "/dashboard", icon: "⌘" },
  { label: "Leads", href: "/leads", icon: "◎" },
  { label: "Pipeline", href: "/pipeline", icon: "⌁" },
  { label: "Tarefas", href: "/tasks", icon: "✓" },
] as const;

export function MobileDock() {
  const pathname = usePathname();

  return (
    <nav className="atlas-mobile-dock" aria-label="Ações rápidas">
      {dailyActions.map((item) => {
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
