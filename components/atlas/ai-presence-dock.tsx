"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { observarPresencaDaIa, type TrabalhoDeIa } from "@/lib/ai/presence";

/**
 * O ROBÔ DO CANTO — presença da IA, e só isso.
 *
 * O canto inferior direito tinha DOIS flutuantes empilhados: um "+" azul de
 * 56px que duplicava o "Novo lead" já presente na barra superior, e a pílula do
 * copiloto. Juntos cobriam a última linha de qualquer tabela — em tela de leads,
 * exatamente a lead mais antiga da fila.
 *
 * Agora é um só, de 46px, e ele não é enfeite: mostra quando a IA está
 * trabalhando DE VERDADE, alimentado por `lib/ai/presence`. Parado quer dizer
 * parada. Se travar, ele para junto — que é o ponto de existir um indicador.
 *
 * Um clique abre o copiloto. O "+" saiu porque a criação rápida continua
 * inteira, em Alt+A e no ⌘K: tirar o botão redundante não tirou o caminho.
 */
export function AiPresenceDock() {
  const [trabalhos, setTrabalhos] = useState<TrabalhoDeIa[]>([]);
  const [expandido, setExpandido] = useState(false);

  useEffect(() => observarPresencaDaIa(setTrabalhos), []);

  const trabalhando = trabalhos.length > 0;
  const atual = trabalhos[0];

  // Só abre sozinho quando há o que dizer. Um balão que aparece à toa vira uma
  // coisa que a pessoa aprende a ignorar — e aí não serve nem quando importa.
  useEffect(() => {
    if (!trabalhando) {
      setExpandido(false);
      return;
    }
    // Trabalho instantâneo não merece anúncio: só mostra o rótulo se a chamada
    // passar de meio segundo, senão a interface pisca a cada tecla.
    const timer = setTimeout(() => setExpandido(true), 500);
    return () => clearTimeout(timer);
  }, [trabalhando]);

  return (
    <button
      type="button"
      className="atlas-ia-dock"
      data-trabalhando={trabalhando ? "true" : "false"}
      data-expandido={expandido && trabalhando ? "true" : "false"}
      onClick={() => window.dispatchEvent(new Event("atlas:open-copilot"))}
      aria-label={
        trabalhando
          ? `IA trabalhando: ${atual?.rotulo}. Abrir copiloto.`
          : "Abrir copiloto do Atlas"
      }
      title={trabalhando ? atual?.rotulo : "Copiloto do Atlas · ⌘J"}
    >
      <span className="atlas-ia-dock-avatar" aria-hidden="true">
        <Image
          src="/brand/atlas-robot-assistant.png"
          alt=""
          width={92}
          height={138}
          className="atlas-ia-dock-robo"
          // Ícone de canto, nunca o herói da tela: não disputa banda com o
          // conteúdo que a pessoa veio ler.
          loading="lazy"
        />
        {/* O anel de trabalho é irmão do robô, e não filtro sobre ele: assim o
            robô fica nítido enquanto só o anel gira. */}
        <span className="atlas-ia-dock-anel" />
      </span>
      <span className="atlas-ia-dock-copy">
        <span className="atlas-ia-dock-titulo">
          {trabalhando ? "IA trabalhando" : "Copiloto"}
        </span>
        <span className="atlas-ia-dock-detalhe">
          {trabalhando ? atual?.rotulo : "⌘J"}
        </span>
      </span>
    </button>
  );
}

export default AiPresenceDock;
