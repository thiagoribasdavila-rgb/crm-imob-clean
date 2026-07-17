"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Identity = {
  name: string;
  email: string;
  organization: string;
};

const initialIdentity: Identity = {
  name: "Usuário Atlas",
  email: "",
  organization: "Organização atual",
};

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const [identity, setIdentity] = useState<Identity>(initialIdentity);

  useEffect(() => {
    let active = true;

    async function loadIdentity() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name,organization_id")
        .eq("id", auth.user.id)
        .maybeSingle();

      let organization = initialIdentity.organization;
      if (profile?.organization_id) {
        const { data } = await supabase
          .from("organizations")
          .select("name")
          .eq("id", profile.organization_id)
          .maybeSingle();
        organization = data?.name || organization;
      }

      if (active) {
        setIdentity({
          name: profile?.full_name || auth.user.email?.split("@")[0] || initialIdentity.name,
          email: auth.user.email || "",
          organization,
        });
      }
    }

    loadIdentity();
    return () => {
      active = false;
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut({ scope: "local" });
    router.replace("/login");
  }

  const currentSection =
    pathname.split("/").filter(Boolean).at(0)?.replaceAll("-", " ") || "dashboard";

  return (
    <header className="atlas-app-topbar">
      <div className="atlas-topbar-start">
        <button
          type="button"
          className="atlas-mobile-menu"
          onClick={onOpenMenu}
          aria-label="Abrir menu"
        >
          ☰
        </button>
        <div>
          <span className="atlas-topbar-context">{identity.organization}</span>
          <span className="atlas-topbar-section">{currentSection}</span>
        </div>
      </div>

      <div className="atlas-topbar-actions">
        <button
          type="button"
          className="atlas-notification-button"
          aria-label="Notificações"
          onClick={() => window.dispatchEvent(new Event("atlas:open-notifications"))}
        >
          <span aria-hidden="true">⌁</span>
          <span className="atlas-notification-dot" />
        </button>
        <div className="atlas-user-copy">
          <strong>{identity.name}</strong>
          <span>{identity.email || identity.organization}</span>
        </div>
        <span className="atlas-user-avatar" aria-hidden="true">
          {identity.name.slice(0, 2).toUpperCase()}
        </span>
        <button type="button" className="atlas-signout" onClick={signOut}>
          Sair
        </button>
      </div>
    </header>
  );
}
