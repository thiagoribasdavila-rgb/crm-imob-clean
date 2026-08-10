"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { supabase } from "@/lib/supabase";

type Lead = {
  id: string;
  name: string;
  assigned_to: string | null;
  source: string | null;
  status: string;
  score: number;
  data_quality_percent: number;
  created_at: string;
};

type Group = {
  identityFingerprint: string;
  count: number;
  recommendedMasterId: string;
  leads: Lead[];
};

type Payload = {
  groups: Group[];
  summary: { groups: number; records: number; potentialReductions: number };
};

type MergeReview = {
  group: Group;
  masterId: string;
  reason: string;
};

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

export default function DeduplicationPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [review, setReview] = useState<MergeReview | null>(null);

  async function load() {
    const token = await accessToken();
    if (!token) {
      setError("Sessão expirada.");
      return;
    }
    const response = await fetch("/api/v1/leads/deduplication", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) setError(payload.error?.message || "Falha ao analisar duplicidades.");
    else {
      setData(payload.data);
      setError("");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function openReview(group: Group, masterId: string) {
    setReview({
      group,
      masterId,
      reason: "Mesmo contato confirmado; manter a lead com dados mais completos como principal.",
    });
  }

  async function merge() {
    if (!review || review.reason.trim().length < 10) return;
    const duplicates = review.group.leads
      .filter((item) => item.id !== review.masterId)
      .map((item) => item.id);

    setBusy(review.group.identityFingerprint);
    setError("");
    const token = await accessToken();
    const response = await fetch("/api/v1/leads/deduplication", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        canonicalLeadId: review.masterId,
        duplicateLeadIds: duplicates,
        reason: review.reason.trim(),
        humanConfirmed: true,
      }),
    });
    const payload = await response.json();
    if (!response.ok) setError(payload.error?.message || "Consolidação não concluída.");
    else {
      setReview(null);
      await load();
    }
    setBusy("");
  }

  const selectedMaster = review?.group.leads.find((lead) => lead.id === review.masterId);

  return (
    <div className="space-y-6 pb-10" data-phase="72-unique-lead-identity">
      <section className="atlas-grid-glow rounded-[30px] border border-violet-400/10 bg-gradient-to-br from-violet-500/[.13] via-blue-500/[.07] to-cyan-500/[.08] p-6 sm:p-8">
        <Link href="/leads" className="text-sm font-semibold text-sky-300">← Voltar às leads</Link>
        <div className="mt-5 flex flex-wrap gap-2">
          <AtlasBadge tone="violet">IDENTIDADE ÚNICA</AtlasBadge>
          <AtlasBadge tone="success">HISTÓRICO PRESERVADO</AtlasBadge>
          <AtlasBadge tone="warning">DECISÃO HUMANA</AtlasBadge>
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-white sm:text-5xl">Uma pessoa, uma lead ativa.</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          O Atlas encontra telefone ou e-mail idêntico, mascara o contato e sugere a lead mais completa.
          Nada é unido automaticamente.
        </p>
      </section>

      {error ? <div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-rose-200">{error}</div> : null}

      {data ? (
        <section className="grid gap-4 sm:grid-cols-3">
          <AtlasMetric label="Grupos encontrados" value={data.summary.groups} detail="Identidade exata repetida" trend="REVISAR" tone="amber" />
          <AtlasMetric label="Registros envolvidos" value={data.summary.records} detail="Nenhum apagado" trend="PRESERVADOS" tone="blue" />
          <AtlasMetric label="Redução potencial" value={data.summary.potentialReductions} detail="Leads ativas duplicadas" trend="CARTEIRA" tone="green" />
        </section>
      ) : null}

      {!data && !error ? <AtlasSkeleton className="h-80 w-full" /> : null}

      <div className="space-y-5">
        {data?.groups.map((group) => (
          <AtlasCard key={group.identityFingerprint}>
            <AtlasCardHeader
              eyebrow={group.identityFingerprint}
              title={`${group.count} registros da mesma identidade`}
              description="Escolha a principal. As demais serão arquivadas, sem apagar timeline ou origem."
            />
            <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
              {group.leads.map((lead) => (
                <article
                  key={lead.id}
                  className={`rounded-2xl border p-4 ${lead.id === group.recommendedMasterId ? "border-emerald-400/20 bg-emerald-400/[.05]" : "border-white/[.07] bg-white/[.025]"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <strong className="text-white">{lead.name}</strong>
                      <p className="mt-1 text-xs text-slate-500">{lead.source || "Origem não informada"} · {lead.status}</p>
                    </div>
                    {lead.id === group.recommendedMasterId ? <AtlasBadge tone="success">RECOMENDADA</AtlasBadge> : null}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-slate-400">
                    <span>Qualidade {lead.data_quality_percent}%</span>
                    <span>Score {lead.score}</span>
                    <span className="col-span-2">Criada em {new Date(lead.created_at).toLocaleDateString("pt-BR")}</span>
                  </div>
                  <button
                    type="button"
                    disabled={busy === group.identityFingerprint}
                    onClick={() => openReview(group, lead.id)}
                    className="atlas-button-secondary mt-4 w-full"
                  >
                    Manter esta como principal
                  </button>
                </article>
              ))}
            </div>
          </AtlasCard>
        ))}
        {data && !data.groups.length ? (
          <AtlasEmpty title="Nenhuma duplicidade exata" description="A base visível está com uma identidade ativa por contato normalizado." />
        ) : null}
      </div>

      {review ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setReview(null);
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="merge-review-title" className="w-full max-w-2xl rounded-[28px] border border-violet-300/20 bg-[#08101f] p-6 shadow-[0_30px_120px_rgba(0,0,0,.65)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="atlas-eyebrow text-violet-200">Consolidação auditável</p>
                <h2 id="merge-review-title" className="mt-2 text-2xl font-semibold text-white">Confirmar a lead principal?</h2>
              </div>
              <button type="button" onClick={() => setReview(null)} disabled={Boolean(busy)} className="atlas-button-secondary" aria-label="Fechar revisão">Fechar</button>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[.04] p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Registro principal</p>
                <strong className="mt-2 block text-white">{selectedMaster?.name || "Lead selecionada"}</strong>
                <p className="mt-1 text-xs text-slate-400">Qualidade {selectedMaster?.data_quality_percent ?? "—"}% · score {selectedMaster?.score ?? "—"}</p>
              </div>
              <div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Registros arquivados</p>
                <strong className="mt-2 block text-white">{review.group.count - 1}</strong>
                <p className="mt-1 text-xs text-slate-400">Timeline, origem e evidências permanecem preservadas.</p>
              </div>
            </div>
            <label className="mt-4 block text-xs text-slate-400" htmlFor="merge-reason">
              Justificativa obrigatória
              <textarea
                id="merge-reason"
                value={review.reason}
                onChange={(event) => setReview((current) => current ? { ...current, reason: event.target.value } : current)}
                minLength={10}
                maxLength={500}
                rows={4}
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 p-4 text-sm leading-6 text-white outline-none focus:border-violet-300/40"
              />
            </label>
            <p className="mt-3 text-xs leading-5 text-slate-500">A ação não apaga dados e fica vinculada à sua identidade e justificativa.</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setReview(null)} disabled={Boolean(busy)} className="atlas-button-secondary">Voltar e revisar</button>
              <button type="button" onClick={() => void merge()} disabled={Boolean(busy) || review.reason.trim().length < 10} className="atlas-button-primary disabled:opacity-50">
                {busy ? "Consolidando..." : "Confirmar consolidação"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
