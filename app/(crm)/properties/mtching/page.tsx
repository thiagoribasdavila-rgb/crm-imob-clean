"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { matchLeadToProperty } from "@/lib/atlas/matching";
import { supabase } from "@/lib/supabase";
import type { AtlasLead, AtlasProperty } from "@/types/atlas";

type LeadRow = { id: string; name: string | null; phone: string | null; budget_min: number | null; budget_max: number | null; preferred_regions: string[] | null; bedrooms: number | null; score: number | null };
type PropertyRow = { id: string; title: string | null; price: number | null; city: string | null; state: string | null; bedrooms: number | null; bathrooms: number | null; parking_spaces: number | null; area: number | null; status: string | null };
type ActivityRow = { id: string; type: string; metadata: { propertyId?: string; propertyIds?: string[]; signal?: "interested" | "rejected"; reason?: string } | null };
type LeadPayload = { lead: LeadRow; properties: PropertyRow[]; activities: ActivityRow[] };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/* CC-6: recomendação vira estado semântico único por par lead↔imóvel. */
const recommendationMeta: Record<"priorizar" | "avaliar" | "não recomendar", { label: string; tone: "success" | "info" | "danger"; band: string }> = {
  priorizar: { label: "Priorizar", tone: "success", band: "#34d399" },
  avaliar: { label: "Avaliar", tone: "info", band: "var(--atlas-accent)" },
  "não recomendar": { label: "Não recomendar", tone: "danger", band: "#fb7185" },
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const selectClass =
  `min-h-11 w-full rounded-xl border border-[rgba(148,163,184,0.14)] bg-[#0b1224] px-4 text-sm text-[#e8eef8] transition-colors focus:border-[color:var(--atlas-accent)] ${focusRing}`;
const toggleClass = (active: boolean, activeInk: string) =>
  `min-h-9 rounded-xl border px-3 text-xs font-semibold transition-colors disabled:opacity-40 ${active ? activeInk : "border-[rgba(148,163,184,0.2)] text-[#aab6ca] hover:border-[rgba(148,163,184,0.35)] hover:text-[#e8eef8]"} ${focusRing}`;

export default function PropertyMatching() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [payload, setPayload] = useState<LeadPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
  const [draft, setDraft] = useState<{ content: string; mode: string; requiresHumanApproval: boolean } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [registered, setRegistered] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState<string | null>(null);
  const [feedbackReasons, setFeedbackReasons] = useState<Record<string, string>>({});

  async function api(path: string) {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Sessão expirada. Entre novamente.");
    const response = await fetch(path, { headers: { Authorization: `Bearer ${data.session.access_token}` } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error?.message || body.error || "Não foi possível carregar os dados.");
    return body;
  }

  useEffect(() => {
    void (async () => {
      try {
        const body = await api("/api/v1/crm/leads?page=1&limit=100&sort=score&direction=desc");
        const rows = (body.data?.items ?? body.items ?? []) as LeadRow[];
        setLeads(rows);
        if (rows[0]) setSelectedId(rows[0].id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Falha ao carregar leads.");
      } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setSelectedProperties([]); setDraft(null); setRegistered(false);
    setLoading(true); setError(null);
    void api(`/api/v1/leads/${selectedId}`).then((data) => setPayload(data)).catch((cause) => setError(cause instanceof Error ? cause.message : "Falha no matching.")).finally(() => setLoading(false));
  }, [selectedId]);

  function toggleProperty(propertyId: string) {
    setDraft(null); setRegistered(false);
    setSelectedProperties((current) => current.includes(propertyId)
      ? current.filter((id) => id !== propertyId)
      : current.length < 3 ? [...current, propertyId] : current);
  }

  async function generatePresentation() {
    if (!selectedProperties.length) return;
    setGenerating(true); setError(null); setCopied(false);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Sessão expirada. Entre novamente.");
      const response = await fetch(`/api/v1/leads/${selectedId}/presentation-draft`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ propertyIds: selectedProperties }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao preparar apresentação.");
      setDraft(body.draft);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao preparar apresentação."); }
    finally { setGenerating(false); }
  }

  async function registerPresentation() {
    if (!draft || !selectedProperties.length) return;
    setRegistering(true); setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Sessão expirada. Entre novamente.");
      const response = await fetch(`/api/v1/leads/${selectedId}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ action: "property_presentation", propertyIds: selectedProperties, channel: "whatsapp" }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao registrar apresentação.");
      setRegistered(true);
      const refreshed = await api(`/api/v1/leads/${selectedId}`) as LeadPayload;
      setPayload(refreshed);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao registrar apresentação."); }
    finally { setRegistering(false); }
  }

  async function saveFeedback(propertyId: string, signal: "interested" | "rejected") {
    const reason = feedbackReasons[propertyId] || "";
    if (signal === "rejected" && !reason) { setError("Selecione o principal motivo para melhorar as próximas recomendações."); return; }
    setFeedbackSaving(propertyId); setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) throw new Error("Sessão expirada. Entre novamente.");
      const response = await fetch(`/api/v1/leads/${selectedId}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ action: "property_feedback", propertyId, signal, reason: reason || null }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao registrar retorno.");
      const refreshed = await api(`/api/v1/leads/${selectedId}`) as LeadPayload;
      setPayload(refreshed);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao registrar retorno."); }
    finally { setFeedbackSaving(null); }
  }

  const feedbackByProperty = useMemo(() => {
    const feedback = new Map<string, "interested" | "rejected">();
    for (const activity of payload?.activities ?? []) {
      const propertyId = activity.metadata?.propertyId;
      const signal = activity.metadata?.signal;
      if (activity.type === "property_feedback" && propertyId && signal && !feedback.has(propertyId)) feedback.set(propertyId, signal);
    }
    return feedback;
  }, [payload?.activities]);

  const presentedProperties = useMemo(() => {
    const ids = new Set<string>();
    for (const activity of payload?.activities ?? []) {
      if (activity.type === "property_presentation") for (const propertyId of activity.metadata?.propertyIds ?? []) ids.add(propertyId);
    }
    return ids;
  }, [payload?.activities]);

  async function copyDraft() {
    if (!draft) return;
    await navigator.clipboard.writeText(draft.content);
    setCopied(true);
  }

  const matches = useMemo(() => {
    if (!payload) return [];
    const lead: Partial<AtlasLead> = { budgetMin: payload.lead.budget_min, budgetMax: payload.lead.budget_max, bedrooms: payload.lead.bedrooms, preferredRegions: payload.lead.preferred_regions ?? [] };
    return payload.properties.map((property) => {
      const model: AtlasProperty = { id: property.id, title: property.title, price: property.price, city: property.city, state: property.state, bedrooms: property.bedrooms, bathrooms: property.bathrooms, parkingSpaces: property.parking_spaces, area: property.area, status: property.status };
      return { property, match: matchLeadToProperty(lead, model, feedbackByProperty.get(property.id)) };
    }).sort((a, b) => b.match.score - a.match.score).slice(0, 12);
  }, [feedbackByProperty, payload]);

  const whatsappUrl = (() => {
    if (!draft || !payload?.lead.phone) return null;
    let phone = payload.lead.phone.replace(/\D/g, "");
    if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
    return phone.length >= 12 ? `https://wa.me/${phone}?text=${encodeURIComponent(draft.content)}` : null;
  })();

  return (
    <div className="space-y-4 pb-12" data-matching-layout="cc6-explainable" aria-busy={loading}>
      <PageHeader
        eyebrow="Imóveis · Matching"
        title="Imóvel certo, cliente certo"
        description="Ranking explicável por orçamento, região, tipologia e estoque — confirme a disponibilidade antes de apresentar."
      />

      {/* Controle do par lead↔carteira (única superfície com 3D): seleção do
          cliente + ações. Consolida o hero antigo e o sub-header "Ranking". */}
      <section aria-label="Cliente em análise">
        <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 lg:max-w-sm lg:flex-1">
              <label htmlFor="matching-lead" className="cc6-eyebrow">Cliente</label>
              <select id="matching-lead" value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className={`${selectClass} mt-2`}>
                {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name || "Lead sem nome"} · score {lead.score ?? 0}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="cc6-chip" title="Selecione até 3 imóveis para montar a apresentação.">{selectedProperties.length}/3 selecionados</span>
              <button type="button" onClick={() => void generatePresentation()} disabled={!selectedProperties.length || generating} className="atlas-button-primary disabled:opacity-40">
                {generating ? "Preparando…" : "Apresentar selecionados"}
              </button>
              {payload ? <Link href={`/leads/${payload.lead.id}`} className="cc6-ghost-btn">Lead 360</Link> : null}
            </div>
          </div>
        </TiltShell>
      </section>

      {error ? (
        <div role="alert" className="cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-sm text-[#fb7185]" style={{ "--cc6-sev": "#fb7185" } as CSSProperties}>
          {error}
        </div>
      ) : null}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <AtlasSkeleton className="h-64 w-full" /><AtlasSkeleton className="h-64 w-full" /><AtlasSkeleton className="h-64 w-full" />
        </div>
      ) : null}
      {!loading && !leads.length ? (
        <p className="text-sm text-[#6b7890]">
          Nenhum lead visível — <Link href="/leads" className={`font-semibold text-[color:var(--atlas-accent-hover)] transition-colors hover:text-[#e8eef8] ${focusRing}`}>cadastre ou receba um lead</Link> para iniciar o matching.
        </p>
      ) : null}

      {!loading && payload ? <>
        {draft ? (
          <section className="cc6-sev-band cc6-panel cc6-reveal p-5" style={{ "--cc6-sev": "#34d399" } as CSSProperties} aria-labelledby="matching-draft-title">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 id="matching-draft-title" className="text-sm font-semibold tracking-tight text-[#e8eef8]">
                    Apresentação para {payload.lead.name || "o lead"}
                  </h2>
                  <StatusBadge tone="success">Rascunho · aprovação humana</StatusBadge>
                </div>
                <p className="cc6-num mt-1 text-[11px] text-[#6b7890]">{draft.mode === "generative" ? "IA generativa" : "motor local seguro"} · revise antes de enviar</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void copyDraft()} className="cc6-ghost-btn">{copied ? "Copiado ✓" : "Copiar mensagem"}</button>
                {whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" className="atlas-button-primary">Abrir no WhatsApp</a> : null}
                <button type="button" onClick={() => void registerPresentation()} disabled={registered || registering} className="cc6-ghost-btn disabled:opacity-50">
                  {registered ? "Registrado ✓" : registering ? "Registrando…" : "Registrar no histórico"}
                </button>
              </div>
            </div>
            <div className="cc6-panel-quiet mt-4 p-4 text-sm text-[#e8eef8]"><MessageResponse>{draft.content}</MessageResponse></div>
            {!whatsappUrl ? <p className="cc6-warn mt-2 text-[12px] leading-5">Telefone ausente ou inválido — copie a mensagem e atualize o cadastro do lead.</p> : null}
            {registered ? <p className="cc6-ok mt-2 text-[12px] leading-5">Apresentação registrada na timeline; entra nas próximas recomendações.</p> : null}
          </section>
        ) : null}

        <section aria-label={`Melhores opções para ${payload.lead.name || "este lead"}`} className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {matches.map(({ property, match }, index) => {
            const rec = recommendationMeta[match.recommendation];
            const isSelected = selectedProperties.includes(property.id);
            const feedback = feedbackByProperty.get(property.id);
            return (
              <article
                key={property.id}
                className="cc6-sev-band cc6-panel-quiet cc6-reveal flex flex-col gap-3 py-4 pl-5 pr-4 transition-colors hover:border-[rgba(148,163,184,0.22)]!"
                style={{ animationDelay: `${Math.min(index, 8) * 45}ms`, "--cc6-sev": rec.band } as CSSProperties}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="cc6-num text-[11px] text-[#6b7890]">#{String(index + 1).padStart(2, "0")}</span>
                      <StatusBadge tone={rec.tone}>{rec.label}</StatusBadge>
                    </div>
                    <h3 className="mt-1.5 truncate text-[15px] font-semibold tracking-tight text-[#e8eef8]" title={property.title || undefined}>
                      {property.title || "Imóvel sem título"}
                    </h3>
                    <p className="cc6-num mt-0.5 truncate text-[11px] text-[#6b7890]">{[property.city, property.state].filter(Boolean).join(" · ") || "Localização pendente"}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="cc6-metric-value text-3xl leading-none">{match.score}</p>
                    <p className="cc6-metric-label mt-1">aderência · conf. {match.confidence}</p>
                  </div>
                </div>

                <p className="cc6-num text-[12px] text-[#aab6ca]">
                  {property.price ? money.format(property.price) : "Preço pendente"} · {property.bedrooms ?? "—"} dorm. · {property.area ?? "—"} m²
                </p>

                {/* O porquê do match em uma linha mono (íntegra no title). */}
                <div className="space-y-1">
                  {match.reasons.length ? (
                    <p className="cc6-num cc6-ok truncate text-[11px]" title={match.reasons.join(" · ")}>✓ {match.reasons.slice(0, 3).join(" · ")}</p>
                  ) : null}
                  {match.risks.length ? (
                    <p className="cc6-num cc6-warn truncate text-[11px]" title={match.risks.join(" · ")}>! {match.risks.slice(0, 2).join(" · ")}</p>
                  ) : null}
                </div>

                {presentedProperties.has(property.id) ? (
                  <div className="cc6-hairline pt-3">
                    <p className="cc6-eyebrow">Retorno do cliente</p>
                    <label className="sr-only" htmlFor={`matching-reason-${property.id}`}>Motivo principal do retorno</label>
                    <select
                      id={`matching-reason-${property.id}`}
                      value={feedbackReasons[property.id] || ""}
                      onChange={(event) => setFeedbackReasons((current) => ({ ...current, [property.id]: event.target.value }))}
                      className={`${selectClass} mt-2`}
                    >
                      <option value="">Motivo principal (necessário se não aderiu)</option>
                      <option value="price">Preço</option>
                      <option value="location">Localização</option>
                      <option value="typology">Tipologia</option>
                      <option value="payment">Condição de pagamento</option>
                      <option value="delivery">Prazo de entrega</option>
                      <option value="product">Produto/diferenciais</option>
                      <option value="other">Outro</option>
                    </select>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={feedbackSaving === property.id}
                        onClick={() => void saveFeedback(property.id, "interested")}
                        className={toggleClass(feedback === "interested", "border-[rgba(52,211,153,0.4)] bg-[rgba(52,211,153,0.1)] text-[#34d399]")}
                      >
                        Gostou
                      </button>
                      <button
                        type="button"
                        disabled={feedbackSaving === property.id || !feedbackReasons[property.id]}
                        onClick={() => void saveFeedback(property.id, "rejected")}
                        className={toggleClass(feedback === "rejected", "border-[rgba(251,113,133,0.4)] bg-[rgba(251,113,133,0.1)] text-[#fb7185]")}
                      >
                        Não aderiu
                      </button>
                    </div>
                  </div>
                ) : null}

                <div className="cc6-hairline mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    disabled={match.recommendation === "não recomendar"}
                    onClick={() => toggleProperty(property.id)}
                    className={`rounded-full border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors disabled:opacity-30 ${isSelected ? "border-[rgba(52,211,153,0.4)] bg-[rgba(52,211,153,0.1)] text-[#34d399]" : "border-[rgba(148,163,184,0.2)] text-[#aab6ca] hover:border-[rgba(148,163,184,0.35)] hover:text-[#e8eef8]"} ${focusRing}`}
                  >
                    {isSelected ? "✓ Selecionado" : "Selecionar"}
                  </button>
                  <button
                    type="button"
                    disabled={match.recommendation === "não recomendar"}
                    onClick={() => { window.location.href = `/leads/${payload.lead.id}`; }}
                    className={`rounded-md text-[12px] font-semibold text-[color:var(--atlas-accent-hover)] transition-colors hover:text-[#e8eef8] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`}
                  >
                    Apresentar pelo Lead 360 →
                  </button>
                </div>
              </article>
            );
          })}
        </section>
        {!matches.length ? (
          <p className="text-sm text-[#6b7890]">Sem imóveis para comparar — atualize o estoque para gerar recomendações.</p>
        ) : null}
      </> : null}
    </div>
  );
}
