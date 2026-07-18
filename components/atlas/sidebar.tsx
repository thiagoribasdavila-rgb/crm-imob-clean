"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const navigation = [
  {
    group: "Operação diária",
    label: "Command Center",
    href: "/dashboard",
    icon: "⌘",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Operação diária",
    label: "Leads",
    href: "/leads",
    icon: "◎",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Operação diária",
    label: "Pipeline",
    href: "/pipeline",
    icon: "⌁",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Operação diária",
    label: "Tarefas",
    href: "/tasks",
    icon: "✓",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Operação diária",
    label: "Agenda",
    href: "/calendar",
    icon: "□",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Operação diária",
    label: "Atividades",
    href: "/activity",
    icon: "◷",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Clientes e portfólio",
    label: "Clientes 360",
    href: "/customers",
    icon: "◉",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Clientes e portfólio",
    label: "Projetos",
    href: "/developments",
    icon: "▥",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Clientes e portfólio",
    label: "Reativação",
    href: "/leads/import",
    icon: "↻",
    roles: ["director", "superintendent", "manager", "broker"],
  },
  {
    group: "Clientes e portfólio",
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
    label: "Usuários e acessos",
    href: "/users",
    icon: "♙",
    roles: ["director"],
    accessRoles: ["admin"],
  },
  {
    group: "Diretoria",
    label: "Vendas externas",
    href: "/external-sales",
    icon: "↙",
    roles: ["director"],
    accessRoles: ["admin", "director_decisor"],
  },
  {
    group: "Diretoria",
    label: "Integrações",
    href: "/integrations",
    icon: "∞",
    roles: ["director"],
    accessRoles: ["admin", "director_decisor"],
  },
  {
    group: "Diretoria",
    label: "Evolução V3",
    href: "/atlas-v3",
    icon: "◈",
    roles: ["director"],
    accessRoles: ["admin", "director_decisor"],
  },
  {
    group: "Diretoria",
    label: "Configurações",
    href: "/settings",
    icon: "⚙",
    roles: ["director", "superintendent", "manager"],
    accessRoles: ["admin"],
  },
] as const;
type NavigationItem = (typeof navigation)[number];
const FAVORITES_KEY = "atlas:sidebar-favorites:v1";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggle: () => void;
  role: string;
  accessRole: string;
};

export function Sidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggle,
  role,
  accessRole,
}: SidebarProps) {
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(FAVORITES_KEY) || "[]") as unknown;
      if (Array.isArray(saved)) setFavorites(saved.filter((item): item is string => typeof item === "string"));
    } catch {
      window.localStorage.removeItem(FAVORITES_KEY);
    }
  }, []);

  useEffect(() => {
    onCloseMobile();
    setQuery("");
  }, [pathname, onCloseMobile]);

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

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || target?.matches("input, textarea, select, [contenteditable='true']")) return;
      if (collapsed && !mobileOpen) return;
      event.preventDefault();
      document.getElementById("atlas-sidebar-search-input")?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [collapsed, mobileOpen]);

  const permittedItems = useMemo(() => navigation.filter((item) => {
    const scoped = "accessRoles" in item ? item.accessRoles : undefined;
    return scoped ? scoped.some((candidate) => candidate === accessRole) : item.roles.some((candidate) => candidate === role);
  }), [accessRole, role]);
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const visibleItems = useMemo(() => normalizedQuery
    ? permittedItems.filter((item) => `${item.label} ${item.group}`.toLocaleLowerCase("pt-BR").includes(normalizedQuery))
    : permittedItems, [normalizedQuery, permittedItems]);
  const visibleGroups = [...new Set(visibleItems.map((item) => item.group))];
  const currentItem = permittedItems.find((item) => isActive(pathname, item.href));
  const favoriteItems = permittedItems.filter((item) => favorites.includes(item.href));

  function toggleFavorite(href: string) {
    setFavorites((current) => {
      const next = current.includes(href) ? current.filter((item) => item !== href) : [...current, href];
      window.localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
      return next;
    });
  }

  function renderNavItem(item: NavigationItem, favoriteCopy = false) {
    const active = isActive(pathname, item.href);
    const pinned = favorites.includes(item.href);
    return (
      <div className="atlas-nav-item" key={`${favoriteCopy ? "favorite-" : ""}${item.href}`}>
        <Link href={item.href} className="atlas-nav-link" data-active={active ? "true" : "false"} title={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined} onClick={onCloseMobile}>
          <span className="atlas-nav-icon" aria-hidden="true">{item.icon}</span>
          <span className="atlas-sidebar-label">{item.label}</span>
          {active ? <span className="atlas-nav-current atlas-sidebar-label" aria-hidden="true" /> : null}
        </Link>
        <button type="button" className="atlas-nav-favorite atlas-sidebar-label" data-pinned={pinned ? "true" : "false"} onClick={() => toggleFavorite(item.href)} aria-label={pinned ? `Remover ${item.label} dos favoritos` : `Fixar ${item.label} nos favoritos`} title={pinned ? "Remover dos favoritos" : "Fixar nos favoritos"}>{pinned ? "★" : "☆"}</button>
      </div>
    );
  }

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
              <small>Inteligência comercial</small>
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

        <div className="atlas-sidebar-search atlas-sidebar-label">
          <span aria-hidden="true">⌕</span>
          <label className="sr-only" htmlFor="atlas-sidebar-search-input">Buscar uma tela</label>
          <input
            id="atlas-sidebar-search-input"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar tela..."
            autoComplete="off"
          />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca">×</button> : <kbd>/</kbd>}
        </div>

        {currentItem ? <div className="atlas-sidebar-current atlas-sidebar-label"><span>Você está em</span><strong>{currentItem.label}</strong><button type="button" onClick={() => toggleFavorite(currentItem.href)} aria-label={favorites.includes(currentItem.href) ? "Remover tela atual dos favoritos" : "Fixar tela atual nos favoritos"}>{favorites.includes(currentItem.href) ? "★" : "☆"}</button></div> : null}

        <nav className="atlas-sidebar-nav" aria-label="Navegação principal">
          {!normalizedQuery && favoriteItems.length ? <div className="atlas-nav-group atlas-nav-favorites"><p className="atlas-sidebar-section atlas-sidebar-label"><span>Favoritos</span><small>{favoriteItems.length}</small></p>{favoriteItems.map((item) => renderNavItem(item, true))}</div> : null}
          {visibleGroups.map((group) => (
            <div className="atlas-nav-group" key={group}>
              <p className="atlas-sidebar-section atlas-sidebar-label"><span>{group}</span><small>{visibleItems.filter((item) => item.group === group).length}</small></p>
              {visibleItems.filter((item) => item.group === group).map((item) => renderNavItem(item))}
            </div>
          ))}
          {!visibleItems.length ? <div className="atlas-sidebar-empty atlas-sidebar-label"><span>⌕</span><strong>Nenhuma tela encontrada</strong><small>Tente buscar por leads, vendas ou projetos.</small><button type="button" onClick={() => setQuery("")}>Limpar busca</button></div> : null}
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
