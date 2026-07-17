"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const navigation = [
  {
    group: "Hoje",
    label: "Command Center",
    href: "/dashboard",
    icon: "⌘",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Hoje",
    label: "Leads",
    href: "/leads",
    icon: "◎",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Hoje",
    label: "Pipeline",
    href: "/pipeline",
    icon: "⌁",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Hoje",
    label: "Tarefas",
    href: "/tasks",
    icon: "✓",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Hoje",
    label: "Agenda",
    href: "/calendar",
    icon: "□",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Comercial",
    label: "Projetos",
    href: "/developments",
    icon: "▥",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Comercial",
    label: "Reativação",
    href: "/leads/import",
    icon: "↻",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Comercial",
    label: "Copilot",
    href: "/ai-dashboard",
    icon: "✦",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Gestão",
    label: "Corretores",
    href: "/brokers",
    icon: "◇",
    roles: ["director", "superintendent", "manager"],
  },
  {
    group: "Gestão",
    label: "Distribuição",
    href: "/distribution",
    icon: "⇄",
    roles: ["director", "superintendent", "manager"],
  },
  {
    group: "Gestão",
    label: "Vendas",
    href: "/sales",
    icon: "◌",
    roles: ["director", "superintendent", "manager"],
  },
  {
    group: "Gestão",
    label: "Relatórios",
    href: "/reports",
    icon: "↗",
    roles: ["director", "superintendent", "manager"],
  },
  {
    group: "Diretoria",
    label: "Vendas externas",
    href: "/external-sales",
    icon: "↙",
    roles: ["director"],
  },
  {
    group: "Diretoria",
    label: "Integrações",
    href: "/integrations",
    icon: "∞",
    roles: ["director"],
  },
  {
    group: "Diretoria",
    label: "Evolução V3",
    href: "/atlas-v3",
    icon: "◈",
    roles: ["director"],
  },
  {
    group: "Diretoria",
    label: "Configurações",
    href: "/settings",
    icon: "⚙",
    roles: ["director", "superintendent", "manager"],
  },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggle: () => void;
  role: string;
};

export function Sidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggle,
  role,
}: SidebarProps) {
  const pathname = usePathname();

  useEffect(() => onCloseMobile(), [pathname, onCloseMobile]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMobile();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileOpen, onCloseMobile]);

  const visibleItems = navigation.filter((item) =>
    item.roles.some((candidate) => candidate === role),
  );
  const visibleGroups = [...new Set(visibleItems.map((item) => item.group))];

  return (
    <>
      <button
        type="button"
        className="atlas-sidebar-backdrop"
        data-open={mobileOpen ? "true" : "false"}
        onClick={onCloseMobile}
        aria-label="Fechar menu"
      />
      <aside
        className="atlas-sidebar"
        data-collapsed={collapsed ? "true" : "false"}
        data-mobile-open={mobileOpen ? "true" : "false"}
      >
        <div className="atlas-sidebar-brand">
          <Link
            href="/dashboard"
            className="atlas-brand-link"
            onClick={onCloseMobile}
          >
            <span className="atlas-brand-mark">A</span>
            <span className="atlas-sidebar-label">
              <strong>
                ATLAS <em>AI</em>
              </strong>
              <small>Real Estate OS</small>
            </span>
          </Link>
          <button
            type="button"
            className="atlas-sidebar-close"
            onClick={onCloseMobile}
            aria-label="Fechar menu"
          >
            ×
          </button>
        </div>

        <nav className="atlas-sidebar-nav" aria-label="Navegação principal">
          {visibleGroups.map((group) => (
            <div className="atlas-nav-group" key={group}>
              <p className="atlas-sidebar-section atlas-sidebar-label">
                {group}
              </p>
              {visibleItems
                .filter((item) => item.group === group)
                .map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="atlas-nav-link"
                      data-active={active ? "true" : "false"}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      onClick={onCloseMobile}
                    >
                      <span className="atlas-nav-icon" aria-hidden="true">
                        {item.icon}
                      </span>
                      <span className="atlas-sidebar-label">{item.label}</span>
                      {active ? (
                        <span
                          className="atlas-nav-current atlas-sidebar-label"
                          aria-hidden="true"
                        />
                      ) : null}
                    </Link>
                  );
                })}
            </div>
          ))}
        </nav>

        <div className="atlas-sidebar-footer">
          <span className="atlas-tenant-indicator" aria-hidden="true" />
          <span className="atlas-sidebar-label">
            <strong>Ambiente protegido</strong>
            <small>Contexto multi-tenant ativo</small>
          </span>
        </div>

        <button
          type="button"
          className="atlas-sidebar-toggle"
          onClick={onToggle}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
          aria-expanded={!collapsed}
        >
          <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
          <span className="atlas-sidebar-label">Recolher menu</span>
        </button>
      </aside>
    </>
  );
}
