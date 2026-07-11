"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type ReadinessCheck = {
  ok: boolean;
  latencyMs?: number;
  detail?: string;
};

type ReadinessPayload = {
  status: "ready" | "not_ready";
  service: string;
  version: string;
  environment: string;
  latencyMs: number;
  checks: Record<string, ReadinessCheck>;
  timestamp: string;
};

const REFRESH_INTERVAL_MS = 30_000;

export default function AtlasSystemPulse() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ReadinessPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/ready", { cache: "no-store" });
      const body = (await response.json()) as ReadinessPayload;
      setPayload(body);
      setError(response.ok ? null : "A plataforma está operando em modo degradado.");
    } catch {
      setError("Não foi possível verificar a saúde da plataforma.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS);
    const openPanel = () => setOpen(true);
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("atlas:open-system-pulse", openPanel);
    window.addEventListener("keydown", keyboard);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("atlas:open-system-pulse", openPanel);
      window.removeEventListener("keydown", keyboard);
    };
  }, [refresh]);

  const healthy = payload?.status === "ready" && !error;
  const checks = useMemo(() => Object.entries(payload?.checks ?? {}), [payload]);
  const lastUpdated = payload?.timestamp
    ? new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(payload.timestamp))
    : "—";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 left-5 z-40 hidden items-center gap-2 rounded-full border border-white/10 bg-[#07101f]/90 px-3 py-2 text-xs text-slate-300 shadow-2xl backdrop-blur-xl transition hover:border-sky-400/30 hover:text-white lg:flex"
        aria-label="Abrir status do sistema"
      >
        <span className={`h-2 w-2 rounded-full ${loading ? "animate-pulse bg-amber-300" : healthy ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.75)]" : "bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,.7)]"}`} />
        {loading ? "Verificando Atlas" : healthy ? "Atlas operacional" : "Atenção necessária"}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex justify-end bg-slate-950/65 backdrop-blur-sm" onMouseDown={(event) => event.currentTarget === event.target && setOpen(false)}>
          <aside className="h-full w-full max-w-md overflow-y-auto border-l border-white/10 bg-[#060b16]/96 p-5 shadow-[-30px_0_100px_rgba(2,8,23,.5)] sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="atlas-eyebrow">Enterprise Reliability</p>
                <h2 className="mt-2 text-2xl font-semibold text-white">System Pulse</h2>
                <p className="mt-2 text-sm leading-6 text-slate-400">Leitura contínua da prontidão operacional do Atlas.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="atlas-icon-button" aria-label="Fechar status">×</button>
            </div>

            <section className={`mt-6 rounded-3xl border p-5 ${healthy ? "border-emerald-400/20 bg-emerald-400/[0.07]" : "border-rose-400/20 bg-rose-400/[0.07]"}`}>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Estado atual</p>
                  <p className="mt-2 text-xl font-semibold text-white">{loading ? "Verificando..." : healthy ? "Plataforma pronta" : "Operação degradada"}</p>
                </div>
                <span className={`grid h-12 w-12 place-items-center rounded-2xl text-xl ${healthy ? "bg-emerald-400/15 text-emerald-300" : "bg-rose-400/15 text-rose-300"}`}>{healthy ? "✓" : "!"}</span>
              </div>
              {error ? <p className="mt-4 text-sm leading-6 text-rose-200">{error}</p> : null}
            </section>

            <div className="mt-6 grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Latência</p><p className="mt-2 text-lg font-semibold text-white">{payload?.latencyMs ?? "—"} ms</p></div>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Ambiente</p><p className="mt-2 truncate text-lg font-semibold text-white">{payload?.environment ?? "—"}</p></div>
              <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><p className="text-[10px] uppercase tracking-wider text-slate-500">Versão</p><p className="mt-2 truncate text-lg font-semibold text-white">{payload?.version ?? "—"}</p></div>
            </div>

            <section className="mt-6 rounded-3xl border border-white/[0.07] bg-white/[0.02] p-5">
              <div className="flex items-center justify-between gap-4">
                <div><p className="atlas-eyebrow">Infrastructure checks</p><h3 className="mt-2 font-semibold text-white">Camadas críticas</h3></div>
                <button type="button" onClick={() => void refresh()} className="atlas-button-secondary">Atualizar</button>
              </div>
              <div className="mt-5 space-y-3">
                {loading ? <div className="h-20 animate-pulse rounded-2xl bg-white/[0.04]" /> : checks.length === 0 ? <p className="text-sm text-slate-400">Nenhuma verificação disponível.</p> : checks.map(([name, check]) => (
                  <article key={name} className="rounded-2xl border border-white/[0.06] bg-black/10 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0"><p className="capitalize font-medium text-white">{name.replaceAll("_", " ")}</p><p className="mt-1 truncate text-xs text-slate-500">{check.detail || "Serviço respondendo normalmente"}</p></div>
                      <div className="text-right"><span className={`text-xs font-semibold ${check.ok ? "text-emerald-300" : "text-rose-300"}`}>{check.ok ? "ONLINE" : "FALHA"}</span><p className="mt-1 text-[10px] text-slate-500">{check.latencyMs ?? "—"} ms</p></div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <div className="mt-6 flex items-center justify-between border-t border-white/[0.07] pt-5 text-xs text-slate-500">
              <span>Atualização automática a cada 30s</span>
              <span>{lastUpdated}</span>
            </div>
            <p className="mt-3 text-[10px] uppercase tracking-[0.18em] text-slate-600">Atalho: ⌘⇧S / Ctrl⇧S</p>
          </aside>
        </div>
      ) : null}
    </>
  );
}
