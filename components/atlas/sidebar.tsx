"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
  { label: "Command Center", href: "/dashboard", icon: "⌘" },
  { label: "Leads", href: "/leads", icon: "◎" },
  { label: "Pipeline", href: "/pipeline", icon: "⌁" },
  { label: "Tarefas", href: "/tasks", icon: "✓" },
  { label: "Agenda", href: "/calendar", icon: "□" },
  { label: "Corretores", href: "/brokers", icon: "◇" },
  { label: "Projetos", href: "/developments", icon: "▥" },
  { label: "Copilot", href: "/ai-dashboard", icon: "✦" },
  { label: "Configurações", href: "/settings", icon: "⚙" },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggle: () => void;
};

export function Sidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggle,
}: SidebarProps) {
  const pathname = usePathname();

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
          <Link href="/dashboard" className="atlas-brand-link" onClick={onCloseMobile}>
            <span className="atlas-brand-mark">A</span>
            <span className="atlas-sidebar-label">
              <strong>ATLAS <em>AI</em></strong>
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
          <p className="atlas-sidebar-section atlas-sidebar-label">Operação</p>
          {navigation.map((item) => {
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
                <span className="atlas-nav-icon" aria-hidden="true">{item.icon}</span>
                <span className="atlas-sidebar-label">{item.label}</span>
              </Link>
            );
          })}
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
