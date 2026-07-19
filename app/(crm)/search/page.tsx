"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";
import { supabase } from "@/lib/supabase";

type Result = { id: string; title: string; subtitle: string; status: string; score: number; temperature: string | null; matchedBy: string[]; reason: string; nextAction: string; href: string };

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const value = query.trim();
    if (value.length < 2) { setResults([]); setLoading(false); setError(""); return; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true); setError("");
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`/api/v1/search?q=${encodeURIComponent(value)}`, { headers: { Authorization: `Bearer ${data.session?.access_token || ""}` }, signal: controller.signal, cache: "no-store" }).catch(() => null);
      if (!response) return;
      const body = await response.json();
      if (response.ok) setResults(body.data.results); else setError(body.error?.message || "Não foi possível buscar agora.");
      setLoading(false);
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);
  return <div className="space-y-6 pb-10" data-phase="27-smart-search"><section className="atlas-grid-glow rounded-[30px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.12] via-blue-500/[.06] to-violet-500/[.1] p-6 sm:p-8"><AtlasBadge tone="violet">FASE 27 · BUSCA INTELIGENTE</AtlasBadge><h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Encontre a lead pelo que você lembra.</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-400">Nome, telefone, e-mail, projeto, incorporadora, corretor, origem ou intenção. O Atlas mostra por que encontrou e respeita integralmente sua carteira e hierarquia.</p><div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3"><span className="text-cyan-300">⌕</span><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: Perdizes, investimento, Meta Ads, Maria ou 9999" className="min-w-0 flex-1 bg-transparent text-base text-white outline-none placeholder:text-slate-600" /></div><div className="mt-3 flex flex-wrap gap-2">{["Perdizes", "investimento", "Meta Ads", "WhatsApp"].map((term) => <button type="button" key={term} onClick={() => setQuery(term)} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-slate-400 hover:border-cyan-400/30 hover:text-white">{term}</button>)}</div></section>{error ? <div role="alert" className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}<AtlasCard><AtlasCardHeader eyebrow="Resultados sob seu escopo" title={query.trim().length < 2 ? "Digite para começar" : loading ? "Buscando na sua carteira" : `${results.length} resultado(s) encontrado(s)`} description="Resultados de estruturas fora do seu acesso não aparecem e não são contabilizados." />{loading ? <div className="space-y-3 p-5 sm:p-6">{[1,2,3].map((item) => <AtlasSkeleton key={item} className="h-24 w-full" />)}</div> : results.length ? <div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-2">{results.map((result) => <Link href={result.href} key={result.id} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 transition hover:border-cyan-400/25 hover:bg-cyan-400/[.035]"><div className="flex items-start justify-between gap-3"><div><strong className="text-white">{result.title}</strong><p className="mt-1 text-xs text-slate-500">{result.subtitle}</p></div><AtlasBadge tone={result.score >= 70 ? "danger" : result.score >= 45 ? "warning" : "info"}>{result.score} PTS</AtlasBadge></div><div className="mt-3 flex flex-wrap gap-2">{result.matchedBy.map((reason) => <AtlasBadge key={reason} tone="neutral">{reason.toUpperCase()}</AtlasBadge>)}<AtlasBadge tone="violet">{result.status.toUpperCase()}</AtlasBadge></div><p className="mt-3 text-xs text-slate-500">{result.reason}</p><p className="mt-2 text-xs font-semibold text-cyan-200">{result.nextAction} →</p></Link>)}</div> : query.trim().length >= 2 ? <AtlasEmpty title="Nenhuma lead encontrada" description="Tente parte do telefone, outro projeto, a origem ou a intenção registrada. Resultados fora do seu escopo permanecem ocultos." /> : <AtlasEmpty title="Busca pronta" description="Digite pelo menos dois caracteres para pesquisar sua carteira." />}</AtlasCard></div>;
}
