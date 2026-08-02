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
 * O QUE EU TENTEI TIRAR E TIVE DE DEVOLVER: a armadilha de foco do menu no
 * celular. Achei que o dock inferior tornava o menu dispensável — não torna, o
 * menu continua existindo, e sem Escape, sem trap e sem trava de rolagem quem
 * usa teclado fica preso tabulando uma tela que não vê. O guard da fase 033
 * pegou. Está de volta, e agora com contrato.
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

  /**
   * O MENU DO CELULAR É UM DIÁLOGO — e diálogo tem obrigações.
   *
   * Escape fecha, Tab não escapa para o conteúdo inerte atrás, o corpo não
   * rola sob o painel, e o foco VOLTA para o botão que abriu. Sem as quatro,
   * quem navega por teclado ou leitor de tela fica preso: continua tabulando
   * uma tela que não vê, e ao fechar é jogado para o topo do documento.
   *
   * Eu tinha removido este bloco na primeira versão da poda, achando que o
   * dock inferior tornava o menu dispensável. Não torna — o menu continua
   * existindo, e o guard da fase 033 pegou a remoção.
   */
  useEffect(() => {
    if (!mobileOpen) return;
    const raiz = barra.current;
    const focoAnterior = document.activeElement as HTMLElement | null;
    raiz?.querySelector<HTMLElement>("a, button")?.focus();

    const aoTeclar = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseMobile();
        return;
      }
      if (event.key !== "Tab" || !raiz) return;
      const focaveis = raiz.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (event.shiftKey && document.activeElement === primeiro) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault();
        primeiro.focus();
      }
    };

    document.addEventListener("keydown", aoTeclar);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
      const previousFocus = focoAnterior;
      previousFocus?.focus();
    };
  }, [mobileOpen, onCloseMobile]);

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
        aria-label={collapsed ? item.label : undefined}
        aria-current={ativo ? "page" : undefined}
        onClick={onCloseMobile}
      >
        <span className="atlas-rail-icon">
          <NavIcon id={item.id as AtlasNavigationId} />
        </span>
        <span className="atlas-rail-label">{item.label}</span>
        {/* Visualmente redundante (cor + traço + fundo já marcam), mas quem
            ouve a tela não vê nenhum dos três. Fica só para o leitor. */}
        {ativo ? <span className="sr-only">Atual</span> : null}
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
        {/* O nome acessível é OBRIGATÓRIO aqui e não era emitido. Medido em
            02/08/2026: recolhida, `.atlas-sidebar-label` some por `display:none`
            e a marca é `aria-hidden` (AtlasLogo sem `title`) — sobrava um link
            sem nome nenhum, que o leitor de tela anuncia como "link" e pronto.
            Expandida ninguém percebe, porque o texto está ali. */}
        <Link
          href="/command-center"
          className="atlas-brand-link"
          aria-label="Atlas AI — ir para a sala de comando"
          onClick={onCloseMobile}
        >
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

      {/* Recolhida, o texto some e sobra a tecla: `aria-label` e `title` mantêm
          o botão nomeado nos dois estados — a mesma regra que vale para os
          destinos ("ícone sozinho é enigma") vale para este. */}
      <button
        type="button"
        className="atlas-rail-hint"
        onClick={abrirPaleta}
        title="Buscar em tudo (⌘K)"
        aria-label="Buscar em tudo (⌘K)"
      >
        <span>Buscar em tudo</span>
        <kbd>⌘K</kbd>
      </button>

      <nav className="atlas-rail-nav" aria-label="Navegação principal">
        {/* <section> + <h2> ligados por aria-labelledby, e não <div> + <p>:
            quem usa leitor de tela navega por região e por cabeçalho, e sem
            isso os quatro grupos viram uma lista plana de 17 links sem
            hierarquia. Foi exatamente o que a primeira versão desta reescrita
            fez — o guard da fase 026 pegou. O silêncio visual vem do CSS, não
            de rebaixar a marcação. */}
        {grupos.map((grupo) => {
          const groupHeadingId = `atlas-nav-group-${grupo.toLocaleLowerCase("pt-BR").replaceAll(" ", "-")}`;
          const doGrupo = itens.filter((item) => item.group === grupo);
          // MEDIDO em 02/08/2026, no navegador: `data-current` NÃO existia em
          // .tsx nenhum do repositório — zero ocorrências — enquanto CINCO
          // regras de globals.css e o portão da fase 026 dependiam dele. O
          // rótulo do grupo atual nunca acendeu, e ninguém viu, porque o portão
          // confere se a REGRA existe no CSS, não se o atributo chega ao DOM.
          // Com o atributo emitido aqui, a afirmação do portão passa a ser
          // verdadeira em vez de decorativa.
          const grupoAtual = doGrupo.some((item) => estaAtivo(pathname, item.href));
          return (
            // A abertura fica numa linha só de propósito: `check-evolution-phase-026`
            // cobra o literal `<section className="atlas-nav-group` para provar que
            // os grupos continuam sendo região semântica. Quebrar a linha some com
            // a propriedade aos olhos do portão sem mudar nada no DOM.
            <section className="atlas-nav-group" data-current={grupoAtual ? "true" : "false"} aria-labelledby={groupHeadingId} key={grupo}>
              <h2 id={groupHeadingId} className="atlas-rail-group-label">{grupo}</h2>
              {doGrupo.map(renderItem)}
            </section>
          );
        })}
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
