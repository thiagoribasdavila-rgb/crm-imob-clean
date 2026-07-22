"use client";

/**
 * Painel "Próxima melhor ação" — surfa a playlist de next-best-action (a IA que
 * já tinha rota e ZERO UI) direto na Sala de Comando. Autocontido: faz o próprio
 * fetch autenticado, degrada com honestidade (sem carteira → nota discreta; nada
 * quente → mensagem do próprio resumo) e NÃO executa nada — priorização sob
 * supervisão. Reusa o chrome premium (AtlasCard) e o brl puro do núcleo.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";
import { brl, type NextBestAction } from "@/lib/ai/next-best-action";

type NbaState =
  | { kind: "loading" }
  | { kind: "ready"; actions: NextBestAction[]; summary: string }
  | { kind: "unavailable" };

const ACTION_LABEL: Record<string, string> = {
  ligar_agora: "Ligar agora",
  enviar_proposta: "Enviar proposta",
  remarcar_visita: "Remarcar visita",
  reengajar: "Reengajar",
  nutrir: "Nutrir",
};

export function NextBestActionPanel({ max = 5 }: { max?: number }) {
  const [state, setState] = useState<NbaState>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        setState({ kind: "unavailable" });
        return;
      }
      const res = await fetch("/api/v1/ai/next-best-action", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      const body = (await res.json().catch(() => null)) as
        | { ok?: boolean; data?: { actions?: NextBestAction[]; summary?: string } }
        | null;
      if (!res.ok || !body?.ok || !body.data) {
        setState({ kind: "unavailable" });
        return;
      }
      setState({
        kind: "ready",
        actions: Array.isArray(body.data.actions) ? body.data.actions : [],
        summary: body.data.summary ?? "",
      });
    } catch {
      setState({ kind: "unavailable" });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const eyebrow = "◇ IA · playlist da carteira";
  const title = "Próxima melhor ação";

  return (
    <AtlasCard>
      <AtlasCardHeader
        eyebrow={eyebrow}
        title={title}
        description="A sequência priorizada por probabilidade × valor do imóvel. Nada executa sem o seu toque."
        action={
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-[8px] border border-[rgba(148,163,184,0.18)] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#8b97ab] transition-colors hover:border-[rgba(75,141,248,0.5)] hover:text-[#4b8df8]"
            aria-label="Recarregar playlist"
          >
            ↻ Atualizar
          </button>
        }
      />
      <div className="p-5 sm:p-6">
        {state.kind === "loading" ? (
          <ul className="flex flex-col gap-2" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-14 animate-pulse rounded-[12px] bg-[rgba(148,163,184,0.06)]" />
            ))}
          </ul>
        ) : state.kind === "unavailable" ? (
          <p className="text-sm leading-6 text-[#8b97ab]">
            Playlist indisponível agora — sua carteira permanece protegida. Tente atualizar em instantes.
          </p>
        ) : state.actions.length === 0 ? (
          <p className="text-sm leading-6 text-[#aab6ca]">{state.summary || "Nenhuma próxima ação na carteira agora."}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm leading-6 text-[#aab6ca]">{state.summary}</p>
            <ul className="flex flex-col gap-2">
              {state.actions.slice(0, max).map((a) => (
                <li key={a.leadId}>
                  <Link
                    href={`/leads/${a.leadId}`}
                    className="group flex items-center gap-3 rounded-[12px] border border-[rgba(148,163,184,0.1)] bg-[rgba(148,163,184,0.03)] p-3 transition-colors hover:border-[rgba(75,141,248,0.35)]"
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[rgba(148,163,184,0.18)] font-mono text-xs text-[#8b97ab] [font-variant-numeric:tabular-nums]">
                      {a.priority}
                    </span>
                    <span aria-hidden="true" className="text-lg leading-none">{a.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-[#e8eef8]">{a.name}</span>
                        <span className="shrink-0 rounded-full border border-[rgba(75,141,248,0.3)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#78a6f9]">
                          {ACTION_LABEL[a.action] ?? a.action}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-xs leading-5 text-[#6b7890]">{a.why}</p>
                      {/* Probabilidade nunca aparece sozinha: a linha abaixo diz sobre
                          quantos sinais ela se apoia e quais faltaram. */}
                      {a.dataCaveat ? (
                        <p className="mt-0.5 truncate text-[11px] leading-4 text-[#5f6b80]" title={a.dataCaveat}>
                          {a.dataCaveat}
                        </p>
                      ) : null}
                    </div>
                    <span className="flex shrink-0 flex-col items-end">
                      <span className="font-mono text-sm text-[#aab6ca] [font-variant-numeric:tabular-nums]">
                        {a.expectedValue != null ? brl(a.expectedValue) : "—"}
                      </span>
                      {a.expectedValue == null && a.declaredBudget != null ? (
                        // Orçamento declarado NÃO é potencial calculado — rótulo explícito
                        // para o corretor não ler teto do cliente como preço de imóvel.
                        <span className="font-mono text-[10px] leading-4 text-[#6b7890] [font-variant-numeric:tabular-nums]">
                          orç. declarado {brl(a.declaredBudget)}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AtlasCard>
  );
}
