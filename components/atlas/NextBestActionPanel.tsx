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

/** A rota acrescenta o fator de risco dominante; o núcleo puro não o conhece. */
type PlaylistAction = NextBestAction & { riskFactor?: string | null };

type NbaState =
  | { kind: "loading" }
  | { kind: "ready"; actions: PlaylistAction[]; summary: string; portfolioSize: number; truncated: boolean }
  /** 401/403: a seção não é deste papel. Some inteira — dizer "não consegui ler"
   *  quando a verdade é "você não tem acesso" descreve uma falha que não houve. */
  | { kind: "denied" }
  | { kind: "unavailable" };

const ACTION_LABEL: Record<string, string> = {
  ligar_agora: "Ligar agora",
  enviar_proposta: "Enviar proposta",
  remarcar_visita: "Remarcar visita",
  reengajar: "Reengajar",
  nutrir: "Nutrir",
};

/** Banda qualitativa por extenso — o corretor lê "alta", não um decimal. */
const BAND_LABEL: Record<string, string> = {
  "muito-alta": "chance muito alta",
  alta: "chance alta",
  media: "chance média",
  baixa: "chance baixa",
  "muito-baixa": "chance muito baixa",
};

export function NextBestActionPanel({
  max = 5,
  scope,
  brokerId,
}: {
  max?: number;
  /** "sem_dono" = fila de leads abertos sem responsável (só liderança). */
  scope?: "sem_dono";
  /** Carteira de outro corretor (só liderança). */
  brokerId?: string;
}) {
  const [state, setState] = useState<NbaState>({ kind: "loading" });

  const load = useCallback(async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        setState({ kind: "unavailable" });
        return;
      }
      const query = new URLSearchParams();
      if (scope) query.set("scope", scope);
      if (brokerId) query.set("brokerId", brokerId);
      const suffix = query.toString() ? `?${query.toString()}` : "";
      const res = await fetch(`/api/v1/ai/next-best-action${suffix}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (res.status === 401 || res.status === 403) {
        setState({ kind: "denied" });
        return;
      }
      const body = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            data?: {
              actions?: PlaylistAction[];
              summary?: string;
              portfolioSize?: number;
              truncated?: boolean;
            };
          }
        | null;
      if (!res.ok || !body?.ok || !body.data) {
        setState({ kind: "unavailable" });
        return;
      }
      const actions = Array.isArray(body.data.actions) ? body.data.actions : [];
      setState({
        kind: "ready",
        actions,
        summary: body.data.summary ?? "",
        portfolioSize:
          typeof body.data.portfolioSize === "number" && Number.isFinite(body.data.portfolioSize)
            ? body.data.portfolioSize
            : actions.length,
        truncated: body.data.truncated === true,
      });
    } catch {
      setState({ kind: "unavailable" });
    }
  }, [scope, brokerId]);

  useEffect(() => {
    void load();
  }, [load]);

  const unassigned = scope === "sem_dono";
  const eyebrow = unassigned ? "◇ IA · leads abertos sem responsável" : "◇ IA · playlist da carteira";
  const title = unassigned ? "Fila sem responsável" : "Próxima melhor ação";

  // Falta de autorização não é indisponibilidade: nada é renderizado.
  if (state.kind === "denied") return null;

  return (
    <AtlasCard>
      <AtlasCardHeader
        eyebrow={eyebrow}
        title={title}
        // O critério anunciado é o que o código executa: não há coluna de
        // metadados em `leads` nesta base, então valor de imóvel não existe e a
        // ordenação é probabilidade pura. Prometer "× valor do imóvel" era
        // vender um método que nunca rodou.
        description={
          unassigned
            ? "Leads abertos que ninguém está trabalhando, ordenados por probabilidade de conversão. Sem responsável, sem nome exposto — quem recebe cada um continua sendo decisão sua."
            : "A sequência priorizada por probabilidade de conversão. Nada executa sem o seu toque."
        }
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
            {unassigned ? "Não foi possível ler os leads sem responsável" : "Não foi possível ler a sua carteira"} agora,
            então não há fila para mostrar. Isso não quer dizer que ela esteja vazia — quer dizer que ainda não sabemos.
            Tente atualizar em instantes.
          </p>
        ) : state.actions.length === 0 ? (
          <p className="text-sm leading-6 text-[#aab6ca]">{state.summary || "Nenhuma próxima ação na carteira agora."}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <p className="text-sm leading-6 text-[#aab6ca]">{state.summary}</p>
              {/* O resumo fala da playlist (topo da fila), não do estoque. Sem
                  esta linha, "20 leads" seria lido como o total — e o total é
                  exatamente o que faz a liderança distribuir hoje. */}
              {state.portfolioSize > state.actions.length ? (
                <p className="text-xs leading-5 text-[#6b7890]">
                  {state.portfolioSize}
                  {state.truncated ? "+" : ""}{" "}
                  {unassigned ? "leads abertos sem responsável" : "leads na carteira"} no total; a lista abaixo mostra os
                  de maior potencial.
                  {state.truncated ? " A leitura foi limitada, então o total pode ser maior." : ""}
                </p>
              ) : null}
            </div>
            <ul className="flex flex-col gap-2">
              {state.actions.slice(0, max).map((a) => (
                <li key={a.leadId}>
                  <Link
                    href={`/leads/${a.leadId}`}
                    // Item marcado quando o fator dominante é de RISCO: sem a
                    // distinção, "telefone inválido" e "interação recente"
                    // chegavam com o mesmo peso, e o corretor gastava ligação
                    // num lead que não tem como atender.
                    className={`group flex items-center gap-3 rounded-[12px] border p-3 transition-colors ${
                      a.riskFactor
                        ? "border-[rgba(248,113,113,0.28)] bg-[rgba(248,113,113,0.05)] hover:border-[rgba(248,113,113,0.5)]"
                        : "border-[rgba(148,163,184,0.1)] bg-[rgba(148,163,184,0.03)] hover:border-[rgba(75,141,248,0.35)]"
                    }`}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[rgba(148,163,184,0.18)] font-mono text-xs text-[#8b97ab] [font-variant-numeric:tabular-nums]">
                      {a.priority}
                    </span>
                    <span aria-hidden="true" className="text-lg leading-none">{a.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-[#e8eef8]">{a.name}</span>
                        <span className="shrink-0 rounded-full border border-[rgba(75,141,248,0.3)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#78a6f9]">
                          {ACTION_LABEL[a.action] ?? a.action}
                        </span>
                        {/* Banda qualitativa: a rota sempre a devolveu e a tela
                            descartava. Palavra em vez de percentual — a leitura
                            não tem lastro para fingir precisão decimal. */}
                        {a.band ? (
                          <span className="shrink-0 rounded-full border border-[rgba(148,163,184,0.22)] px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[#8b97ab]">
                            {BAND_LABEL[a.band] ?? a.band}
                          </span>
                        ) : null}
                        {/* O chip de risco foi retirado: a borda vermelha já
                            distingue o item e o "porquê" abaixo já nomeia o
                            fator dominante. Repetir a mesma palavra em dois
                            lugares só ocupa a linha. */}
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
