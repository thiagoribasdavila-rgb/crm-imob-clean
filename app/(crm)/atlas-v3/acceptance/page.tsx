"use client";
import { useCallback, useEffect, useState } from "react";
type Control = {
  key: string;
  label: string;
  severity: string;
  passed: boolean;
  evidence: string;
};
type Cycle = {
  id: string;
  release_version: string;
  status: string;
  score: number;
  blocking: string[];
  created_at: string;
  decided_at?: string;
};
type Payload = {
  current: {
    assessment: {
      status: string;
      score: number;
      blocking: string[];
      controls: Control[];
      goAllowed: boolean;
    };
    signoffs: Array<{
      commercial_role: string;
      outcome: string;
      signed_at: string;
    }>;
  };
  activeCycle: Cycle | null;
  cycles: Cycle[];
  currentUser: { role: string };
};
export default function Page() {
  const [data, setData] = useState<Payload | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/v1/governance/executive-acceptance", {
        cache: "no-store",
      }),
      j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Aceite indisponível");
    setData(j.data);
  }, []);
  useEffect(() => {
    load().catch((e) => setNotice(e.message));
  }, [load]);
  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const r = await fetch("/api/v1/governance/executive-acceptance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Operação recusada");
      setNotice("Evidência registrada. Nenhuma publicação foi executada.");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(false);
    }
  }
  function start() {
    const version = window.prompt("Versão candidata (ex.: atlas-v3.0.0-rc1):");
    if (version) void post({ action: "start", releaseVersion: version });
  }
  function sign() {
    if (!data?.activeCycle) return;
    const outcome = window.confirm(
        "Confirma que os testes do seu perfil foram aprovados? OK = aprovado; Cancelar = falhou",
      )
        ? "passed"
        : "failed",
      ref = window.prompt(
        "Referência da evidência (ticket, relatório ou URL):",
      ),
      notes = window.prompt(
        "Descreva em pelo menos 20 caracteres o que foi validado:",
      );
    if (ref && notes)
      void post({
        action: "signoff",
        cycleId: data.activeCycle.id,
        outcome,
        evidenceReference: ref,
        notes,
      });
  }
  function decide(decision: "go" | "no_go") {
    if (!data?.activeCycle) return;
    const reason = window.prompt(
      `Justificativa formal para ${decision.toUpperCase()} (mínimo 30 caracteres):`,
    );
    if (reason)
      void post({
        action: "decide",
        cycleId: data.activeCycle.id,
        decision,
        reason,
      });
  }
  const a = data?.current.assessment;
  return (
    <main
      data-phase="99-executive-homologation-acceptance"
      className="mx-auto max-w-7xl space-y-7 p-4 md:p-8"
    >
      <header className="rounded-[30px] bg-gradient-to-br from-slate-950 via-blue-950 to-emerald-950 p-7 text-white">
        <p className="text-xs font-semibold tracking-[.22em] text-sky-300">
          HOMOLOGAÇÃO · ACEITE EXECUTIVO
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold">
              Decisão com evidência, sem atalhos
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              Quatro perfis assinam; pendências críticas bloqueiam GO; somente o
              diretor decide.
            </p>
          </div>
          {data?.currentUser.role === "director" && !data.activeCycle ? (
            <button
              disabled={busy}
              onClick={start}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-slate-950"
            >
              Iniciar ciclo
            </button>
          ) : null}
        </div>
      </header>
      {notice && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          {notice}
        </div>
      )}
      <section className="grid gap-4 md:grid-cols-[280px_1fr]">
        <article
          className={`rounded-3xl border p-6 text-center ${a?.goAllowed ? "bg-emerald-50" : "bg-amber-50"}`}
        >
          <small>Prontidão executiva</small>
          <strong className="mt-2 block text-6xl">{a?.score || 0}%</strong>
          <span className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs">
            {a?.status?.replaceAll("_", " ") || "carregando"}
          </span>
        </article>
        <div className="rounded-3xl border bg-white p-5">
          <h2 className="font-semibold">Assinaturas por perfil</h2>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {["director", "superintendent", "manager", "broker"].map((role) => {
              const s = data?.current.signoffs.find(
                (x) => x.commercial_role === role,
              );
              return (
                <div
                  key={role}
                  className={`rounded-2xl border p-4 ${s?.outcome === "passed" ? "border-emerald-200" : "border-amber-200"}`}
                >
                  <strong className="capitalize">{role}</strong>
                  <p className="mt-1 text-xs text-slate-500">
                    {s ? s.outcome : "pendente"}
                  </p>
                </div>
              );
            })}
          </div>
          {data?.activeCycle &&
          !data.current.signoffs.some(
            (x) => x.commercial_role === data.currentUser.role,
          ) ? (
            <button
              disabled={busy}
              onClick={sign}
              className="mt-4 rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white"
            >
              Assinar meu perfil
            </button>
          ) : null}
        </div>
      </section>
      <section className="rounded-3xl border bg-white p-5">
        <h2 className="font-semibold">Controles obrigatórios</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {a?.controls.map((c) => (
            <div
              key={c.key}
              className={`rounded-2xl border p-4 ${c.passed ? "border-emerald-200" : "border-rose-200"}`}
            >
              <div className="flex justify-between gap-3">
                <strong>
                  {c.passed ? "✓" : "✕"} {c.label}
                </strong>
                <span className="text-xs uppercase text-slate-400">
                  {c.severity}
                </span>
              </div>
              <p className="mt-2 text-xs text-slate-500">{c.evidence}</p>
            </div>
          ))}
        </div>
      </section>
      {data?.activeCycle && data.currentUser.role === "director" ? (
        <section className="rounded-3xl border bg-slate-950 p-6 text-white">
          <h2 className="font-semibold">Decisão formal da diretoria</h2>
          <p className="mt-2 text-sm text-slate-400">
            GO é aceito apenas com 100% dos controles. NO-GO encerra o ciclo com
            justificativa e preserva todas as provas.
          </p>
          <div className="mt-4 flex gap-3">
            <button
              disabled={busy || !a?.goAllowed}
              onClick={() => decide("go")}
              className="rounded-full bg-emerald-400 px-5 py-2.5 text-sm font-semibold text-slate-950 disabled:opacity-40"
            >
              Registrar GO
            </button>
            <button
              disabled={busy}
              onClick={() => decide("no_go")}
              className="rounded-full border border-rose-300 px-5 py-2.5 text-sm"
            >
              Registrar NO-GO
            </button>
          </div>
        </section>
      ) : null}
      <p className="text-xs text-slate-500">
        O aceite registra decisão, mas não publica arquivos, não altera DNS e
        não expõe segredos.
      </p>
    </main>
  );
}
