"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { MobileDock } from "./mobile-dock";
import { NavigationPerformance } from "./navigation-performance";
import CommandPalette from "@/components/CommandPalette";
import type { ShellIdentity } from "./shell-types";
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
        if (typeof parsed.name === "string") {
          setIdentity({
            ...defaultIdentity,
            name: parsed.name,
            email: typeof parsed.email === "string" ? parsed.email : "",
            organization: typeof parsed.organization === "string"
              ? parsed.organization
              : defaultIdentity.organization,
          });
        }
      } catch {
        window.sessionStorage.removeItem("atlas:shell-identity");
      }
    }
    void (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", auth.user.id)
        .maybeSingle();
      let organization = defaultIdentity.organization;
      if (profile?.organization_id) {
        const { data } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", profile.organization_id)
          .maybeSingle();
        organization = data?.name || organization;
      }
      const rawRole = String(profile?.role || "").trim().toLowerCase();
      const rawAccessRole = String(profile?.access_role || "").trim().toLowerCase();
      const rawCommercialRole = String(profile?.commercial_role || "").trim().toLowerCase();
      const accessRole: ShellIdentity["accessRole"] = rawAccessRole === "admin" || rawRole === "admin" ? "admin" : ["director_decisor", "diretor_decisor"].includes(rawAccessRole || rawRole) ? "director_decisor" : ["director", "diretor", "manager", "gerente", "superintendent", "superintendente"].includes(rawAccessRole || rawRole) ? "director" : "broker";
      const commercialRoleCandidate = rawCommercialRole || rawRole;
      const role = ["broker", "corretor"].includes(commercialRoleCandidate)
        ? "broker"
        : ["manager", "gerente"].includes(commercialRoleCandidate)
          ? "manager"
          : ["superintendent", "superintendente"].includes(commercialRoleCandidate)
            ? "superintendent"
            : "director";
      const next = {
        name:
          profile?.full_name ||
          profile?.name ||
          auth.user.email?.split("@")[0] ||
          defaultIdentity.name,
        email: auth.user.email || "",
        organization,
        role,
        accessRole,
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
      data-desktop-layout="balanced-canvas"
      data-tablet-layout="focused-workspace"
      data-mobile-layout="touch-first"
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
      <Topbar identity={identity} mobileOpen={mobileOpen} onOpenMenu={openMobile} />
      <NavigationPerformance />
      <main className="atlas-app-main" id="atlas-main-content" tabIndex={-1}>
        <div className="atlas-app-content" key={pathname}>{children}</div>
      </main>
      <MobileDock identity={identity} />
      <CommandPalette identity={identity} />
    </div>
  );
}
