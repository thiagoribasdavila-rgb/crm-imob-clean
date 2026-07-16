"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MessageResponse } from "@/components/ai-elements/message";
import { AtlasBadge, AtlasEmpty, AtlasProgress, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { matchLeadToProperty } from "@/lib/atlas/matching";
import { supabase } from "@/lib/supabase";
import type { AtlasLead, AtlasProperty } from "@/types/atlas";

type LeadRow = { id: string; name: string | null; phone: string | null; budget_min: number | null; budget_max: number | null; preferred_regions: string[] | null; bedrooms: number | null; score: number | null };
type PropertyRow = { id: string; title: string | null; price: number | null; city: string | null; state: string | null; bedrooms: number | null; bathrooms: number | null; parking_spaces: number | null; area: number | null; status: string | null };
type LeadPayload = { lead: LeadRow; properties: PropertyRow[] };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

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
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao registrar apresentação."); }
    finally { setRegistering(false); }
  }

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
      return { property, match: matchLeadToProperty(lead, model) };
    }).sort((a, b) => b.match.score - a.match.score).slice(0, 12);
  }, [payload]);

  const whatsappUrl = (() => {
    if (!draft || !payload?.lead.phone) return null;
    let phone = payload.lead.phone.replace(/\D/g, "");
    if (phone.length === 10 || phone.length === 11) phone = `55${phone}`;
    return phone.length >= 12 ? `https://wa.me/${phone}?text=${encodeURIComponent(draft.content)}` : null;
  })();

  return (
    <div className="space-y-6 pb-12">
      <section className="atlas-grid-glow rounded-[28px] border border-violet-400/15 bg-gradient-to-br from-violet-500/[.14] via-sky-500/[.06] to-transparent p-6 sm:p-8">
        <AtlasBadge tone="violet">MATCHING INTELLIGENCE</AtlasBadge>
        <div className="mt-4 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div><h1 className="text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Imóvel certo, cliente certo.</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Compare orçamento, região, tipologia e estoque com justificativas claras. A disponibilidade deve ser confirmada antes da apresentação.</p></div>
          <label className="min-w-72 text-xs font-semibold uppercase tracking-wider text-slate-400">Cliente
            <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} className="mt-2 w-full rounded-xl border border-white/10 bg-[#0a1020] px-4 py-3 text-sm normal-case tracking-normal text-white">
              {leads.map((lead) => <option key={lead.id} value={lead.id}>{lead.name || "Lead sem nome"} · score {lead.score ?? 0}</option>)}
            </select>
          </label>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-100">{error}</div> : null}
      {loading ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><AtlasSkeleton className="h-80" /><AtlasSkeleton className="h-80" /><AtlasSkeleton className="h-80" /></div> : null}
      {!loading && !leads.length ? <AtlasEmpty title="Nenhum lead visível" description="Cadastre ou atribua um lead para iniciar o matching." action={<Link href="/leads" className="atlas-button-primary">Ir para leads</Link>} /> : null}

      {!loading && payload ? <>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="atlas-eyebrow">Ranking explicável</p><h2 className="mt-1 text-2xl font-semibold text-white">Melhores opções para {payload.lead.name || "este lead"}</h2><p className="mt-2 text-xs text-slate-500">Selecione até 3 imóveis para montar a apresentação.</p></div><div className="flex gap-3"><button onClick={() => void generatePresentation()} disabled={!selectedProperties.length || generating} className="atlas-button-primary disabled:opacity-40">{generating ? "Preparando..." : `✦ Apresentar selecionados (${selectedProperties.length})`}</button><Link href={`/leads/${payload.lead.id}`} className="atlas-button-secondary">Lead 360</Link></div></div>
        {draft ? <section className="rounded-3xl border border-emerald-400/20 bg-emerald-400/[.06] p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div><AtlasBadge tone="success">RASCUNHO PARA APROVAÇÃO</AtlasBadge><p className="mt-3 text-xs text-slate-400">{draft.mode === "generative" ? "IA generativa" : "Motor local seguro"} · revise antes de enviar</p></div><div className="flex flex-wrap gap-2"><button onClick={() => void copyDraft()} className="atlas-button-secondary">{copied ? "Copiado ✓" : "Copiar mensagem"}</button>{whatsappUrl ? <a href={whatsappUrl} target="_blank" rel="noreferrer" className="atlas-button-primary">Abrir no WhatsApp</a> : null}<button onClick={() => void registerPresentation()} disabled={registered || registering} className="atlas-button-secondary disabled:opacity-50">{registered ? "Registrado ✓" : registering ? "Registrando..." : "Registrar no histórico"}</button></div></div><div className="mt-5 rounded-2xl border border-white/[.07] bg-[#070d1b]/70 p-5 text-sm text-slate-200"><MessageResponse>{draft.content}</MessageResponse></div>{!whatsappUrl ? <p className="mt-3 text-xs text-amber-300">Telefone ausente ou inválido. Copie a mensagem e atualize o cadastro do lead.</p> : null}{registered ? <p className="mt-3 text-xs text-emerald-300">Apresentação registrada na timeline. A IA poderá considerar esta ação nas próximas recomendações.</p> : null}</section> : null}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {matches.map(({ property, match }, index) => <article key={property.id} className="rounded-3xl border border-white/[.08] bg-white/[.035] p-5">
            <div className="flex items-start justify-between gap-3"><div><button type="button" disabled={match.recommendation === "não recomendar"} onClick={() => toggleProperty(property.id)} className={`mb-3 rounded-full border px-3 py-1 text-[10px] font-bold uppercase transition disabled:opacity-30 ${selectedProperties.includes(property.id) ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200" : "border-white/10 text-slate-400 hover:border-violet-400/40"}`}>{selectedProperties.includes(property.id) ? "✓ Selecionado" : "Selecionar"}</button><p className="text-xs font-bold text-violet-300">#{index + 1} · {match.recommendation.toUpperCase()}</p><h3 className="mt-2 text-lg font-semibold text-white">{property.title || "Imóvel sem título"}</h3><p className="mt-1 text-sm text-slate-400">{[property.city, property.state].filter(Boolean).join(" · ") || "Localização pendente"}</p></div><div className="text-right"><p className="text-3xl font-semibold text-white">{match.score}</p><p className="text-[10px] uppercase text-slate-500">aderência</p></div></div>
            <div className="mt-5"><AtlasProgress value={match.score} label={`Confiança ${match.confidence}`} /></div>
            <div className="mt-5 flex flex-wrap gap-2 text-xs text-slate-300"><span>{property.price ? money.format(property.price) : "Preço pendente"}</span><span>·</span><span>{property.bedrooms ?? "—"} dorm.</span><span>·</span><span>{property.area ?? "—"} m²</span></div>
            <div className="mt-5 space-y-2">{match.reasons.slice(0, 3).map((reason) => <p key={reason} className="text-xs text-emerald-300">✓ {reason}</p>)}{match.risks.slice(0, 2).map((risk) => <p key={risk} className="text-xs text-amber-300">! {risk}</p>)}</div>
            <button disabled={match.recommendation === "não recomendar"} className="atlas-button-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-40" onClick={() => window.location.href = `/leads/${payload.lead.id}`}>Apresentar pelo Lead 360</button>
          </article>)}
        </div>
        {!matches.length ? <AtlasEmpty title="Sem imóveis para comparar" description="Atualize o estoque para gerar recomendações." /> : null}
      </> : null}
    </div>
  );
}
