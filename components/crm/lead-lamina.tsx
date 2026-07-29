"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * A LÂMINA — enquadramento da ficha sobre a lista.
 *
 * A ficha renderizada aqui dentro é literalmente a mesma de
 * `app/(crm)/leads/[id]/page.tsx`. Este componente não sabe nada sobre lead:
 * ele só decide COMO a ficha aparece, e garante que sair dela devolva a pessoa
 * exatamente onde estava.
 *
 * ── DECISÕES DE COMPORTAMENTO, NÃO DE ENFEITE ────────────────────────────────
 *
 * · Quatro saídas (Esc, clique fora, botão, Voltar do navegador) porque um
 *   painel com uma saída só prende quem abriu por engano.
 * · O foco entra na lâmina e VOLTA para a linha que a abriu — sem isso, quem
 *   navega por teclado é jogado para o topo do documento a cada fechamento.
 * · Abaixo de 1180px a lâmina cobre a tela inteira, sem fundo escurecido e sem
 *   arrastar. O corretor em visita não precisa de gesto novo para aprender, e
 *   some a classe inteira de bug de rolagem aninhada no Safari do iPhone.
 * · `container-type: inline-size` na raiz: a ficha passa a reagir à largura
 *   DELA, não à da janela. É o que permite o mesmo componente servir a 880px e
 *   a tela cheia sem duplicar layout.
 */
export function LeadLamina({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const painel = useRef<HTMLDivElement>(null);
  const [saindo, setSaindo] = useState(false);
  const [coberturaTotal, setCoberturaTotal] = useState(false);

  useEffect(() => {
    const consulta = window.matchMedia("(max-width: 1179px)");
    const aplicar = () => setCoberturaTotal(consulta.matches);
    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, []);

  /**
   * Fecha voltando no histórico, e não com um push para `/leads`: voltar é o
   * que preserva a lista montada atrás. Um push criaria uma entrada nova e o
   * botão Voltar do navegador passaria a reabrir a ficha que a pessoa acabou
   * de fechar.
   */
  const fechar = useCallback(() => {
    if (saindo) return;
    setSaindo(true);
    const espera = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 200;
    window.setTimeout(() => router.back(), espera);
  }, [router, saindo]);

  useEffect(() => {
    // Guarda quem tinha o foco para devolvê-lo ao fechar.
    const anterior = document.activeElement as HTMLElement | null;
    const raiz = painel.current;
    raiz?.focus({ preventScroll: true });

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") { evento.preventDefault(); fechar(); return; }
      if (evento.key !== "Tab" || !raiz) return;
      // Armadilha de foco: Tab não pode escapar para a lista que está atrás e
      // inerte — quem usa teclado ficaria navegando um conteúdo invisível.
      const focaveis = raiz.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focaveis.length) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo.focus(); }
      else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro.focus(); }
    };

    document.addEventListener("keydown", aoTeclar);
    // Trava a rolagem do documento: sem isto, rolar dentro da ficha até o fim
    // continua rolando a lista atrás, e o conteúdo "escorrega" sob o dedo.
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
      anterior?.focus?.({ preventScroll: true });
    };
  }, [fechar]);

  return (
    <div
      className={`atlas-lamina-raiz ${saindo ? "is-saindo" : ""} ${coberturaTotal ? "is-cobertura" : ""}`}
      role="presentation"
    >
      {/* Sem fundo escurecido na cobertura total: não há nada visível atrás
          para escurecer, e o blur custa caro em celular. */}
      {!coberturaTotal ? (
        <div className="atlas-lamina-fundo" onClick={fechar} aria-hidden="true" />
      ) : null}
      <div
        ref={painel}
        className="atlas-lamina-painel"
        role="dialog"
        aria-modal="true"
        aria-label="Ficha do lead"
        tabIndex={-1}
      >
        <button type="button" className="atlas-lamina-fechar" onClick={fechar} aria-label="Fechar ficha (Esc)">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
        <div className="atlas-lamina-conteudo">{children}</div>
      </div>
    </div>
  );
}
