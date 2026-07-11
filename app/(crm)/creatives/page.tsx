"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type Creative = { id: string; name: string; format: string; channel: string | null; status: string; performance_score: number | null; headline: string | null; created_at: string };

export default function CreativesPage() {
  const [items, setItems] = useState<Creative[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data } = await supabase.from("creative_assets").select("id,name,format,channel,status,performance_score,headline,created_at").order("created_at", { ascending: false });
      if (!active) return;
      setItems((data ?? []) as Creative[]);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  const metrics = useMemo(() => ({ approved: items.filter(i => i.status === "approved" || i.status === "published").length, review: items.filter(i => i.status === "review").length, avg: items.length ? items.reduce((sum, i) => sum + Number(i.performance_score || 0), 0) / items.length : 0 }), [items]);

  return <div className="space-y-8"><header><p className="atlas-eyebrow">Creative Intelligence</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em]">Biblioteca de criativos</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Peças, textos, formatos, aprovação e desempenho por campanha e canal.</p></header><section className="grid gap-4 sm:grid-cols-3">{[["Criativos",items.length],["Aprovados",metrics.approved],["Score médio",metrics.avg.toFixed(1)]].map(([l,v])=><article key={String(l)} className="atlas-panel p-5"><p className="text-xs uppercase tracking-[.14em] text-slate-500">{l}</p><p className="mt-3 text-2xl font-semibold text-white">{loading?"—":v}</p></article>)}</section><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{!loading&&items.length===0?<div className="atlas-panel col-span-full p-10 text-center text-sm text-slate-500">Nenhum criativo cadastrado.</div>:null}{items.map(item=><article key={item.id} className="atlas-panel p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-[.14em] text-sky-300">{item.format}</p><h2 className="mt-2 font-semibold text-white">{item.name}</h2></div><span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] uppercase text-slate-400">{item.status}</span></div><p className="mt-4 text-sm text-slate-400">{item.headline||"Sem headline definida"}</p><div className="mt-5 flex justify-between text-xs text-slate-500"><span>{item.channel||"Multicanal"}</span><span>Score {Number(item.performance_score||0).toFixed(1)}</span></div></article>)}</section></div>;
}
