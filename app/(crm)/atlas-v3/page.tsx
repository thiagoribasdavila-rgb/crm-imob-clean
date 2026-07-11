"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AtlasV3Page(){
 const [metrics,setMetrics]=useState({leads:0,properties:0,opportunities:0,insights:0});
 useEffect(()=>{void(async()=>{const [a,b,c,d]=await Promise.all([supabase.from("leads").select("id",{count:"exact",head:true}),supabase.from("properties").select("id",{count:"exact",head:true}),supabase.from("opportunities").select("id",{count:"exact",head:true}),supabase.from("ai_insights").select("id",{count:"exact",head:true})]);setMetrics({leads:a.count??0,properties:b.count??0,opportunities:c.count??0,insights:d.count??0});})();},[]);
 const modules=[['Digital Twin','/atlas-v3/digital-twin'],['Agentes','/atlas-v3/agents'],['Market Intelligence','/atlas-v3/market'],['Marketplace','/atlas-v3/marketplace'],['Governança','/atlas-v3/governance'],['Previsões','/atlas-v3/forecast']];
 return <div className="space-y-8"><header><p className="text-sm uppercase tracking-[.2em] text-fuchsia-400">Atlas Operating System</p><h1 className="mt-2 text-4xl font-black">Command Center V3</h1><p className="mt-2 text-zinc-400">Camada de decisão, simulação e automação do ecossistema imobiliário.</p></header><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Object.entries(metrics).map(([k,v])=><article key={k} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><p className="text-sm capitalize text-zinc-500">{k}</p><p className="mt-2 text-3xl font-black">{v}</p></article>)}</section><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{modules.map(([name,href])=><Link key={href} href={href} className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-zinc-950 p-6 hover:border-fuchsia-500/40"><p className="font-bold">{name}</p><p className="mt-2 text-sm text-zinc-500">Abrir módulo estratégico</p></Link>)}</section></div>;
}