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
  tilt = false,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
  maxDeg?: number;
  /**
   * Inclinar segue o ponteiro. **Desligado por padrão**, e essa é a mudança:
   * o componente estava em 34 telas de trabalho — leads, corretores, regras de
   * pagamento, materiais — e todas balançavam quando o mouse passava.
   *
   * Numa capa de entrada isso é acabamento. Numa tabela que alguém está LENDO
   * para decidir a quem ligar, é a superfície brigando com o leitor: a linha
   * que você mira sai do lugar no caminho até ela. Efeito bonito no lugar
   * errado é ruído — e este custava precisão de clique.
   *
   * Ficou opt-in em vez de removido porque o gesto continua certo onde a tela é
   * vitrine. Quem quiser, pede: `<TiltShell tilt>`.
   */
  tilt?: boolean;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const enabledRef = useRef(false);

  useEffect(() => {
    if (!tilt) {
      enabledRef.current = false;
      return;
    }
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
  }, [tilt]);

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

  // Sem inclinação, sem ouvintes de ponteiro e sem preserve-3d: a tela para de
  // ser um palco 3D e volta a ser uma folha. `preserve-3d` sozinho já forçava
  // camada de composição em painel que nunca ia se mover.
  if (!tilt) {
    return (
      <div ref={shellRef} className={className} style={{ animationDelay: `${delayMs}ms` }}>
        {children}
      </div>
    );
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
