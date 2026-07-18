"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getAtlasNavigationContext } from "@/lib/atlas/navigation";
import type { ShellIdentity } from "./shell-types";

export function Topbar({
  identity,
  mobileOpen,
  onOpenMenu,
}: {
  identity: ShellIdentity;
  mobileOpen: boolean;
  onOpenMenu: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut({ scope: "local" });
    window.sessionStorage.removeItem("atlas:shell-identity");
    router.replace("/login");
  }

  const sectionKey = pathname.split("/").filter(Boolean).at(0) || "dashboard";
  const navigationContext = getAtlasNavigationContext(pathname);
  const fallbackSection = sectionKey.replaceAll("-", " ");
  const currentSection = navigationContext?.label
    || `${fallbackSection.charAt(0).toLocaleUpperCase("pt-BR")}${fallbackSection.slice(1)}`;
  const currentGroup = navigationContext?.group || "Atlas";

  return (
    <header className="atlas-app-topbar">
      <div className="atlas-topbar-inner">
        <div className="atlas-topbar-start">
        <button
          id="atlas-mobile-menu-trigger"
          type="button"
          className="atlas-mobile-menu"
          onClick={onOpenMenu}
          aria-label="Abrir menu"
          aria-controls="atlas-primary-sidebar"
          aria-expanded={mobileOpen}
        >
          ☰
        </button>
        <div className="atlas-topbar-location" role="group" aria-label={`Local atual: ${currentGroup}, ${currentSection}`}>
          <span className="atlas-topbar-context">
            <span>{identity.organization}</span>
            <i aria-hidden="true">·</i>
            <strong>{currentGroup}</strong>
          </span>
          <span className="atlas-topbar-section" aria-live="polite">{currentSection}</span>
        </div>
        </div>

        <div className="atlas-topbar-actions">
        <Link
          href="/leads/new"
          className="atlas-button-primary atlas-quick-create"
          aria-label="Criar novo lead"
          title="Criar novo lead"
        >
          <span aria-hidden="true">＋</span>
          <strong>Novo lead</strong>
        </Link>
        <button
          type="button"
          className="atlas-mobile-search"
          onClick={() =>
            window.dispatchEvent(new Event("atlas:open-command-palette"))
          }
          aria-label="Buscar em toda a plataforma"
        >
          <span aria-hidden="true">⌕</span>
        </button>
        <button
          type="button"
          className="atlas-command-trigger"
          onClick={() =>
            window.dispatchEvent(new Event("atlas:open-command-palette"))
          }
          aria-label="Buscar em toda a plataforma"
        >
          <span aria-hidden="true">⌕</span>
          <span>Buscar</span>
          <kbd>⌘ K</kbd>
        </button>
        <button
          type="button"
          className="atlas-notification-button"
          aria-label="Notificações"
          onClick={() =>
            window.dispatchEvent(new Event("atlas:open-notifications"))
          }
        >
          <span aria-hidden="true">⌁</span>
          <span className="atlas-notification-dot" />
        </button>
        <div className="atlas-user-copy">
          <strong>{identity.name}</strong>
          <span>{identity.accessRole === "admin" ? "Administrador" : identity.accessRole === "director_decisor" ? "Diretor decisor" : identity.accessRole === "director" ? "Diretor comercial" : "Corretor"}</span>
        </div>
        <Link
          href="/settings/profile"
          className="atlas-user-avatar"
          aria-label="Abrir meu perfil"
        >
          {identity.name.slice(0, 2).toUpperCase()}
        </Link>
        <button type="button" className="atlas-signout" onClick={signOut}>
          Sair
        </button>
        </div>
      </div>
    </header>
  );
}
