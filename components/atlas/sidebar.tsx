"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { getAtlasNavigationForIdentity, type AtlasNavigationItem } from "@/lib/atlas/navigation";
import { AtlasLogo } from "@/components/atlas/atlas-logo";
import { NavIcon, type AtlasNavigationId } from "@/components/atlas/nav-icons";
import { useAlertaDeLeadNova } from "@/components/atlas/use-alerta-de-lead-nova";

/**
 * O TRILHO — a barra lateral depois da poda (2026-07-29).
 *
 * ── O QUE SAIU, E POR QUÊ ────────────────────────────────────────────────────
 *
 * O pedido foi "minimalista, menos ruído visual". O que saiu não foram
 * destinos — todo item que existia continua aqui, no mesmo grupo. Saiu o cromo
 * que não navega:
 *
 * · A BUSCA PRÓPRIA. O ⌘K (components/CommandPalette.tsx) já monta a lista a
 *   partir do MESMO getAtlasNavigationForIdentity, com as mesmas permissões.
 *   Duas buscas na mesma tela obrigam a pessoa a escolher qual usar, e a da
 *   barra era a pior das duas (só filtrava o que já estava visível). Ficou uma
 *   linha que abre a paleta — descoberta sem campo de texto duplicado.
 *
 * · OS FAVORITOS. Uma estrela em toda linha, reservando 48px à direita de cada
 *   item, para uma função que resolve um problema que a paleta já resolve
 *   melhor. Com ela foram embora o localStorage próprio e a seção "Favoritos",
 *   que duplicava itens na mesma coluna — a pessoa via "Leads" duas vezes.
 *
 * · O SELO "ATUAL". A cor, o fundo, o traço à esquerda e o aria-current já
 *   dizem isso. O selo era a quarta vez.
 *
 * · O RODAPÉ "Ambiente protegido / Contexto multi-tenant ativo". Texto fixo,
 *   nunca muda, não leva a lugar nenhum. Ocupava o canto onde o olho procura
 *   informação viva e devolvia decoração.
 *
 * · A ARMADILHA DE FOCO E O BACKDROP no celular: o dock inferior
 *   (mobile-dock.tsx) é a navegação daquele tamanho de tela, e manter dois
 *   mecanismos custava um trap de foco manual que já divergia do padrão.
 *
 * ── O QUE ENTROU ─────────────────────────────────────────────────────────────
 *
 * · Ícones SVG (nav-icons.tsx) no lugar de glifos unicode, que vinham da fonte
 *   do sistema e desenhavam 17 pesos diferentes na mesma coluna.
 * · O aviso de lead nova, na única linha onde ele significa alguma coisa.
 *
 * A prop `collapsed` continua sendo honrada: recolher a barra é uma preferência
 * que as pessoas já aprenderam, e tirá-la seria remover capacidade em nome de
 * estética — não foi o que se pediu.
 */

type NavigationItem = AtlasNavigationItem;

function estaAtivo(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

type SidebarProps = {
  collapsed: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  onToggle: () => void;
  role: string;
  accessRole: string;
};

export function Sidebar({
  collapsed,
  mobileOpen,
  onCloseMobile,
  onToggle,
  role,
  accessRole,
}: SidebarProps) {
  const pathname = usePathname();
  const barra = useRef<HTMLElement>(null);
  const alerta = useAlertaDeLeadNova();

  // Fecha o menu do celular ao navegar: sem isto, a pessoa toca num destino e
  // a página troca atrás de um painel que continua aberto por cima.
  useEffect(() => {
    onCloseMobile();
  }, [pathname, onCloseMobile]);

  const itens = useMemo(
    () => getAtlasNavigationForIdentity({ role, accessRole }),
    [role, accessRole],
  );
  const grupos = useMemo(() => [...new Set(itens.map((item) => item.group))], [itens]);

  /**
   * Abre a paleta pelo mesmo atalho que o teclado usa. Despachar o evento em
   * vez de manter estado próprio é o que garante UM só dono do "está aberta?" —
   * a paleta escuta este teclado desde sempre.
   */
  const abrirPaleta = useCallback(() => {
    onCloseMobile();
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: true, bubbles: true }),
    );
  }, [onCloseMobile]);

  function renderItem(item: NavigationItem) {
    const ativo = estaAtivo(pathname, item.href);
    // O aviso mora só em Leads. Pendurá-lo em qualquer outro item seria
    // decoração: nenhuma outra tela responde à chegada de uma lead.
    //
    // E ele só existe quando tem o que dizer: `chegou` (há N esperando) ou
    // `nao-medido` (não consegui olhar). Com `nenhuma` NÃO renderiza nada —
    // uma pastilha com "0" permanente ao lado de Leads é ruído puro, e foi
    // exatamente o que apareceu na primeira vez que abri a tela.
    const mostraAviso =
      item.id === "leads" && (alerta.estado === "chegou" || alerta.estado === "nao-medido");
    return (
      <Link
        key={item.href}
        href={item.href}
        className="atlas-rail-link"
        data-active={ativo ? "true" : "false"}
        // O título nomeia o destino quando a barra está recolhida; ícone sem
        // nome é enigma, não minimalismo.
        title={collapsed ? item.label : undefined}
        aria-current={ativo ? "page" : undefined}
        onClick={onCloseMobile}
      >
        <span className="atlas-rail-icon">
          <NavIcon id={item.id as AtlasNavigationId} />
        </span>
        <span className="atlas-rail-label">{item.label}</span>
        {mostraAviso ? (
          <span
            className="atlas-rail-badge"
            data-estado={alerta.estado}
            data-chegou={alerta.chegouAgora ? "true" : "false"}
            title={alerta.explicacao}
            // O aria-live fica AQUI e não no <nav>: o leitor de tela anuncia a
            // mudança do número, sem recitar o menu inteiro a cada releitura.
            aria-live="polite"
          >
            {alerta.estado === "nao-medido" ? "?" : alerta.novas}
            <span className="sr-only"> {alerta.explicacao}</span>
          </span>
        ) : null}
      </Link>
    );
  }

  return (
    <aside
      id="atlas-primary-sidebar"
      ref={barra}
      className="atlas-sidebar"
      aria-label="Menu principal do Atlas"
      data-collapsed={collapsed ? "true" : "false"}
      data-mobile-open={mobileOpen ? "true" : "false"}
    >
      <div className="atlas-sidebar-brand">
        <Link href="/command-center" className="atlas-brand-link" onClick={onCloseMobile}>
          <AtlasLogo size={38} className="shrink-0" />
          <span className="atlas-sidebar-label">
            <strong>
              ATLAS <em>AI</em>
            </strong>
          </span>
        </Link>
        <button
          type="button"
          className="atlas-sidebar-close"
          onClick={onCloseMobile}
          aria-label="Fechar menu"
        >
          ×
        </button>
      </div>

      <button type="button" className="atlas-rail-hint" onClick={abrirPaleta}>
        <span>Buscar em tudo</span>
        <kbd>⌘K</kbd>
      </button>

      <nav className="atlas-rail-nav" aria-label="Navegação principal">
        {grupos.map((grupo) => (
          <div key={grupo}>
            <p className="atlas-rail-group-label">{grupo}</p>
            {itens.filter((item) => item.group === grupo).map(renderItem)}
          </div>
        ))}
      </nav>

      <button
        type="button"
        className="atlas-sidebar-toggle"
        onClick={onToggle}
        aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        aria-expanded={!collapsed}
      >
        <span aria-hidden="true">{collapsed ? "›" : "‹"}</span>
        <span className="atlas-sidebar-label">Recolher menu</span>
      </button>
    </aside>
  );
}
