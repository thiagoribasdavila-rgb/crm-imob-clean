"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { isMissingRelation, mapLegacyProject } from "@/lib/compat/legacy-v2";

type Development = { id: string; name: string; developer_name: string | null; status: string; city: string | null; delivery_date: string | null };

export default function DeveloperPage() {
  const [data, setData] = useState<Development[]>([]);
  useEffect(() => { void (async () => {
    const canonical = await supabase.from("developments").select("*").order("created_at", { ascending: false });
    const result = canonical.error && isMissingRelation(canonical.error)
      ? await supabase.from("projects").select("*").order("created_at", { ascending: false })
      : canonical;
    setData(((result.data ?? []) as Record<string, unknown>[]).map(mapLegacyProject) as Development[]);
  })(); }, []);
  return <div className="space-y-6"><header><p className="text-sm uppercase tracking-[.2em] text-orange-400">Developer Intelligence</p><h1 className="mt-2 text-3xl font-black">Portal incorporadora</h1><p className="mt-2 text-zinc-400">Produtos, estoque, campanhas e performance em uma visão única.</p></header><section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{data.map((development) => <article key={development.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><div className="flex justify-between gap-3"><h2 className="font-bold">{development.name}</h2><span className="text-xs text-orange-300">{development.status}</span></div><p className="mt-2 text-sm text-zinc-500">{development.developer_name || "Incorporadora não informada"}</p><p className="mt-4 text-sm">{development.city || "Cidade não informada"}</p><p className="mt-1 text-xs text-zinc-500">Entrega: {development.delivery_date ? new Date(development.delivery_date).toLocaleDateString("pt-BR") : "não informada"}</p></article>)}{data.length === 0 && <p className="text-zinc-500">Nenhum empreendimento cadastrado.</p>}</section></div>;
}
