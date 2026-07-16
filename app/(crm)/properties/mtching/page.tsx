"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AtlasBadge, AtlasEmpty, AtlasProgress, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { matchLeadToProperty } from "@/lib/atlas/matching";
import { supabase } from "@/lib/supabase";
import type { AtlasLead, AtlasProperty } from "@/types/atlas";

type LeadRow = { id: string; name: string | null; budget_min: number | null; budget_max: number | null; preferred_regions: string[] | null; bedrooms: number | null; score: number | null };
type PropertyRow = { id: string; title: string | null; price: number | null; city: string | null; state: string | null; bedrooms: number | null; bathrooms: number | null; parking_spaces: number | null; area: number | null; status: string | null };
type LeadPayload = { lead: LeadRow; properties: PropertyRow[] };

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function PropertyMatching() {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [payload, setPayload] = useState<LeadPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    setLoading(true); setError(null);
    void api(`/api/v1/leads/${selectedId}`).then((data) => setPayload(data)).catch((cause) => setError(cause instanceof Error ? cause.message : "Falha no matching.")).finally(() => setLoading(false));
  }, [selectedId]);

  const matches = useMemo(() => {
    if (!payload) return [];
    const lead: Partial<AtlasLead> = { budgetMin: payload.lead.budget_min, budgetMax: payload.lead.budget_max, bedrooms: payload.lead.bedrooms, preferredRegions: payload.lead.preferred_regions ?? [] };
    return payload.properties.map((property) => {
      const model: AtlasProperty = { id: property.id, title: property.title, price: property.price, city: property.city, state: property.state, bedrooms: property.bedrooms, bathrooms: property.bathrooms, parkingSpaces: property.parking_spaces, area: property.area, status: property.status };
      return { property, match: matchLeadToProperty(lead, model) };
    }).sort((a, b) => b.match.score - a.match.score).slice(0, 12);
  }, [payload]);

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
        <div className="flex items-center justify-between"><div><p className="atlas-eyebrow">Ranking explicável</p><h2 className="mt-1 text-2xl font-semibold text-white">Melhores opções para {payload.lead.name || "este lead"}</h2></div><Link href={`/leads/${payload.lead.id}`} className="atlas-button-secondary">Abrir Lead 360</Link></div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {matches.map(({ property, match }, index) => <article key={property.id} className="rounded-3xl border border-white/[.08] bg-white/[.035] p-5">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-violet-300">#{index + 1} · {match.recommendation.toUpperCase()}</p><h3 className="mt-2 text-lg font-semibold text-white">{property.title || "Imóvel sem título"}</h3><p className="mt-1 text-sm text-slate-400">{[property.city, property.state].filter(Boolean).join(" · ") || "Localização pendente"}</p></div><div className="text-right"><p className="text-3xl font-semibold text-white">{match.score}</p><p className="text-[10px] uppercase text-slate-500">aderência</p></div></div>
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
