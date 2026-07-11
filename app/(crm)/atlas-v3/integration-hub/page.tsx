"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const toneByStatus = {
  ready: "border-emerald-400/15 bg-emerald-400/[0.05] text-emerald-200",
  attention: "border-amber-400/15 bg-amber-400/[0.05] text-amber-200",
  empty: "border-white/[0.07] bg-white/[0.025] text-slate-400",
} as const;

type Domain = {
  key: string;
  label: string;
  layer: "V1" | "V2" | "V3" | "Atlas 2030";
  href: string;
  total: number;
  status: keyof typeof toneByStatus;
  detail: string;
};

type Payload = {
  status: "operational" | "attention";
  readiness: number;
  domains: Domain[];
  totals: Record<string, number>;
  generatedAt: string;
  error?: string;
};

const statusLabel = {
  ready: "Conectado",
  attention: "Requer atenção",
  empty: "Aguardando dados",
} as const;

export default function AtlasV3IntegrationHubPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      setError("Sessão expirada. Entre novamente para consultar as integrações.");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/v3/integration-hub", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const data = (await response.json()) as Payload;
      if (!response.ok) throw new Error(data.error || "Falha ao carregar o Integration Hub.");
      setPayload(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha inesperada ao carregar integrações.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const summary = useMemo(() => {
    const domains = payload?.domains ?? [];
    return {
      connected: domains.filter((domain) => domain.status === "ready").length,
      attention: domains.filter((domain) => domain.status === "attention").length,
      waiting: domains.filter((domain) => domain.status === "empty").length,
    };
  }, [payload]);

  return (
    <div className="space-y-7 pb-12">
      <header className="relative overflow-hidden rounded-[32px] border border-cyan-400/15 bg-gradient-to-br from-cyan-500/[0.12] via-blue-500/[0.08] to-violet-500/[0.1] p-7 sm:p-9">
        <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="relative flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-4xl">
            <p className="atlas-eyebrow text-cyan-300">Atlas V3 · Integration Fabric</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-.05em] text-white sm:text-5xl">Um único painel para V1, V2, V3 e Atlas 2030.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">O Integration Hub verifica quais domínios estão conectados, onde existem dados reais, quais filas exigem atenção e quais camadas já podem operar no teste real.</p>
            <div className="mt-7 flex flex-wrap gap-3">
              <button onClick={() => void load()} className="atlas-button-primary" disabled={loading}>{loading ? "Sincronizando..." : "Sincronizar agora"}</button>
              <Link href="/atlas-v3" className="atlas-button-secondary">Voltar ao V3</Link>
              <Link href="/decision-center" className="atlas-button-secondary">Centro de decisão</Link>
            </div>
          </div>

          <div className="min-w-72 rounded-3xl border border-white/[0.08] bg-[#07101f]/75 p-5 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-400">Prontidão integrada</span>
              <span className="text-4xl font-semibold text-cyan-200">{loading ? "—" : `${payload?.readiness ?? 0}%`}</span>
            </div>
            <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500 transition-all duration-700" style={{ width: `${payload?.readiness ?? 0}%` }} />
            </div>
            <p className="mt-4 text-xs text-slate-500">{payload?.generatedAt ? `Atualizado em ${new Date(payload.generatedAt).toLocaleString("pt-BR")}` : "Aguardando primeira sincronização"}</p>
          </div>
        </div>
      </header>

      {error ? (
        <section className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-5 text-sm text-rose-100">
          <p className="font-semibold">Não foi possível consolidar o ecossistema.</p>
          <p className="mt-2 text-rose-200/75">{error}</p>
          <button onClick={() => void load()} className="mt-4 text-xs font-semibold text-white underline underline-offset-4">Tentar novamente</button>
        </section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          ["Domínios conectados", summary.connected, "ready"],
          ["Pontos de atenção", summary.attention, "attention"],
          ["Aguardando dados", summary.waiting, "empty"],
        ].map(([label, value, tone]) => (
          <article key={String(label)} className={`rounded-3xl border p-5 ${toneByStatus[tone as keyof typeof toneByStatus]}`}>
            <p className="text-xs font-semibold uppercase tracking-[.14em] opacity-70">{label}</p>
            <p className="mt-3 text-4xl font-semibold text-white">{loading ? "—" : value}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {(payload?.domains ?? []).map((domain) => (
          <Link key={domain.key} href={domain.href} className={`group rounded-3xl border p-6 transition hover:-translate-y-0.5 ${toneByStatus[domain.status]}`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-current/15 bg-black/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider">{domain.layer}</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wider opacity-70">{statusLabel[domain.status]}</span>
                </div>
                <h2 className="mt-4 text-xl font-semibold text-white">{domain.label}</h2>
              </div>
              <span className="text-xl transition group-hover:translate-x-1">→</span>
            </div>
            <p className="mt-4 text-sm leading-6 opacity-75">{domain.detail}</p>
            <div className="mt-6 flex items-end justify-between border-t border-current/10 pt-4">
              <span className="text-xs uppercase tracking-wider opacity-60">Entidades integradas</span>
              <span className="text-3xl font-semibold text-white">{domain.total}</span>
            </div>
          </Link>
        ))}

        {!loading && !payload?.domains?.length ? (
          <div className="rounded-3xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500 lg:col-span-2 xl:col-span-3">Nenhum domínio disponível para a organização atual.</div>
        ) : null}
      </section>

      <section className="atlas-panel p-6 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="atlas-eyebrow">Real-test sequence</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Fluxo recomendado de homologação</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Valide cada camada na ordem correta. O V3 depende de dados reais do V1 e sinais operacionais do V2 antes de gerar decisões confiáveis.</p>
          </div>
          <Link href="/dashboard" className="atlas-button-primary text-center">Iniciar pelo V1 →</Link>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-4">
          {[
            ["01", "V1", "Login, lead, pipeline e estoque"],
            ["02", "V2", "Campanhas, conversas e automações"],
            ["03", "V3", "Decisões, agentes e Digital Twins"],
            ["04", "2030", "Memória, recomendações e reservas"],
          ].map(([step, layer, detail]) => (
            <div key={step} className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4">
              <span className="text-xs font-semibold text-cyan-300">{step}</span>
              <p className="mt-2 font-semibold text-white">{layer}</p>
              <p className="mt-2 text-xs leading-5 text-slate-500">{detail}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
