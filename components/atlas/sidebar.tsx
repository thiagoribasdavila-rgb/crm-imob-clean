"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

const navigation = [
  { label: "Command Center", href: "/dashboard", icon: "⌘", roles: ["director","superintendent","manager","broker"] },
  { label: "Leads", href: "/leads", icon: "◎", roles: ["director","superintendent","manager","broker"] },
  { label: "Reativação", href: "/leads/import", icon: "↻", roles: ["director","superintendent","manager","broker"] },
  { label: "Pipeline", href: "/pipeline", icon: "⌁", roles: ["director","superintendent","manager","broker"] },
  { label: "Tarefas", href: "/tasks", icon: "✓", roles: ["director","superintendent","manager","broker"] },
  { label: "Agenda", href: "/calendar", icon: "□", roles: ["director","superintendent","manager","broker"] },
  { label: "Corretores", href: "/brokers", icon: "◇", roles: ["director","superintendent","manager"] },
  { label: "Distribuição", href: "/distribution", icon: "⇄", roles: ["director","superintendent","manager"] },
  { label: "Vendas", href: "/sales", icon: "◌", roles: ["director","superintendent","manager"] },
  { label: "Relatórios", href: "/reports", icon: "↗", roles: ["director","superintendent","manager"] },
  { label: "Projetos", href: "/developments", icon: "▥", roles: ["director","superintendent","manager","broker"] },
  { label: "Copilot", href: "/ai-dashboard", icon: "✦", roles: ["director","superintendent","manager","broker"] },
  { label: "Integrações", href: "/integrations", icon: "∞", roles: ["director"] },
  { label: "Evolução V3", href: "/atlas-v3", icon: "◈", roles: ["director"] },
  { label: "Configurações", href: "/settings", icon: "⚙", roles: ["director","superintendent","manager"] },
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
  const [role, setRole] = useState("broker");

  useEffect(() => {
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data } = await supabase.from("profiles").select("role,commercial_role").eq("id", auth.user.id).maybeSingle();
      setRole(data?.commercial_role || (data?.role === "admin" ? "director" : data?.role) || "broker");
    })();
  }, []);

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
          {navigation.filter((item) => item.roles.includes(role)).map((item) => {
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
