"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div
      className="atlas-app-shell"
      data-sidebar-collapsed={collapsed ? "true" : "false"}
    >
      <Sidebar
        collapsed={collapsed}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        onToggle={() => setCollapsed((current) => !current)}
      />
      <Topbar onOpenMenu={() => setMobileOpen(true)} />
      <main className="atlas-app-main">
        <div className="atlas-app-content">{children}</div>
      </main>
    </div>
  );
}
