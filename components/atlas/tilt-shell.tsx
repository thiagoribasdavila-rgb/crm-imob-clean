"use client";

import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";

/**
 * TiltShell — o 3D compartilhado do CC-6 (mesma receita provada no Command
 * Center e no login): parallax de ponteiro mutando transform via ref (zero
 * estado React por frame), gates duplos reavaliados ao vivo (pointer: fine +
 * prefers-reduced-motion), guarda de pointerType para híbridos touch e retorno
 * suave ao sair. Conteúdo interno pode subir em translateZ sob preserve-3d.
 * O pai deve ter [perspective:*] quando quiser profundidade relativa à cena.
 */
export function TiltShell({
  children,
  className,
  delayMs = 0,
  maxDeg = 4,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  maxDeg?: number;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const enabledRef = useRef(false);

  useEffect(() => {
    const motionQuery = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const pointerQuery = window.matchMedia("(pointer: fine)");
    const sync = () => {
      enabledRef.current = motionQuery.matches && pointerQuery.matches;
      if (!enabledRef.current && shellRef.current) {
        shellRef.current.style.transition = "";
        shellRef.current.style.transform = "";
      }
    };
    sync();
    motionQuery.addEventListener("change", sync);
    pointerQuery.addEventListener("change", sync);
    return () => {
      motionQuery.removeEventListener("change", sync);
      pointerQuery.removeEventListener("change", sync);
    };
  }, []);

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!enabledRef.current || (event.pointerType !== "mouse" && event.pointerType !== "pen")) return;
    const shell = shellRef.current;
    if (!shell) return;
    const rect = shell.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    shell.style.transition = "";
    shell.style.transform = `perspective(1000px) rotateX(${(-y * maxDeg).toFixed(2)}deg) rotateY(${(x * maxDeg).toFixed(2)}deg)`;
  }

  function resetTilt() {
    const shell = shellRef.current;
    if (!shell) return;
    shell.style.transition = "transform 260ms ease-out";
    shell.style.transform = "";
  }

  return (
    <div
      ref={shellRef}
      className={className}
      style={{ transformStyle: "preserve-3d", animationDelay: `${delayMs}ms` }}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
    >
      {children}
    </div>
  );
}
