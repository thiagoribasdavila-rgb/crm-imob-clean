"use client";

import { usePathname, useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/atlas/theme-toggle";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { clearAtlasAuthContext } from "@/lib/auth/atlas-auth-context";
import { AtlasActionLink } from "./action-link";
import {
  getAtlasNavigationContext,
  getAtlasTaskActionForPathname,
} from "@/lib/atlas/navigation";
import type { DesktopDensity, ShellIdentity } from "./shell-types";

export function Topbar({
  identity,
  mobileOpen,
  desktopDensity,
  onOpenMenu,
  onToggleDesktopDensity,
}: {
  identity: ShellIdentity;
  mobileOpen: boolean;
  desktopDensity: DesktopDensity;
  onOpenMenu: () => void;
  onToggleDesktopDensity: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    await supabase.auth.signOut({ scope: "local" });
    clearAtlasAuthContext();
    router.replace("/login");
  }

  const sectionKey = pathname.split("/").filter(Boolean).at(0) || "dashboard";
  const navigationContext = getAtlasNavigationContext(pathname);
  const fallbackSection = sectionKey.replaceAll("-", " ");
  const currentSection = navigationContext?.label
    || `${fallbackSection.charAt(0).toLocaleUpperCase("pt-BR")}${fallbackSection.slice(1)}`;
  const currentGroup = navigationContext?.group || "Atlas";
  /**
   * O BOTÃO PRIMÁRIO PASSA A SER A AÇÃO DESTA TELA.
   *
   * Havia dois catálogos, e eles respondem perguntas diferentes:
   *
   *   · `primaryAction` de cada destino = O QUE FAZER AQUI ("Nova tarefa" em
   *     /tasks, "Abrir fila sem responsável" em /distribution). Cada um declara
   *     o resultado comercial esperado.
   *   · `atlasTaskActions` = PARA ONDE IR DEPOIS ("Abrir agenda" quando se está
   *     em /tasks). É uma transição entre telas, não uma ação na tela.
   *
   * A topbar renderizava só a transição, e caía num "Novo lead" fixo quando não
   * havia transição para o caminho atual — por isso o mesmo botão aparecia no
   * pipeline, em vendas e em distribuição. A ação própria de cada destino, que
   * é a que carrega o resultado comercial, nunca chegava a existir em pixel.
   *
   * Agora a ação da tela vem primeiro; a transição continua como último
   * recurso, para os caminhos que não são destino do catálogo (subrotas, telas
   * de apoio). O "Novo lead" fixo continua existindo só depois dos dois — sem
   * ele, uma subrota sem nenhuma das duas ficaria sem botão nenhum.
   */
  const taskAction = navigationContext?.primaryAction
    ?? getAtlasTaskActionForPathname(pathname, identity)
    ?? { label: "Novo lead", href: "/leads/new", icon: "＋" };
  const roleLabel = identity.accessRole === "admin"
    ? "Administrador"
    : identity.accessRole === "director_decisor"
      ? "Diretor decisor"
      : identity.role === "manager"
        ? "Gerente"
        : identity.role === "superintendent"
          ? "Superintendente"
          : identity.role === "broker"
            ? "Corretor"
            : "Diretor comercial";

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
        <AtlasActionLink
          href={taskAction.href}
          className="atlas-quick-create"
          /**
           * Quando o destino é a TELA ATUAL com parâmetro, força navegação
           * cheia. Sem isto o botão fica clicável e inerte: no App Router,
           * ir de /tasks para /tasks?create=1 é o mesmo segmento de rota — o
           * componente RE-RENDERIZA e não REMONTA, então o efeito que lê a
           * intenção (deps vazias) não roda de novo e o formulário não abre.
           *
           * Medido ao vivo em 2026-07-29: a URL mudava e a tela não reagia.
           * É o modo de falha mais traiçoeiro possível — o botão responde ao
           * clique, o endereço muda, e nada acontece.
           */
          onClick={(evento) => {
            const destino = taskAction.href.split("?")[0];
            if (destino === pathname && taskAction.href.includes("?")) {
              evento.preventDefault();
              window.location.assign(taskAction.href);
            }
          }}
          label={taskAction.label}
          icon={"icon" in taskAction ? taskAction.icon : "＋"}
          priority="primary"
          // O catálogo declara o RESULTADO de cada ação primária ("Avançar a
          // oportunidade mais relevante", "Distribuir oportunidades sem
          // atendimento"). Dizer isso é melhor que repetir o rótulo do botão
          // com "Ação rápida:" na frente — o rótulo já está escrito ao lado.
          aria-label={"outcome" in taskAction ? `${taskAction.label}: ${taskAction.outcome}` : `Ação rápida: ${taskAction.label}`}
          title={"outcome" in taskAction ? taskAction.outcome : `Ação rápida: ${taskAction.label}`}
        />
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
          className="atlas-desktop-density-toggle"
          aria-pressed={desktopDensity === "compact"}
          aria-label={desktopDensity === "compact"
            ? "Usar espaçamento confortável no desktop"
            : "Compactar o espaço de trabalho no desktop"}
          title={desktopDensity === "compact"
            ? "Usar espaçamento confortável"
            : "Usar modo compacto"}
          onClick={onToggleDesktopDensity}
        >
          <span aria-hidden="true">{desktopDensity === "compact" ? "▦" : "▤"}</span>
          <span className="atlas-density-label">
            {desktopDensity === "compact" ? "Compacto" : "Confortável"}
          </span>
        </button>
        {/* Vizinho do controle de densidade de propósito: as duas são preferência de
            leitura da mesma pessoa, e ficam onde ela já procura por elas. */}
        <ThemeToggle />
        <button
          type="button"
          className="atlas-command-trigger atlas-copilot-trigger"
          aria-label="Abrir copiloto de IA"
          title="Copiloto — Ctrl/⌘ J"
          onClick={() =>
            window.dispatchEvent(new Event("atlas:open-copilot"))
          }
        >
          <span aria-hidden="true">✦</span>
          <span>Copiloto</span>
          <kbd>⌘ J</kbd>
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
          <span>{roleLabel}</span>
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
