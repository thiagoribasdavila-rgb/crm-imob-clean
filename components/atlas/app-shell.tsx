"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/lib/supabase";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileDock } from "./mobile-dock";
import type { ShellIdentity } from "./shell-types";
const defaultIdentity: ShellIdentity = {
  name: "Usuário Atlas",
  email: "",
  organization: "Organização atual",
  role: "broker",
};

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [identity, setIdentity] = useState<ShellIdentity>(defaultIdentity);

  useEffect(() => {
    setCollapsed(
      window.localStorage.getItem("atlas:sidebar-collapsed") === "true",
    );
  }, []);

  useEffect(() => {
    let active = true;
    const cached = window.sessionStorage.getItem("atlas:shell-identity");
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as Partial<ShellIdentity>;
        if (typeof parsed.name === "string" && typeof parsed.role === "string")
          setIdentity({ ...defaultIdentity, ...parsed });
      } catch {
        window.sessionStorage.removeItem("atlas:shell-identity");
      }
    }
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name,organization_id,role,commercial_role")
        .eq("id", auth.user.id)
        .maybeSingle();
      let organization = defaultIdentity.organization;
      if (profile?.organization_id) {
        const { data } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", profile.organization_id)
          .maybeSingle();
        organization = data?.name || organization;
      }
      const next = {
        name:
          profile?.full_name ||
          auth.user.email?.split("@")[0] ||
          defaultIdentity.name,
        email: auth.user.email || "",
        organization,
        role:
          profile?.commercial_role ||
          (profile?.role === "admin" ? "director" : profile?.role) ||
          "broker",
      };
      window.sessionStorage.setItem(
        "atlas:shell-identity",
        JSON.stringify(next),
      );
      if (active) setIdentity(next);
    })();
    return () => {
      active = false;
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
        role={identity.role}
      />
      <Topbar identity={identity} onOpenMenu={openMobile} />
      <main className="atlas-app-main" id="atlas-main-content" tabIndex={-1}>
        <div className="atlas-app-content">{children}</div>
      </main>
      <MobileDock />
    </div>
  );
}
