"use client";
import { useCallback, useEffect, useState } from "react";
type Provider = {
  provider: string;
  state: string;
  healthy: boolean;
  freshnessHours: number | null;
  pending: number;
  failed: number;
  blockers: string[];
  environmentReady: boolean;
  registered: boolean;
  verified: boolean;
};
type Payload = {
  current: {
    summary: {
      healthy: number;
      degraded: number;
      readyToTest: number;
      notReady: number;
      total: number;
      productionReady: boolean;
    };
    providers: Provider[];
    queues: { pending: number; failed: number; unresolvedDeadLetters: number };
    runtime: {
      hostingProvider: string;
      publicHttps: boolean;
      environment: string;
      aiCostUsd30d: number;
    };
  };
  snapshots: Array<{ id: string; created_at: string }>;
};
export default function Page() {
  const [data, setData] = useState<Payload | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/v1/governance/integration-health", {
        cache: "no-store",
      }),
      j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Indisponível");
    setData(j.data);
  }, []);
  useEffect(() => {
    load().catch((e) => setNotice(e.message));
  }, [load]);
  async function snapshot() {
    setBusy(true);
    try {
      const r = await fetch("/api/v1/governance/integration-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "snapshot" }),
      }),
        j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Falha");
      setNotice("Diagnóstico seguro registrado, sem armazenar segredos.");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(false);
    }
  }
  const c = data?.current;
  return (
    <main
      data-phase="97-integration-operational-health"
      className="mx-auto max-w-7xl space-y-7 p-4 md:p-8"
    >
      <header className="rounded-[30px] bg-gradient-to-br from-slate-950 via-cyan-950 to-blue-950 p-7 text-white">
        <p className="text-xs font-semibold tracking-[.22em] text-cyan-300">
          HOSTINGER · APIS · FILAS · WEBHOOKS
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">Saúde operacional</h1>
            <p className="mt-2 text-sm text-slate-300">
              Configurado, testado e saudável são estados diferentes.
            </p>
          </div>
          <button
            disabled={busy}
            onClick={snapshot}
            className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-950"
          >
            Registrar diagnóstico
          </button>
        </div>
        <div className="mt-5 flex gap-2 text-[11px]">
          <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-emerald-200">
            SEGREDOS MASCARADOS
          </span>
          <span className="rounded-full bg-amber-400/10 px-3 py-1 text-amber-200">
            TESTE REAL OBRIGATÓRIO
          </span>
        </div>
      </header>
      {notice && (
        <div className="rounded-2xl border bg-blue-50 p-4 text-sm text-blue-900">
          {notice}
        </div>
      )}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ["Saudáveis", c?.summary.healthy || 0],
          ["Degradadas", c?.summary.degraded || 0],
          ["Prontas p/ teste", c?.summary.readyToTest || 0],
          ["Pendentes", c?.summary.notReady || 0],
          ["Produção", c?.summary.productionReady ? "PRONTA" : "BLOQUEADA"],
        ].map(([l, v]) => (
          <div key={String(l)} className="rounded-3xl border bg-white p-5">
            <small className="text-slate-400">{l}</small>
            <strong className="mt-2 block text-xl">{v}</strong>
          </div>
        ))}
      </section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {c?.providers.map((p) => (
          <article key={p.provider} className="rounded-3xl border bg-white p-5">
            <div className="flex justify-between">
              <strong className="uppercase">{p.provider}</strong>
              <span
                className={`rounded-full px-2 py-1 text-[10px] ${p.healthy ? "bg-emerald-50 text-emerald-700" : p.state === "degraded" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}
              >
                {p.state.replaceAll("_", " ")}
              </span>
            </div>
            <p className="mt-3 text-xs text-slate-500">
              Ambiente {p.environmentReady ? "ok" : "pendente"} · cadastro{" "}
              {p.registered ? "ok" : "pendente"} · teste{" "}
              {p.verified ? "ok" : "pendente"}
            </p>
            <p className="mt-2 text-xs text-slate-400">
              Evidência:{" "}
              {p.freshnessHours == null ? "ausente" : `${p.freshnessHours}h`} ·
              fila {p.pending} · falhas {p.failed}
            </p>
            {p.blockers.length ? (
              <p className="mt-3 text-[11px] text-amber-700">
                {p.blockers.join(" · ")}
              </p>
            ) : null}
          </article>
        ))}
      </section>
      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-3xl border bg-white p-5">
          <h2 className="font-semibold">Filas e falhas</h2>
          <div className="mt-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <strong className="block text-2xl">
                {c?.queues.pending || 0}
              </strong>
              <small>Pendentes</small>
            </div>
            <div>
              <strong className="block text-2xl">
                {c?.queues.failed || 0}
              </strong>
              <small>Falhas</small>
            </div>
            <div>
              <strong className="block text-2xl">
                {c?.queues.unresolvedDeadLetters || 0}
              </strong>
              <small>DLQ</small>
            </div>
          </div>
        </article>
        <article className="rounded-3xl border bg-white p-5">
          <h2 className="font-semibold">Ambiente</h2>
          <p className="mt-3 text-sm text-slate-500">
            {c?.runtime.hostingProvider} · HTTPS{" "}
            {c?.runtime.publicHttps ? "válido" : "pendente"} ·{" "}
            {c?.runtime.environment}
          </p>
          <p className="mt-2 text-xs text-slate-400">
            Custo IA 30d: US$ {c?.runtime.aiCostUsd30d || 0} · segredos
            expostos: não
          </p>
        </article>
      </section>
    </main>
  );
}
