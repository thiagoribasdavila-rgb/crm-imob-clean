"use client";

import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { ShellIdentity } from "./shell-types";

const sectionLabels: Record<string, string> = {
  dashboard: "Command Center",
  leads: "Leads",
  pipeline: "Pipeline",
  tasks: "Tarefas",
  calendar: "Agenda",
  developments: "Projetos",
  brokers: "Corretores",
  distribution: "Distribuição",
  sales: "Vendas",
  reports: "Relatórios",
  integrations: "Integrações",
  settings: "Configurações",
  "atlas-v3": "Evolução V3",
  "ai-dashboard": "Copilot",
};

export function Topbar({
  identity,
  onOpenMenu,
}: {
  identity: ShellIdentity;
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
  const currentSection =
    sectionLabels[sectionKey] || sectionKey.replaceAll("-", " ");

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
          <span>{identity.email || identity.organization}</span>
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
    </header>
  );
}
