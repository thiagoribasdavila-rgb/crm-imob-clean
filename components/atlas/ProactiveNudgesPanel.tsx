"use client";

/**
 * Painel de IA PROATIVA — surfa proactive-hierarchy (o motor de "próximos passos"
 * por papel, que já tinha rota e ZERO UI) na Sala de Comando. Cada papel vê só o
 * seu mundo (o corretor nunca recebe nudge de verba/aprovação). Autocontido,
 * fetch próprio, degrade honesto. Nada aqui executa — é sugestão sob supervisão.
 */

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";

type Nudge = {
  emoji: string;
  title: string;
  detail: string;
  action: string;
  urgency: 1 | 2 | 3 | 4 | 5;
  scope: string;
};

type PanelState =
  | { kind: "loading" }
  | { kind: "unavailable" }
  | { kind: "ready"; nudges: Nudge[]; digest: string };

/** Cor de estado por urgência (tokens do sistema; verde só para o nudge calmo). */
function tone(urgency: number, emoji: string): string {
  if (emoji === "✅") return "#34d399";
  if (urgency >= 5) return "#fb7185";
  if (urgency === 4) return "#fbbf24";
  if (urgency === 3) return "#8b8cf7";
  return "#4b8df8";
}

export function ProactiveNudgesPanel({ max = 4 }: { max?: number }) {
  const [state, setState] = useState<PanelState>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        setState({ kind: "unavailable" });
        return;
      }
      const res = await fetch("/api/v1/ai/proactive", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; data?: { nudges?: Nudge[]; digest?: string } }
        | null;
      if (!res.ok || !body?.ok || !body.data) {
        setState({ kind: "unavailable" });
        return;
      }
      setState({
        kind: "ready",
        nudges: Array.isArray(body.data.nudges) ? body.data.nudges : [],
        digest: body.data.digest ?? "",
      });
    } catch {
      setState({ kind: "unavailable" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <AtlasCard>
      <AtlasCardHeader
        eyebrow="✦ IA proativa · próximos passos"
        title="O que fazer a seguir"
        description="Sugestões proativas endereçadas ao seu papel — cada uma sob supervisão, nada executa sozinho."
        action={
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-[8px] border border-[rgba(148,163,184,0.18)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8b97ab] transition-colors hover:border-[rgba(75,141,248,0.5)] hover:text-[#4b8df8]"
            aria-label="Recarregar sugestões"
          >
            ↻ Atualizar
          </button>
        }
      />
      <div className="p-5 sm:p-6">
        {state.kind === "loading" ? (
          <ul className="flex flex-col gap-2" aria-hidden="true">
            {[0, 1].map((i) => (
              <li key={i} className="h-16 animate-pulse rounded-[12px] bg-[rgba(148,163,184,0.06)]" />
            ))}
          </ul>
        ) : state.kind === "unavailable" ? (
          <p className="text-sm leading-6 text-[#8b97ab]">Sugestões indisponíveis agora — os motores avisam quando algo mudar.</p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-6 text-[#aab6ca]">{state.digest}</p>
            <ul className="flex flex-col gap-2">
              {state.nudges.slice(0, max).map((n, i) => {
                const c = tone(n.urgency, n.emoji);
                return (
                  <li
                    key={i}
                    className="flex gap-3 rounded-[12px] border border-[rgba(148,163,184,0.1)] bg-[rgba(148,163,184,0.03)] p-3"
                    style={{ borderLeft: `2px solid ${c}` }}
                  >
                    <span aria-hidden="true" className="text-lg leading-none">{n.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#e8eef8]">{n.title}</span>
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]"
                          style={{ color: c, border: `1px solid ${c}55` }}
                        >
                          {n.scope}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs leading-5 text-[#8b97ab]">{n.detail}</p>
                      <p className="mt-1 text-xs leading-5 text-[#aab6ca]">→ {n.action}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </AtlasCard>
  );
}
