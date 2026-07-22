"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Alternância entre o tema escuro (padrão do produto) e o claro.
 *
 * Sem next-themes nem qualquer dependência: o estado real mora num atributo
 * `data-theme` no <html>, e o script inline do layout já o aplica antes da primeira
 * pintura. Este componente só reflete e altera esse atributo — a fonte da verdade é o
 * DOM, não um estado de React, para que não haja duas versões da mesma resposta.
 *
 * O padrão continua escuro. Deliberadamente NÃO seguimos prefers-color-scheme: o
 * produto foi desenhado no escuro e é assim que a operação o conhece; trocar o visual
 * de todo mundo porque o sistema operacional está claro seria decidir pelo usuário.
 * Quem quiser claro escolhe, e a escolha persiste.
 */

type Tema = "dark" | "light";
const CHAVE = "atlas:theme";

export function ThemeToggle({ className }: { className?: string }) {
  // Começa em dark e só corrige depois da montagem: no servidor não existe DOM, e
  // supor um valor aqui produziria divergência de hidratação.
  const [tema, setTema] = useState<Tema>("dark");
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    const atual = document.documentElement.getAttribute("data-theme");
    setTema(atual === "light" ? "light" : "dark");
    setMontado(true);
  }, []);

  const alternar = useCallback(() => {
    const proximo: Tema = tema === "dark" ? "light" : "dark";
    setTema(proximo);
    document.documentElement.setAttribute("data-theme", proximo);
    try {
      window.localStorage.setItem(CHAVE, proximo);
    } catch {
      // Navegação privada ou armazenamento bloqueado: o tema vale para esta sessão.
      // Perder a persistência é aceitável; impedir a troca não seria.
    }
  }, [tema]);

  const claro = tema === "light";

  return (
    <button
      type="button"
      onClick={alternar}
      // Antes de montar não sabemos o tema real — anunciar o rótulo errado a um leitor
      // de tela é pior que anunciar depois.
      aria-label={montado ? (claro ? "Mudar para o tema escuro" : "Mudar para o tema claro") : "Alternar tema"}
      aria-pressed={montado ? claro : undefined}
      title={montado ? (claro ? "Tema escuro" : "Tema claro") : undefined}
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border border-[color:var(--atlas-border)] bg-[color:var(--atlas-surface)] text-[color:var(--atlas-text-secondary)] transition-colors hover:text-[color:var(--atlas-text-primary)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--atlas-focus-ring)] ${className ?? ""}`.trim()}
    >
      {/* Ícone por geometria, no espírito do CC23: sol e lua desenhados com as mesmas
          primitivas, sem biblioteca de ícone e sem glow. */}
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
        {claro ? (
          // lua — oferece o escuro
          <path
            d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8 5.8 5.8 0 1 0 13.2 9.6Z"
            fill="currentColor"
          />
        ) : (
          // sol — oferece o claro
          <>
            <circle cx="8" cy="8" r="3.1" fill="currentColor" />
            {[0, 45, 90, 135].map((g) => (
              <line
                key={g}
                x1="8"
                y1="1.4"
                x2="8"
                y2="3.1"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                transform={`rotate(${g} 8 8)`}
              />
            ))}
            {[180, 225, 270, 315].map((g) => (
              <line
                key={g}
                x1="8"
                y1="1.4"
                x2="8"
                y2="3.1"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                transform={`rotate(${g} 8 8)`}
              />
            ))}
          </>
        )}
      </svg>
    </button>
  );
}
