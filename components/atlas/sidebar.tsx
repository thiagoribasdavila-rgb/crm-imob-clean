"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { atlasNavigation, getAtlasNavigationForIdentity, getAtlasRoleRoutineForIdentity, getAtlasSecondaryNavigationForIdentity } from "@/lib/atlas/navigation";
type NavigationItem = (typeof atlasNavigation)[number];
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
  const sidebarRef = useRef<HTMLElement>(null);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [moreOpen, setMoreOpen] = useState(false);

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
    const sidebar = sidebarRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseMobile();
      if (event.key !== "Tab" || !sidebar) return;
      const focusable = Array.from(sidebar.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    window.requestAnimationFrame(() => document.getElementById("atlas-sidebar-search-input")?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
      if (sidebar?.contains(document.activeElement)) previousFocus?.focus();
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

  const permittedItems = useMemo(
    () => getAtlasNavigationForIdentity({ role, accessRole }),
    [accessRole, role],
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const visibleItems = useMemo(() => normalizedQuery
    ? permittedItems.filter((item) => `${item.label} ${item.group} ${item.keywords} ${item.businessOutcome}`.toLocaleLowerCase("pt-BR").includes(normalizedQuery))
    : permittedItems, [normalizedQuery, permittedItems]);
  const favoriteItems = permittedItems.filter((item) => favorites.includes(item.href));
  const roleRoutine = useMemo(
    () => getAtlasRoleRoutineForIdentity({ role, accessRole }),
    [accessRole, role],
  );
  const secondaryItems = useMemo(
    () => getAtlasSecondaryNavigationForIdentity({ role, accessRole }),
    [accessRole, role],
  );
  const routineItems = normalizedQuery
    ? []
    : roleRoutine.items.filter((item) => !favorites.includes(item.href));
  const groupedItems = normalizedQuery
    ? visibleItems
    : secondaryItems.filter((item) => !favorites.includes(item.href));
  const visibleGroups = [...new Set(groupedItems.map((item) => item.group))];
  const secondaryCurrentItem = secondaryItems.find((item) => isActive(pathname, item.href));

  useEffect(() => {
    if (secondaryCurrentItem) setMoreOpen(true);
  }, [secondaryCurrentItem]);

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
        <Link href={item.href} className="atlas-nav-link" data-active={active ? "true" : "false"} title={`${item.label} — ${item.businessOutcome}`} aria-label={collapsed ? item.label : undefined} aria-current={active ? "page" : undefined} onClick={onCloseMobile}>
          <span className="atlas-nav-icon" aria-hidden="true">{item.icon}</span>
          <span className="atlas-nav-text atlas-sidebar-label">
            <span className="atlas-nav-title">{item.label}</span>
            <span className="atlas-nav-copy sr-only">{item.businessOutcome}</span>
          </span>
        </Link>
        <button type="button" className="atlas-nav-favorite atlas-sidebar-label" data-pinned={pinned ? "true" : "false"} onClick={() => toggleFavorite(item.href)} aria-label={pinned ? `Remover ${item.label} dos favoritos` : `Fixar ${item.label} nos favoritos`} title={pinned ? "Remover dos favoritos" : "Fixar nos favoritos"}>{pinned ? "★" : "☆"}</button>
      </div>
    );
  }

  function renderGroups() {
    return visibleGroups.map((group) => {
      const groupItems = groupedItems.filter((item) => item.group === group);
      const groupHeadingId = `atlas-nav-group-${group.toLocaleLowerCase("pt-BR").replaceAll(" ", "-")}`;
      const groupIsCurrent = groupItems.some((item) => isActive(pathname, item.href));
      return (
        <section className="atlas-nav-group" data-current={groupIsCurrent ? "true" : "false"} aria-labelledby={groupHeadingId} key={group}>
          <h2 id={groupHeadingId} className="atlas-sidebar-section atlas-sidebar-label"><span>{group}</span></h2>
          {groupItems.map((item) => renderNavItem(item))}
        </section>
      );
    });
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
        id="atlas-primary-sidebar"
        ref={sidebarRef}
        className="atlas-sidebar"
        aria-label="Menu principal do Atlas"
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
              <strong>ATLAS ONE</strong>
              <small>Operação comercial</small>
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

        <div className="atlas-sidebar-decision sr-only" aria-label="Estado da operação Atlas One">
          <span>ONE</span>
          <strong>Operação conectada</strong>
          <small>Dados e ações no mesmo contexto.</small>
        </div>

        <nav className="atlas-sidebar-nav" aria-label="Navegação principal" data-navigation-style="atlas-one-canonical">
          {!normalizedQuery && routineItems.length ? (
            <section className="atlas-nav-group atlas-nav-routine" data-current={routineItems.some((item) => isActive(pathname, item.href)) ? "true" : "false"} aria-labelledby="atlas-nav-routine-heading">
              <h2 id="atlas-nav-routine-heading" className="atlas-sidebar-section atlas-sidebar-label">
                <span>{roleRoutine.label}</span>
                <small className="sr-only">{roleRoutine.description}</small>
              </h2>
              {routineItems.map((item) => renderNavItem(item))}
            </section>
          ) : null}
          {!normalizedQuery && favoriteItems.length ? (
            <section className="atlas-nav-group atlas-nav-favorites" data-current={favoriteItems.some((item) => isActive(pathname, item.href)) ? "true" : "false"} aria-labelledby="atlas-nav-favorites-heading">
              <h2 id="atlas-nav-favorites-heading" className="atlas-sidebar-section atlas-sidebar-label"><span>Favoritos</span></h2>
              {favoriteItems.map((item) => renderNavItem(item, true))}
            </section>
          ) : null}
          {normalizedQuery ? renderGroups() : null}
          {!normalizedQuery && groupedItems.length ? (
            <section className="atlas-nav-more atlas-sidebar-label" data-current={secondaryCurrentItem ? "true" : "false"}>
              <button type="button" className="atlas-nav-more-trigger" aria-expanded={moreOpen} aria-controls="atlas-nav-more-content" onClick={() => setMoreOpen((current) => !current)}>
                <span aria-hidden="true">•••</span>
                <span><strong>Mais</strong><small>{secondaryCurrentItem ? `Agora: ${secondaryCurrentItem.label}` : `${groupedItems.length} áreas disponíveis`}</small></span>
                <span aria-hidden="true">{moreOpen ? "⌃" : "⌄"}</span>
              </button>
              {moreOpen ? <div id="atlas-nav-more-content" className="atlas-nav-more-content">{renderGroups()}</div> : null}
            </section>
          ) : null}
          {!visibleItems.length ? <div className="atlas-sidebar-empty atlas-sidebar-label"><span>⌕</span><strong>Nenhuma tela encontrada</strong><small>Tente buscar por leads, vendas ou projetos.</small><button type="button" onClick={() => setQuery("")}>Limpar busca</button></div> : null}
        </nav>

        <div className="atlas-sidebar-footer">
          <span className="atlas-tenant-indicator" aria-hidden="true" />
          <span className="atlas-sidebar-label">
            <strong>Protegido</strong>
            <small className="sr-only">Ambiente protegido. Contexto multi-tenant ativo.</small>
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
