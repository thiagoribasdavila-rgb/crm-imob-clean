"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AtlasBadge, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { supabase } from "@/lib/supabase";

type Preference = {
  channel: string;
  consent_status: string;
  lawful_basis?: string;
  evidence?: string;
  preferred: boolean;
  allowed_start: string;
  allowed_end: string;
  allowed_days: number[];
  timezone: string;
  valid_until?: string | null;
};

type Payload = {
  lead: { id: string; name: string };
  preferences: Preference[];
  eligibility: Record<string, { eligible: boolean; reason: string }>;
};

type PreferenceReview = {
  preference: Preference;
  status: "granted" | "denied" | "unknown";
  lawfulBasis: string;
  evidence: string;
};

const channelLabels: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
  phone: "Telefone",
  sms: "SMS",
};

const statusLabels = {
  granted: "Autorizar contato",
  denied: "Registrar opt-out",
  unknown: "Marcar para revisão",
};

async function accessToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
}

export default function ContactPreferencesPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [review, setReview] = useState<PreferenceReview | null>(null);

  async function load() {
    const token = await accessToken();
    if (!token) {
      setError("Sessão expirada.");
      return;
    }
    const response = await fetch(`/api/v1/leads/${id}/contact-preferences`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const payload = await response.json();
    if (!response.ok) setError(payload.error?.message || "Falha ao carregar preferências.");
    else {
      setData(payload.data);
      setError("");
    }
  }

  useEffect(() => {
    void load();
  }, [id]);

  function openReview(preference: Preference, status: PreferenceReview["status"]) {
    setReview({
      preference,
      status,
      lawfulBasis: status === "granted"
        ? preference.lawful_basis || "Autorização expressa registrada durante atendimento."
        : "",
      evidence: preference.evidence || "",
    });
  }

  async function save() {
    if (!review || review.evidence.trim().length < 10) return;
    if (review.status === "granted" && review.lawfulBasis.trim().length < 10) return;

    setBusy(review.preference.channel);
    setError("");
    const token = await accessToken();
    const response = await fetch(`/api/v1/leads/${id}/contact-preferences`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        channel: review.preference.channel,
        status: review.status,
        lawfulBasis: review.lawfulBasis.trim(),
        evidence: review.evidence.trim(),
        preferred: review.preference.preferred,
        allowedStart: review.preference.allowed_start,
        allowedEnd: review.preference.allowed_end,
        allowedDays: review.preference.allowed_days,
        timezone: review.preference.timezone,
        validUntil: review.preference.valid_until || null,
        humanConfirmed: true,
      }),
    });
    const payload = await response.json();
    if (!response.ok) setError(payload.error?.message || "Preferência não salva.");
    else {
      setReview(null);
      await load();
    }
    setBusy("");
  }

  const reviewReady = Boolean(
    review
      && review.evidence.trim().length >= 10
      && (review.status !== "granted" || review.lawfulBasis.trim().length >= 10),
  );

  return (
    <div className="space-y-6 pb-10" data-phase="73-contact-consent-preferences">
      <section className="atlas-grid-glow rounded-[30px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.12] via-blue-500/[.07] to-violet-500/[.12] p-6 sm:p-8">
        <Link href={`/leads/${id}`} className="text-sm font-semibold text-sky-300">← Voltar à lead</Link>
        <div className="mt-5 flex flex-wrap gap-2">
          <AtlasBadge tone="success">CONSENTIMENTO</AtlasBadge>
          <AtlasBadge tone="info">CANAL E HORÁRIO</AtlasBadge>
          <AtlasBadge tone="warning">OPT-OUT IMEDIATO</AtlasBadge>
        </div>
        <h1 className="mt-5 text-3xl font-semibold text-white sm:text-5xl">
          Como {data?.lead.name || "a lead"} prefere conversar?
        </h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
          Uma única regra governa corretor, WhatsApp e IA. Sem autorização ou fora do horário,
          o contato não é preparado nem enviado.
        </p>
      </section>

      {error ? <div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-rose-200">{error}</div> : null}

      {data ? (
        <section className="grid gap-4 sm:grid-cols-3">
          <AtlasMetric label="Canais autorizados" value={Object.values(data.eligibility).filter((item) => item.eligible).length} detail="Consentimento e horário válidos" trend="AGORA" tone="green" />
          <AtlasMetric label="Bloqueados" value={Object.values(data.eligibility).filter((item) => !item.eligible).length} detail="IA e envio respeitam a decisão" trend="PROTEGIDO" tone="amber" />
          <AtlasMetric label="Fonte única" value="1" detail="Corretor e automações consultam igual" trend="CANÔNICO" tone="blue" />
        </section>
      ) : null}

      {!data && !error ? <AtlasSkeleton className="h-80 w-full" /> : null}

      <div className="grid gap-5 md:grid-cols-2">
        {data?.preferences.map((preference) => {
          const eligibility = data.eligibility[preference.channel];
          return (
            <AtlasCard key={preference.channel}>
              <AtlasCardHeader
                eyebrow={channelLabels[preference.channel]}
                title={eligibility?.eligible ? "Contato permitido agora" : "Contato bloqueado agora"}
                description={eligibility?.reason || "Aguardando avaliação"}
                action={
                  <AtlasBadge tone={preference.consent_status === "granted" ? "success" : preference.consent_status === "denied" ? "danger" : "warning"}>
                    {preference.consent_status}
                  </AtlasBadge>
                }
              />
              <div className="space-y-4 p-5">
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-xs text-slate-400">
                    Início
                    <input
                      type="time"
                      value={preference.allowed_start.slice(0, 5)}
                      onChange={(event) => setData((current) => current ? {
                        ...current,
                        preferences: current.preferences.map((item) => item.channel === preference.channel ? { ...item, allowed_start: event.target.value } : item),
                      } : current)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#0a1120] p-3 text-white"
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Fim
                    <input
                      type="time"
                      value={preference.allowed_end.slice(0, 5)}
                      onChange={(event) => setData((current) => current ? {
                        ...current,
                        preferences: current.preferences.map((item) => item.channel === preference.channel ? { ...item, allowed_end: event.target.value } : item),
                      } : current)}
                      className="mt-1 w-full rounded-xl border border-white/10 bg-[#0a1120] p-3 text-white"
                    />
                  </label>
                </div>
                <label className="flex gap-2 text-sm text-slate-300">
                  <input
                    type="checkbox"
                    checked={preference.preferred}
                    onChange={(event) => setData((current) => current ? {
                      ...current,
                      preferences: current.preferences.map((item) => item.channel === preference.channel ? { ...item, preferred: event.target.checked } : item),
                    } : current)}
                  />
                  Canal preferido pelo cliente
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button type="button" disabled={busy === preference.channel} onClick={() => openReview(preference, "granted")} className="atlas-button-primary">Autorizar</button>
                  <button type="button" disabled={busy === preference.channel} onClick={() => openReview(preference, "denied")} className="atlas-button-secondary">Opt-out</button>
                  <button type="button" disabled={busy === preference.channel} onClick={() => openReview(preference, "unknown")} className="atlas-button-secondary">Revisar</button>
                </div>
                <p className="text-[11px] leading-5 text-slate-500">
                  Autorizar exige base e evidência. Opt-out bloqueia imediatamente pendências e novos contatos do canal.
                </p>
              </div>
            </AtlasCard>
          );
        })}
      </div>

      {review ? (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy) setReview(null);
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="contact-review-title" className="w-full max-w-2xl rounded-[28px] border border-cyan-300/20 bg-[#08101f] p-6 shadow-[0_30px_120px_rgba(0,0,0,.65)]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="atlas-eyebrow text-cyan-200">Evidência de preferência</p>
                <h2 id="contact-review-title" className="mt-2 text-2xl font-semibold text-white">{statusLabels[review.status]}</h2>
                <p className="mt-2 text-sm text-slate-400">Canal: {channelLabels[review.preference.channel] || review.preference.channel}</p>
              </div>
              <button type="button" onClick={() => setReview(null)} disabled={Boolean(busy)} className="atlas-button-secondary" aria-label="Fechar revisão">Fechar</button>
            </div>

            {review.status === "granted" ? (
              <label className="mt-6 block text-xs text-slate-400" htmlFor="lawful-basis">
                Base ou autorização do contato
                <textarea
                  id="lawful-basis"
                  value={review.lawfulBasis}
                  onChange={(event) => setReview((current) => current ? { ...current, lawfulBasis: event.target.value } : current)}
                  minLength={10}
                  maxLength={500}
                  rows={3}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 p-4 text-sm leading-6 text-white outline-none focus:border-cyan-300/40"
                />
              </label>
            ) : null}

            <label className="mt-4 block text-xs text-slate-400" htmlFor="contact-evidence">
              Quando e como a preferência foi confirmada
              <textarea
                id="contact-evidence"
                value={review.evidence}
                onChange={(event) => setReview((current) => current ? { ...current, evidence: event.target.value } : current)}
                minLength={10}
                maxLength={1000}
                rows={4}
                placeholder="Ex.: cliente solicitou o opt-out por WhatsApp em 23/07/2026 às 14h."
                className="mt-2 w-full rounded-2xl border border-white/10 bg-slate-950 p-4 text-sm leading-6 text-white outline-none focus:border-cyan-300/40"
              />
            </label>

            <div className={`mt-4 rounded-2xl border p-4 text-xs leading-6 ${review.status === "denied" ? "border-rose-300/15 bg-rose-300/[.04] text-rose-100" : "border-white/[.07] bg-white/[.025] text-slate-300"}`}>
              {review.status === "denied"
                ? "O opt-out bloqueia imediatamente novas mensagens e pendências deste canal. O histórico permanece preservado."
                : "A decisão será usada por corretores, automações e IA como fonte única de verdade."}
            </div>

            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button type="button" onClick={() => setReview(null)} disabled={Boolean(busy)} className="atlas-button-secondary">Voltar e revisar</button>
              <button type="button" onClick={() => void save()} disabled={Boolean(busy) || !reviewReady} className="atlas-button-primary disabled:opacity-50">
                {busy ? "Salvando..." : "Confirmar preferência"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
