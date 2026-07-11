"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { matchLeadToProperty } from "@/lib/atlas/matching";
import { supabase } from "@/lib/supabase";
import type { AtlasLead, AtlasProperty } from "@/types/atlas";
import { AtlasBadge, AtlasEmpty, AtlasProgress, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

type LeadRow = {
  id: string; name: string | null; email: string | null; phone: string | null;
  source: string | null; status: string | null; temperature: string | null;
  score: number | null; budget_min: number | null; budget_max: number | null;
  preferred_regions: string[] | null; bedrooms: number | null; purpose: string | null;
  notes: string | null; created_at: string | null;
};
type ActivityRow = { id: string; title: string; description: string | null; type: string; occurred_at: string };
type PropertyRow = { id: string; title: string | null; price: number | null; city: string | null; state: string | null; bedrooms: number | null; bathrooms: number | null; parking_spaces: number | null; area: number | null; status: string | null };
type OpportunityRow = { id: string; stage: string; value: number | null; probability: number; expected_close_at: string | null; property_id: string | null; created_at: string };

type Payload = { lead: LeadRow; activities: ActivityRow[]; properties: PropertyRow[]; opportunities: OpportunityRow[] };

const inputClass = "w-full rounded-xl border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/40 focus:bg-sky-400/[0.035]";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function temperatureTone(value?: string | null): "neutral" | "success" | "warning" | "danger" | "info" | "violet" {
  if (value === "quente") return "danger";
  if (value === "morno") return "warning";
  if (value === "frio") return "info";
  return "neutral";
}

export default function LeadDetailPage() {
  const { id: leadId } = useParams<{ id: string }>();
  const [lead, setLead] = useState<LeadRow | null>(null);
  const [activities, setActivities] = useState<ActivityRow[]>([]);
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [activityTitle, setActivityTitle] = useState("");
  const [activityType, setActivityType] = useState("note");

  async function api(path: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sessão expirada. Entre novamente.");
    const response = await fetch(path, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Falha na operação.");
    return body;
  }

  async function load() {
    setLoading(true);
    setMessage(null);
    try {
      const data = await api(`/api/v1/leads/${leadId}`) as Payload;
      setLead(data.lead);
      setActivities(data.activities);
      setProperties(data.properties);
      setOpportunities(data.opportunities);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao carregar o lead.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [leadId]);

  const matches = useMemo(() => {
    if (!lead) return [];
    const atlasLead: Partial<AtlasLead> = { id: lead.id, budgetMax: lead.budget_max, bedrooms: lead.bedrooms, preferredRegions: lead.preferred_regions ?? [] };
    return properties.map((property) => {
      const atlasProperty: AtlasProperty = { id: property.id, title: property.title, price: property.price, city: property.city, state: property.state, bedrooms: property.bedrooms, bathrooms: property.bathrooms, parkingSpaces: property.parking_spaces, area: property.area, status: property.status };
      return { property, match: matchLeadToProperty(atlasLead, atlasProperty) };
    }).filter((item) => item.match.score > 0).sort((a, b) => b.match.score - a.match.score).slice(0, 6);
  }, [lead, properties]);

  const intelligence = useMemo(() => {
    if (!lead) return { readiness: 0, nextAction: "Carregando contexto...", risk: "unknown", summary: "" };
    let readiness = 20;
    if (lead.phone || lead.email) readiness += 15;
    if (lead.budget_max) readiness += 20;
    if (lead.preferred_regions?.length) readiness += 15;
    if (lead.bedrooms !== null) readiness += 10;
    if (activities.length > 0) readiness += 10;
    if (opportunities.length > 0) readiness += 10;
    readiness = Math.min(100, readiness);
    const risk = activities.length === 0 ? "alto" : opportunities.length === 0 ? "médio" : "baixo";
    const nextAction = activities.length === 0
      ? "Realizar o primeiro contato e registrar a resposta."
      : opportunities.length === 0
        ? "Apresentar o imóvel com maior aderência e abrir oportunidade."
        : "Validar objeções e avançar a oportunidade para a próxima etapa.";
    const summary = `${lead.name || "Este lead"} entrou por ${lead.source || "origem não informada"}, possui score ${lead.score ?? 0} e está na etapa ${lead.status || "novo"}. ${matches.length ? `Há ${matches.length} imóveis com aderência comercial.` : "Ainda não há imóveis compatíveis suficientes."}`;
    return { readiness, nextAction, risk, summary };
  }, [activities.length, lead, matches.length, opportunities.length]);

  async function saveLead(event: FormEvent) {
    event.preventDefault();
    if (!lead) return;
    setSaving(true); setMessage(null);
    try {
      const data = await api(`/api/v1/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify(lead) });
      setLead(data.lead);
      setMessage("Lead atualizado e registrado na timeline.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function addActivity(event: FormEvent) {
    event.preventDefault();
    const title = activityTitle.trim();
    if (!title) return;
    try {
      await api(`/api/v1/leads/${leadId}`, { method: "POST", body: JSON.stringify({ action: "activity", title, type: activityType }) });
      setActivityTitle("");
      setMessage("Interação registrada no histórico.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao registrar interação.");
    }
  }

  async function createOpportunity(propertyId?: string) {
    try {
      await api(`/api/v1/leads/${leadId}`, { method: "POST", body: JSON.stringify({ action: "opportunity", propertyId }) });
      setMessage("Oportunidade criada no pipeline.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao criar oportunidade.");
    }
  }

  if (loading) return <div className="space-y-5"><AtlasSkeleton className="h-36 w-full" /><div className="grid gap-4 md:grid-cols-3"><AtlasSkeleton className="h-28 w-full" /><AtlasSkeleton className="h-28 w-full" /><AtlasSkeleton className="h-28 w-full" /></div><AtlasSkeleton className="h-96 w-full" /></div>;
  if (!lead) return <AtlasEmpty title="Lead não encontrado" description={message || "O registro pode ter sido removido ou você não possui acesso."} action={<Link href="/leads" className="atlas-button-secondary">Voltar para leads</Link>} />;

  return (
    <div className="space-y-6 pb-10">
      <section className="atlas-grid-glow overflow-hidden rounded-[28px] border border-sky-400/10 bg-gradient-to-br from-sky-500/[.12] via-blue-500/[.05] to-violet-500/[.1] p-6 sm:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <Link href="/leads" className="text-xs font-semibold text-sky-300">← Voltar para leads</Link>
            <div className="mt-4 flex flex-wrap items-center gap-2"><AtlasBadge tone="info">LEAD INTELLIGENCE 360</AtlasBadge><AtlasBadge tone={temperatureTone(lead.temperature)}>{lead.temperature || "não classificado"}</AtlasBadge><AtlasBadge tone="violet">{lead.status || "novo"}</AtlasBadge></div>
            <h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">{lead.name || "Lead sem nome"}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">{intelligence.summary}</p>
            <div className="mt-6 flex flex-wrap gap-3"><button onClick={() => void createOpportunity()} className="atlas-button-primary">Criar oportunidade</button><a href={lead.phone ? `https://wa.me/${lead.phone.replace(/\D/g, "")}` : "#"} className="atlas-button-secondary">Abrir WhatsApp</a><a href={lead.email ? `mailto:${lead.email}` : "#"} className="atlas-button-secondary">Enviar e-mail</a></div>
          </div>
          <div className="min-w-full rounded-3xl border border-white/[0.08] bg-[#070d1b]/75 p-5 backdrop-blur-xl xl:min-w-80">
            <div className="flex items-center justify-between"><div><p className="atlas-eyebrow">Readiness</p><p className="mt-2 text-xl font-semibold text-white">Prontidão comercial</p></div><span className="text-3xl font-semibold text-emerald-300">{intelligence.readiness}</span></div>
            <div className="mt-5"><AtlasProgress value={intelligence.readiness} label="Qualidade do perfil" /></div>
            <p className="mt-4 text-xs leading-5 text-slate-400">{intelligence.nextAction}</p>
          </div>
        </div>
      </section>

      {message ? <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-4 text-sm text-sky-100">{message}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <AtlasMetric label="Score Atlas" value={lead.score ?? 0} detail="Qualificação atual" trend="AI" tone="blue" />
        <AtlasMetric label="Oportunidades" value={opportunities.length} detail="Negócios vinculados" trend="PIPE" tone="violet" />
        <AtlasMetric label="Interações" value={activities.length} detail="Eventos registrados" trend="360" tone="green" />
        <AtlasMetric label="Matches" value={matches.length} detail="Imóveis recomendados" trend="MATCH" tone="amber" />
        <AtlasMetric label="Risco" value={intelligence.risk} detail="Risco de inércia" trend="SLA" tone={intelligence.risk === "alto" ? "rose" : "green"} />
      </section>

      <section className="grid gap-6 2xl:grid-cols-[1.15fr_.85fr]">
        <AtlasCard>
          <AtlasCardHeader eyebrow="Customer profile" title="Dados e qualificação" description="Perfil comercial, preferências e capacidade financeira do comprador." />
          <form onSubmit={saveLead} className="p-5 sm:p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <input className={inputClass} value={lead.name ?? ""} placeholder="Nome" onChange={(e) => setLead({ ...lead, name: e.target.value })} />
              <input className={inputClass} value={lead.phone ?? ""} placeholder="Telefone" onChange={(e) => setLead({ ...lead, phone: e.target.value })} />
              <input className={inputClass} value={lead.email ?? ""} placeholder="E-mail" onChange={(e) => setLead({ ...lead, email: e.target.value })} />
              <input className={inputClass} value={lead.source ?? ""} placeholder="Origem" onChange={(e) => setLead({ ...lead, source: e.target.value })} />
              <select className={inputClass} value={lead.status ?? "novo"} onChange={(e) => setLead({ ...lead, status: e.target.value })}>{["novo","contato","qualificacao","visita","proposta","contrato","ganho","perdido"].map((status) => <option key={status}>{status}</option>)}</select>
              <select className={inputClass} value={lead.temperature ?? "frio"} onChange={(e) => setLead({ ...lead, temperature: e.target.value })}><option>frio</option><option>morno</option><option>quente</option></select>
              <input className={inputClass} type="number" value={lead.budget_min ?? ""} placeholder="Orçamento mínimo" onChange={(e) => setLead({ ...lead, budget_min: e.target.value ? Number(e.target.value) : null })} />
              <input className={inputClass} type="number" value={lead.budget_max ?? ""} placeholder="Orçamento máximo" onChange={(e) => setLead({ ...lead, budget_max: e.target.value ? Number(e.target.value) : null })} />
              <input className={inputClass} type="number" value={lead.bedrooms ?? ""} placeholder="Dormitórios" onChange={(e) => setLead({ ...lead, bedrooms: e.target.value ? Number(e.target.value) : null })} />
              <input className={inputClass} value={(lead.preferred_regions ?? []).join(", ")} placeholder="Regiões preferidas" onChange={(e) => setLead({ ...lead, preferred_regions: e.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />
            </div>
            <textarea className={`${inputClass} mt-4 min-h-32`} value={lead.notes ?? ""} placeholder="Observações estratégicas" onChange={(e) => setLead({ ...lead, notes: e.target.value })} />
            <div className="mt-5 flex justify-end"><button disabled={saving} className="atlas-button-primary disabled:opacity-50">{saving ? "Salvando..." : "Salvar alterações"}</button></div>
          </form>
        </AtlasCard>

        <div className="space-y-6">
          <AtlasCard>
            <AtlasCardHeader eyebrow="Atlas AI" title="Próxima ação recomendada" description="Orientação calculada a partir do perfil, histórico e pipeline." />
            <div className="p-5 sm:p-6"><div className="rounded-2xl border border-violet-400/15 bg-violet-400/[0.06] p-5"><p className="text-sm font-medium text-violet-100">{intelligence.nextAction}</p><p className="mt-2 text-xs leading-5 text-slate-400">Risco atual: {intelligence.risk}. Atualize o histórico após cada contato para melhorar as recomendações.</p></div><form onSubmit={addActivity} className="mt-4 space-y-3"><div className="grid gap-3 sm:grid-cols-[1fr_150px]"><input className={inputClass} value={activityTitle} onChange={(e) => setActivityTitle(e.target.value)} placeholder="Registrar ligação, mensagem ou visita" /><select className={inputClass} value={activityType} onChange={(e) => setActivityType(e.target.value)}><option value="note">Nota</option><option value="call">Ligação</option><option value="whatsapp">WhatsApp</option><option value="visit">Visita</option><option value="email">E-mail</option></select></div><button className="atlas-button-secondary w-full">Adicionar à timeline</button></form></div>
          </AtlasCard>

          <AtlasCard>
            <AtlasCardHeader eyebrow="Timeline" title="Histórico do relacionamento" description="Interações, mudanças e eventos recentes." />
            <div className="max-h-[420px] overflow-y-auto px-5 pb-5 sm:px-6 sm:pb-6">{activities.length === 0 ? <AtlasEmpty title="Nenhuma interação" description="Registre o primeiro contato para iniciar a memória comercial." /> : <div className="space-y-3">{activities.map((activity) => <article key={activity.id} className="relative rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 pl-12"><span className="absolute left-4 top-4 grid h-7 w-7 place-items-center rounded-full border border-sky-400/20 bg-sky-400/10 text-xs text-sky-300">•</span><div className="flex items-start justify-between gap-3"><div><p className="font-medium text-white">{activity.title}</p>{activity.description ? <p className="mt-1 text-xs leading-5 text-slate-400">{activity.description}</p> : null}</div><AtlasBadge tone="info">{activity.type}</AtlasBadge></div><p className="mt-3 text-[10px] uppercase tracking-wider text-slate-600">{new Date(activity.occurred_at).toLocaleString("pt-BR")}</p></article>)}</div>}</div>
          </AtlasCard>
        </div>
      </section>

      <AtlasCard>
        <AtlasCardHeader eyebrow="Matching Atlas" title="Imóveis recomendados" description="Ranking de aderência entre perfil, orçamento, tipologia e localização." action={<Link href="/properties" className="text-xs font-semibold text-sky-300">Ver estoque →</Link>} />
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-3 sm:p-6">{matches.length === 0 ? <div className="md:col-span-2 xl:col-span-3"><AtlasEmpty title="Nenhum match encontrado" description="Complete orçamento, dormitórios e regiões para melhorar o matching." /></div> : matches.map(({ property, match }) => <article key={property.id} className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 transition hover:-translate-y-1 hover:border-sky-400/20"><div className="flex items-start justify-between gap-3"><div><p className="atlas-eyebrow">Aderência comercial</p><h3 className="mt-2 font-semibold text-white">{property.title || "Imóvel sem título"}</h3></div><AtlasBadge tone={match.score >= 75 ? "success" : match.score >= 50 ? "warning" : "info"}>{match.score}%</AtlasBadge></div><p className="mt-2 text-sm text-slate-400">{property.city || "Localização não informada"}{property.state ? ` · ${property.state}` : ""}</p><p className="mt-4 text-xl font-semibold text-white">{property.price ? brl.format(property.price) : "Preço sob consulta"}</p><ul className="mt-4 space-y-1.5 text-xs text-slate-400">{match.reasons.slice(0, 3).map((reason) => <li key={reason}>• {reason}</li>)}</ul><button onClick={() => void createOpportunity(property.id)} className="atlas-button-secondary mt-5 w-full">Criar oportunidade</button></article>)}</div>
      </AtlasCard>
    </div>
  );
}
