"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { LoadingState } from "@/components/atlas/loading-state";
import { ErrorState } from "@/components/atlas/error-state";
import { EmptyState } from "@/components/atlas/empty-state";
import { StatusBadge } from "@/components/atlas/status-badge";

type Category = "all" | "change" | "contact" | "transfer" | "ai" | "proposal" | "external";
type Event = { id: string; category: Exclude<Category, "all">; title: string; description: string | null; occurredAt: string; actorName: string; source: string; status?: string | null };
type Payload = { lead: { id: string; name: string | null }; events: Event[]; counts: Record<Exclude<Category, "all">, number> };
const filters: Array<{ value: Category; label: string }> = [{ value: "all", label: "Tudo" }, { value: "contact", label: "Contatos" }, { value: "change", label: "Mudanças" }, { value: "transfer", label: "Transferências" }, { value: "ai", label: "IA" }, { value: "proposal", label: "Propostas" }, { value: "external", label: "Externos" }];
const categoryLabel: Record<Event["category"], string> = { change: "CRM", contact: "Contato", transfer: "Transferência", ai: "IA", proposal: "Proposta", external: "Integração" };
const categoryTone: Record<Event["category"], "info" | "success" | "warning" | "violet"> = { change: "info", contact: "success", transfer: "warning", ai: "violet", proposal: "violet", external: "info" };

export default function LeadTimeline({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [data, setData] = useState<Payload | null>(null);
  const [category, setCategory] = useState<Category>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session.session?.access_token) throw new Error("Sessão expirada. Entre novamente.");
        const response = await fetch(`/api/v1/leads/${id}/timeline`, { headers: { Authorization: `Bearer ${session.session.access_token}` }, signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Não foi possível carregar a timeline.");
        setData(payload);
      } catch (loadError) { if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "Falha ao carregar histórico."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [id]);

  const events = useMemo(() => data?.events.filter((event) => category === "all" || event.category === category) ?? [], [category, data]);
  if (loading) return <LoadingState rows={6} />;
  if (error) return <ErrorState title="Timeline indisponível" description={error} action={<Link className="atlas-button-secondary" href={`/leads/${id}`}>Voltar à lead</Link>} />;

  return <div className="mx-auto max-w-6xl space-y-6 pb-12" data-phase="29-unified-timeline">
    <section className="rounded-[28px] border border-white/[.07] bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,.12),transparent_32%),rgba(7,13,25,.94)] p-6 sm:p-8">
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><div><div className="flex gap-2"><StatusBadge tone="info">LEAD 360</StatusBadge><StatusBadge tone="success">HISTÓRICO ÚNICO</StatusBadge></div><h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white">Timeline de {data?.lead.name || "cliente"}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Entenda o que aconteceu, quem agiu e de onde veio cada sinal — sem procurar em várias telas.</p></div><Link href={`/leads/${id}`} className="atlas-button-secondary">← Voltar ao Lead 360</Link></div>
    </section>
    <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar eventos da timeline">{filters.map((filter) => <button key={filter.value} type="button" onClick={() => setCategory(filter.value)} aria-pressed={category === filter.value} className={`shrink-0 rounded-xl border px-3 py-2 text-xs transition ${category === filter.value ? "border-sky-400/30 bg-sky-400/10 text-sky-100" : "border-white/[.07] bg-white/[.025] text-slate-400 hover:text-white"}`}>{filter.label}{filter.value !== "all" ? ` · ${data?.counts[filter.value] || 0}` : ` · ${data?.events.length || 0}`}</button>)}</nav>
    {!events.length ? <EmptyState title="Nenhum evento nesta categoria" description="Quando a equipe ou as integrações registrarem uma ação, ela aparecerá aqui automaticamente." /> : <section className="relative space-y-3 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-px before:bg-white/[.08]">{events.map((event) => <article key={event.id} className="relative ml-10 rounded-2xl border border-white/[.07] bg-white/[.025] p-4 sm:p-5"><span className="absolute -left-[30px] top-5 h-[11px] w-[11px] rounded-full border-2 border-slate-950 bg-sky-300 shadow-[0_0_0_4px_rgba(56,189,248,.1)]" aria-hidden="true"/><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={categoryTone[event.category]}>{categoryLabel[event.category]}</StatusBadge>{event.status ? <span className="text-[10px] uppercase tracking-wider text-slate-500">{event.status}</span> : null}</div><h2 className="mt-3 text-sm font-semibold text-white">{event.title}</h2>{event.description ? <p className="mt-1 text-xs leading-5 text-slate-400">{event.description}</p> : null}<p className="mt-3 text-[10px] text-slate-600">{event.actorName} · {event.source.replaceAll("_", " ")}</p></div><time className="shrink-0 text-[11px] text-slate-500" dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</time></div></article>)}</section>}
  </div>;
}
