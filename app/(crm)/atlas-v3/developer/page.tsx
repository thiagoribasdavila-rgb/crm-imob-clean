"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { mapLegacyProject } from "@/lib/compat/legacy-v2";

type Development = { id: string; name: string; developer_name: string | null; status: string; city: string | null; delivery_date: string | null };

export default function DeveloperPage() {
  const [data, setData] = useState<Development[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => { void (async () => {
    const result = await supabase
      .from("developments")
      .select("id,name,developer_name,status,city,delivery_date,created_at")
      .order("created_at", { ascending: false });
    setError(Boolean(result.error));
    setData(((result.data ?? []) as Record<string, unknown>[]).map(mapLegacyProject) as Development[]);
    setLoading(false);
  })(); }, []);

  return <div className="space-y-6"><header><p className="text-sm uppercase tracking-[.2em] text-orange-400">Developer Intelligence</p><h1 className="mt-2 text-3xl font-black">Portal incorporadora</h1><p className="mt-2 text-zinc-400">Produtos, estoque, campanhas e performance em uma visão única.</p></header>{error && <section className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5" role="status"><h2 className="font-semibold text-amber-100">Portfólio temporariamente indisponível</h2><p className="mt-1 text-sm text-zinc-400">O Atlas preservou seus dados. Atualize a página para tentar novamente.</p></section>}<section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{loading && <p className="text-zinc-500">Carregando empreendimentos...</p>}{!loading && !error && data.map((development) => <article key={development.id} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5"><div className="flex justify-between gap-3"><h2 className="font-bold">{development.name}</h2><span className="text-xs text-orange-300">{development.status}</span></div><p className="mt-2 text-sm text-zinc-500">{development.developer_name || "Incorporadora não informada"}</p><p className="mt-4 text-sm">{development.city || "Cidade não informada"}</p><p className="mt-1 text-xs text-zinc-500">Entrega: {development.delivery_date ? new Date(development.delivery_date).toLocaleDateString("pt-BR") : "não informada"}</p></article>)}{!loading && !error && data.length === 0 && <p className="text-zinc-500">Nenhum empreendimento cadastrado.</p>}</section></div>;
}
