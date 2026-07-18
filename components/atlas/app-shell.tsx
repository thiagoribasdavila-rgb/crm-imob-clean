"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  authContextToShellIdentity,
  fetchAtlasAuthContext,
  readAtlasAuthContext,
} from "@/lib/auth/atlas-auth-context";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileDock } from "./mobile-dock";
import { NavigationPerformance } from "./navigation-performance";
import CommandPalette from "@/components/CommandPalette";
import type { DesktopDensity, ShellIdentity } from "./shell-types";

const DESKTOP_DENSITY_KEY = "atlas:desktop-density";
const defaultIdentity: ShellIdentity = {
  name: "Usuário Atlas",
  email: "",
  organization: "Organização atual",
  role: "broker",
  accessRole: "broker",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [identity, setIdentity] = useState<ShellIdentity>(defaultIdentity);
  const [desktopDensity, setDesktopDensity] = useState<DesktopDensity>("compact");

  useEffect(() => {
    setCollapsed(
      window.localStorage.getItem("atlas:sidebar-collapsed") === "true",
    );
    const savedDensity = window.localStorage.getItem(DESKTOP_DENSITY_KEY);
    if (savedDensity === "compact" || savedDensity === "comfortable") {
      setDesktopDensity(savedDensity);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const authoritativeCached = readAtlasAuthContext();
    if (authoritativeCached) setIdentity(authContextToShellIdentity(authoritativeCached));

    void (async () => {
      try {
        const { context } = await fetchAtlasAuthContext(controller.signal);
        if (!context) return;
        const next = authContextToShellIdentity(context);
        setIdentity(next);
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          // SupabaseGuard mantém a recuperação da sessão; o shell conserva a última identidade segura.
        }
      }
    })();
    return () => {
      controller.abort();
    };
  }, []);

  const closeMobile = useCallback(() => setMobileOpen(false), []);
  const openMobile = useCallback(() => setMobileOpen(true), []);
  const toggleSidebar = useCallback(() => {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("atlas:sidebar-collapsed", String(next));
      return next;
    });
  }, []);
  const toggleDesktopDensity = useCallback(() => {
    const next = desktopDensity === "compact" ? "comfortable" : "compact";
    setDesktopDensity(next);
    window.localStorage.setItem(DESKTOP_DENSITY_KEY, next);
  }, [desktopDensity]);

  return (
    <div
      className="atlas-app-shell"
      data-sidebar-collapsed={collapsed ? "true" : "false"}
      data-desktop-density={desktopDensity}
      data-desktop-layout="adaptive-wide-workspace"
      data-tablet-layout="adaptive-overlay-workspace"
      data-mobile-layout="thumb-first"
    >
      <div className="atlas-ambient" aria-hidden="true">
        <span className="atlas-ambient-orb atlas-ambient-orb-one" />
        <span className="atlas-ambient-orb atlas-ambient-orb-two" />
      </div>
      <a className="atlas-skip-link" href="#atlas-main-content">
        Ir para o conteúdo
      </a>
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={closeMobile}
        onToggle={toggleSidebar}
        role={identity.role}
        accessRole={identity.accessRole}
      />
      <Topbar
        identity={identity}
        mobileOpen={mobileOpen}
        desktopDensity={desktopDensity}
        onOpenMenu={openMobile}
        onToggleDesktopDensity={toggleDesktopDensity}
      />
      <NavigationPerformance />
      <main className="atlas-app-main" id="atlas-main-content" tabIndex={-1}>
        <div className="atlas-app-content" key={pathname}>{children}</div>
      </main>
      <MobileDock identity={identity} />
      <CommandPalette identity={identity} />
    </div>
  );
}
