"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setCollapsed(
      window.localStorage.getItem("atlas:sidebar-collapsed") === "true",
    );
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

  return (
    <div
      className="atlas-app-shell"
      data-sidebar-collapsed={collapsed ? "true" : "false"}
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
      />
      <Topbar onOpenMenu={openMobile} />
      <main className="atlas-app-main" id="atlas-main-content" tabIndex={-1}>
        <div className="atlas-app-content">{children}</div>
      </main>
    </div>
  );
}
