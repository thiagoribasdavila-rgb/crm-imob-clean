"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Cohort = {
  sessions: number;
  averageDurationMs: number | null;
  averageClicks: number | null;
  errorRate: number | null;
  readingRate: number | null;
  completionRate: number | null;
  decisionQuality: number | null;
};

type Measurement = {
  before: Cohort;
  after: Cohort;
  comparable: boolean;
  minimumSample: number;
  caveat: string;
};

type LoadState = "loading" | "ready" | "unavailable";

const isMeasuredValue = (value: unknown): value is number | null =>
  value === null || (typeof value === "number" && Number.isFinite(value));

function isCohort(value: unknown): value is Cohort {
  if (!value || typeof value !== "object") return false;
  const cohort = value as Record<string, unknown>;

  return (
    typeof cohort.sessions === "number" &&
    Number.isFinite(cohort.sessions) &&
    cohort.sessions >= 0 &&
    isMeasuredValue(cohort.averageDurationMs) &&
    isMeasuredValue(cohort.averageClicks) &&
    isMeasuredValue(cohort.errorRate) &&
    isMeasuredValue(cohort.readingRate) &&
    isMeasuredValue(cohort.completionRate) &&
    isMeasuredValue(cohort.decisionQuality)
  );
}

function isMeasurement(value: unknown): value is Measurement {
  if (!value || typeof value !== "object") return false;
  const measurement = value as Record<string, unknown>;

  return (
    isCohort(measurement.before) &&
    isCohort(measurement.after) &&
    typeof measurement.comparable === "boolean" &&
    typeof measurement.minimumSample === "number" &&
    Number.isFinite(measurement.minimumSample) &&
    measurement.minimumSample >= 0 &&
    typeof measurement.caveat === "string"
  );
}

const format = (key: keyof Cohort, value: number | null) => {
  if (value === null) return "Não medido";
  if (key === "averageDurationMs") return `${(value / 1000).toFixed(1)} s`;
  if (["errorRate", "readingRate", "completionRate"].includes(key)) {
    return `${(value * 100).toFixed(1)}%`;
  }
  return value.toFixed(1);
};

export function OperationalUxMeasurement() {
  const [data, setData] = useState<Measurement | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadMeasurement() {
      setLoadState("loading");
      try {
        const token = (await supabase.auth.getSession()).data.session
          ?.access_token;
        if (!token) throw new Error("missing-session");

        const response = await fetch("/api/v1/analytics/operational-ux", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("measurement-unavailable");

        const payload = (await response.json()) as { data?: unknown };
        if (!isMeasurement(payload.data)) {
          throw new Error("invalid-measurement");
        }
        if (!active) return;

        setData(payload.data);
        setLoadState("ready");
      } catch {
        if (active) setLoadState("unavailable");
      }
    }

    void loadMeasurement();
    return () => {
      active = false;
    };
  }, [attempt]);

  if (loadState === "loading") {
    return (
      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 text-sm text-zinc-500">
        Medindo eficiência operacional…
      </section>
    );
  }

  if (loadState === "unavailable" || !data) {
    return (
      <section className="rounded-2xl border border-amber-400/20 bg-amber-400/[.06] p-5">
        <p className="text-sm font-semibold text-amber-100">
          A medição de eficiência não está disponível agora.
        </p>
        <p className="mt-1 text-sm leading-6 text-zinc-400">
          A operação continua preservada. Tente atualizar a leitura quando a
          conexão estiver estável.
        </p>
        <button
          type="button"
          onClick={() => setAttempt((value) => value + 1)}
          className="mt-4 rounded-full border border-amber-300/30 px-3 py-2 text-xs font-semibold text-amber-100 transition hover:border-amber-200 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
        >
          Tentar novamente
        </button>
      </section>
    );
  }

  const metrics: Array<[string, keyof Cohort]> = [
    ["Tempo por sessão", "averageDurationMs"],
    ["Cliques por sessão", "averageClicks"],
    ["Sessões com erro", "errorRate"],
    ["Engajamento de leitura", "readingRate"],
    ["Conclusão observada", "completionRate"],
    ["Qualidade da decisão", "decisionQuality"],
  ];

  return (
    <section
      className="rounded-2xl border border-zinc-800 bg-zinc-900/55 p-5"
      data-ux-phase="59-before-after-measurement"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-cyan-300">
            Eficiência observada
          </p>
          <h2 className="mt-1 text-xl font-bold">Antes × depois</h2>
        </div>
        <span
          className={
            data.comparable
              ? "text-xs text-emerald-300"
              : "text-xs text-amber-300"
          }
        >
          {data.comparable
            ? "Amostra comparável"
            : `Aguardando ${data.minimumSample} sessões por período`}
        </span>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="text-xs text-zinc-500">
            <tr>
              <th className="py-2">Métrica</th>
              <th>Antes ({data.before.sessions})</th>
              <th>Depois ({data.after.sessions})</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {metrics.map(([label, key]) => (
              <tr key={key}>
                <td className="py-3 text-zinc-300">{label}</td>
                <td>{format(key, data.before[key])}</td>
                <td>{format(key, data.after[key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs leading-5 text-zinc-500">{data.caveat}</p>
    </section>
  );
}
