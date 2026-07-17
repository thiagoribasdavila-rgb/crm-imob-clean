"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { mapLegacyLead } from "@/lib/compat/legacy-v2";

type Lead = { id: string; name: string | null; score: number | null; temperature: string | null; budget_max: number | null };
type Property = { id: string; title: string | null; price: number | null; city: string | null; status: string | null };

export default function DigitalTwinPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  useEffect(() => { void (async () => {
    const [leadResult, propertyResult] = await Promise.all([supabase.from("leads").select("*").limit(12), supabase.from("properties").select("id,title,price,city,status").limit(12)]);
    setLeads(((leadResult.data ?? []) as Record<string, unknown>[]).map(mapLegacyLead) as Lead[]);
    setProperties((propertyResult.data ?? []) as Property[]);
  })(); }, []);
  return <div className="space-y-6"><header><p className="text-sm uppercase tracking-[.2em] text-violet-400">Digital Twin</p><h1 className="mt-2 text-3xl font-black">Gêmeos digitais do mercado</h1><p className="mt-2 text-zinc-400">Modelos vivos de compradores, imóveis e oportunidades para simulação de decisões.</p></header><div className="grid gap-6 xl:grid-cols-2"><section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><h2 className="font-bold">Compradores modelados</h2><div className="mt-4 space-y-3">{leads.map((lead) => <div key={lead.id} className="rounded-xl border border-zinc-800 p-4"><div className="flex justify-between"><p className="font-semibold">{lead.name || "Sem nome"}</p><span className="text-xs text-fuchsia-300">Score {lead.score ?? 0}</span></div><p className="mt-1 text-xs text-zinc-500">{lead.temperature || "sem temperatura"} · orçamento {lead.budget_max ? Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(lead.budget_max) : "não informado"}</p></div>)}</div></section><section className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><h2 className="font-bold">Ativos modelados</h2><div className="mt-4 space-y-3">{properties.map((property) => <div key={property.id} className="rounded-xl border border-zinc-800 p-4"><div className="flex justify-between"><p className="font-semibold">{property.title || "Imóvel"}</p><span className="text-xs text-emerald-300">{property.status}</span></div><p className="mt-1 text-xs text-zinc-500">{property.city || "Local não informado"} · {property.price ? Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(property.price) : "sem preço"}</p></div>)}</div></section></div></div>;
}
