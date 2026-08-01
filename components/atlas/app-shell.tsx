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
    // A sala de comando tinha o PRÓPRIO botão de densidade, com estado próprio:
    // dava para ver a barra dizendo "Compacto" e a página "Confortável" na mesma
    // tela. Agora a preferência é uma só e o shell avisa quem depende dela —
    // localStorage sozinho não notifica a mesma aba.
    window.dispatchEvent(new CustomEvent("atlas:density-changed", { detail: next }));
  }, [desktopDensity]);

  /* ── O INTERRUPTOR DE DENSIDADE EXISTE DOS DOIS LADOS E NÃO SE ENCONTRA ────
     MEDIDO em 01/08/2026, e deixado como está DE PROPÓSITO — com o motivo.

     `data-desktop-density` é emitido logo abaixo e mexe em padding de cabeçalho
     e de tabela. `data-cc23-density` tem as regras que mexem na PRIMITIVA —
     `[data-cc23-density="compact"] .cc6-panel { padding: 12px }` — e NENHUM
     componente o emite. CSS escrito e nunca ligado.

     Ligar é UMA linha aqui. O que segura não é dificuldade, é consequência:

       1. `.cc6-panel` não declara padding; os consumidores declaram 191 vezes
          em 5 valores (p-5 ×91, p-4 ×63, p-6 ×21, p-3 ×15, p-8 ×1).
       2. A regra compacta pesa (0,2,0) e o utilitário do Tailwind pesa (0,1,0)
          dentro de uma camada — sem camada vence camada. Ela ganharia de todos.
       3. E o estado inicial aqui é `"compact"` (veja o useState acima). Ou seja:
          NÃO seria opt-in. Seria o padding de 421 superfícies caindo de 20px
          para 12px para todo mundo, por padrão.

     Uma mudança dessa dimensão precisa ser MEDIDA numa tela antes de embarcar,
     e a sessão que descobriu isto estava sem navegador. Ligar sem medir seria
     trocar um defeito conhecido por um desconhecido.

     Para quem for ligar: decida primeiro o padding BASE de `.cc6-panel`, para
     que o compacto seja um delta declarado, e não uma surpresa que vence 191
     declarações espalhadas. ── */
  return (
    <div
      className="atlas-app-shell"
      data-sidebar-collapsed={collapsed ? "true" : "false"}
      data-desktop-density={desktopDensity}
      data-desktop-layout="adaptive-wide-workspace"
      data-tablet-layout="adaptive-overlay-workspace"
      data-mobile-layout="thumb-first"
      data-visual-system="atlas-core-v2"
      data-information-strategy="decision-first"
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
