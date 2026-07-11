"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { matchLeadToProperty } from "@/lib/atlas/matching";
import { supabase } from "@/lib/supabase";
import type { AtlasLead, AtlasProperty } from "@/types/atlas";

type LeadRow = {
  id: string; name: string | null; email: string | null; phone: string | null;
  source: string | null; status: string | null; temperature: string | null;
  score: number | null; budget_min: number | null; budget_max: number | null;
  preferred_regions: string[] | null; bedrooms: number | null; purpose: string | null;
  notes: string | null; created_at: string | null;
};
type ActivityRow = { id: string; title: string; description: string | null; type: string; occurred_at: string };
type PropertyRow = { id: string; title: string | null; price: number | null; city: string | null; state: string | null; bedrooms: number | null; bathrooms: number | null; parking_spaces: number | null; area: number | null; status: string | null };

const inputClass = "w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition focus:border-blue-500";

export default function LeadDetailPage() {
  const { id: leadId } = useParams<{ id: string }>();
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activityTitle, setActivityTitle] = useState("");

  async function load() {
    setLoading(true);
    const [leadResult, activityResult, propertyResult] = await Promise.all([
      supabase.from("leads").select("*").eq("id", leadId).single(),
      supabase.from("activities").select("id,title,description,type,occurred_at").eq("lead_id", leadId).order("occurred_at", { ascending: false }),
      supabase.from("properties").select("id,title,price,city,state,bedrooms,bathrooms,parking_spaces,area,status").limit(100),
    ]);
    if (leadResult.error) setMessage(leadResult.error.message);
    setLead((leadResult.data as LeadRow | null) ?? null);
    setActivities((activityResult.data as ActivityRow[] | null) ?? []);
    setProperties((propertyResult.data as PropertyRow[] | null) ?? []);
    setLoading(false);
  }

  useEffect(() => { void load(); }, [leadId]);

  const matches = useMemo(() => {
    if (!lead) return [];
    const atlasLead: Partial<AtlasLead> = { id: lead.id, budgetMax: lead.budget_max, bedrooms: lead.bedrooms, preferredRegions: lead.preferred_regions ?? [] };
    return properties.map((property) => {
      const atlasProperty: AtlasProperty = { id: property.id, title: property.title, price: property.price, city: property.city, state: property.state, bedrooms: property.bedrooms, bathrooms: property.bathrooms, parkingSpaces: property.parking_spaces, area: property.area, status: property.status };
      return { property, match: matchLeadToProperty(atlasLead, atlasProperty) };
    }).filter((item) => item.match.score > 0).sort((a, b) => b.match.score - a.match.score).slice(0, 5);
  }, [lead, properties]);

  async function saveLead(event: FormEvent) {
    event.preventDefault();
    if (!lead) return;
    setSaving(true); setMessage(null);
    const { error } = await supabase.from("leads").update({
      name: lead.name, email: lead.email, phone: lead.phone, source: lead.source,
      status: lead.status, temperature: lead.temperature, score: lead.score,
      budget_min: lead.budget_min, budget_max: lead.budget_max, bedrooms: lead.bedrooms,
      purpose: lead.purpose, preferred_regions: lead.preferred_regions ?? [], notes: lead.notes,
    }).eq("id", lead.id);
    setMessage(error ? error.message : "Lead atualizado com sucesso."); setSaving(false);
  }

  async function addActivity(event: FormEvent) {
    event.preventDefault(); const title = activityTitle.trim(); if (!title) return;
    const { error } = await supabase.from("activities").insert({ lead_id: leadId, title, type: "note", occurred_at: new Date().toISOString() });
    if (error) setMessage(error.message); else { setActivityTitle(""); await load(); }
  }

  async function createOpportunity(propertyId?: string) {
    if (!lead) return;
    const selected = properties.find((item) => item.id === propertyId);
    const { error } = await supabase.from("opportunities").insert({ lead_id: lead.id, property_id: propertyId ?? null, stage: "qualificacao", probability: 25, value: selected?.price ?? lead.budget_max ?? null });
    setMessage(error ? error.message : "Oportunidade criada no funil de vendas.");
  }

  if (loading) return <p className="text-sm text-zinc-400">Carregando visão 360 do lead...</p>;
  if (!lead) return <p className="text-sm text-red-300">Lead não encontrado.</p>;

  return <div className="space-y-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div><Link href="/leads" className="text-sm font-semibold text-blue-400">← Voltar para leads</Link><h1 className="mt-3 text-3xl font-black">{lead.name || "Lead sem nome"}</h1><p className="mt-2 text-sm text-zinc-400">Customer Intelligence 360 · score, histórico, oportunidades e matching.</p></div>
      <button onClick={() => void createOpportunity()} className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-zinc-950">Criar oportunidade</button>
    </header>

    {message ? <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 text-sm text-blue-200">{message}</div> : null}

    <section className="grid gap-4 sm:grid-cols-3">
      {[['Score Atlas', lead.score ?? 0], ['Temperatura', lead.temperature || 'não classificado'], ['Etapa', lead.status || 'novo']].map(([label, value]) => <article key={String(label)} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5"><p className="text-sm text-zinc-400">{label}</p><p className="mt-2 text-2xl font-black capitalize">{value}</p></article>)}
    </section>

    <section className="grid gap-6 xl:grid-cols-[1.25fr_.75fr]">
      <form onSubmit={saveLead} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="text-xl font-black">Dados e qualificação</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <input className={inputClass} value={lead.name ?? ""} placeholder="Nome" onChange={(e) => setLead({ ...lead, name: e.target.value })} />
          <input className={inputClass} value={lead.phone ?? ""} placeholder="Telefone" onChange={(e) => setLead({ ...lead, phone: e.target.value })} />
          <input className={inputClass} value={lead.email ?? ""} placeholder="E-mail" onChange={(e) => setLead({ ...lead, email: e.target.value })} />
          <input className={inputClass} value={lead.source ?? ""} placeholder="Origem" onChange={(e) => setLead({ ...lead, source: e.target.value })} />
          <select className={inputClass} value={lead.status ?? "novo"} onChange={(e) => setLead({ ...lead, status: e.target.value })}>{['novo','contato','qualificacao','visita','proposta','contrato','ganho','perdido'].map((status) => <option key={status}>{status}</option>)}</select>
          <select className={inputClass} value={lead.temperature ?? "frio"} onChange={(e) => setLead({ ...lead, temperature: e.target.value })}><option>frio</option><option>morno</option><option>quente</option></select>
          <input className={inputClass} type="number" value={lead.budget_min ?? ""} placeholder="Orçamento mínimo" onChange={(e) => setLead({ ...lead, budget_min: e.target.value ? Number(e.target.value) : null })} />
          <input className={inputClass} type="number" value={lead.budget_max ?? ""} placeholder="Orçamento máximo" onChange={(e) => setLead({ ...lead, budget_max: e.target.value ? Number(e.target.value) : null })} />
          <input className={inputClass} type="number" value={lead.bedrooms ?? ""} placeholder="Dormitórios" onChange={(e) => setLead({ ...lead, bedrooms: e.target.value ? Number(e.target.value) : null })} />
          <input className={inputClass} value={(lead.preferred_regions ?? []).join(", ")} placeholder="Regiões preferidas" onChange={(e) => setLead({ ...lead, preferred_regions: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />
        </div>
        <textarea className={`${inputClass} mt-4 min-h-28`} value={lead.notes ?? ""} placeholder="Observações" onChange={(e) => setLead({ ...lead, notes: e.target.value })} />
        <button disabled={saving} className="mt-5 rounded-xl bg-blue-500 px-5 py-3 text-sm font-bold disabled:opacity-50">{saving ? "Salvando..." : "Salvar alterações"}</button>
      </form>

      <div className="space-y-6">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"><h2 className="text-xl font-black">Próxima ação</h2><p className="mt-3 text-sm text-zinc-400">Priorize contato, valide capacidade financeira e vincule o imóvel mais compatível.</p><form onSubmit={addActivity} className="mt-5 space-y-3"><input className={inputClass} value={activityTitle} onChange={(e) => setActivityTitle(e.target.value)} placeholder="Registrar ligação, mensagem ou visita" /><button className="w-full rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold">Adicionar ao histórico</button></form></article>
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6"><h2 className="text-xl font-black">Histórico</h2><div className="mt-4 space-y-3">{activities.length === 0 ? <p className="text-sm text-zinc-500">Nenhuma interação registrada.</p> : null}{activities.slice(0, 8).map((activity) => <div key={activity.id} className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3"><p className="font-semibold">{activity.title}</p><p className="mt-1 text-xs text-zinc-500">{new Date(activity.occurred_at).toLocaleString("pt-BR")}</p></div>)}</div></article>
      </div>
    </section>

    <section className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-blue-500/10 to-violet-500/10 p-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Matching Atlas</p><h2 className="mt-2 text-2xl font-black">Imóveis recomendados</h2>
      <div className="mt-6 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">{matches.length === 0 ? <p className="text-sm text-zinc-400">Nenhum imóvel compatível encontrado.</p> : null}{matches.map(({ property, match }) => <article key={property.id} className="rounded-2xl border border-zinc-700 bg-zinc-950/70 p-5"><div className="flex justify-between gap-3"><h3 className="font-black">{property.title || "Imóvel sem título"}</h3><span className="rounded-full bg-blue-500/15 px-3 py-1 text-xs font-bold text-blue-300">{match.score}%</span></div><p className="mt-2 text-sm text-zinc-400">{property.city || "Localização não informada"}</p><p className="mt-3 text-lg font-black">{property.price ? property.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "Preço sob consulta"}</p><ul className="mt-4 space-y-1 text-xs text-zinc-400">{match.reasons.map((reason) => <li key={reason}>• {reason}</li>)}</ul><button onClick={() => void createOpportunity(property.id)} className="mt-5 w-full rounded-xl border border-zinc-700 px-4 py-3 text-sm font-bold">Criar oportunidade com este imóvel</button></article>)}</div>
    </section>
  </div>;
}
