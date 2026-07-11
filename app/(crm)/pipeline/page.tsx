"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const stages = [
  ["novo", "Novos"],
  ["contato", "Contato"],
  ["qualificado", "Qualificados"],
  ["visita", "Visita"],
  ["proposta", "Proposta"],
  ["ganho", "Ganhos"],
] as const;

type Lead = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  status: string | null;
  score: number | null;
  temperature: string | null;
  budget_max: number | null;
};

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("leads")
      .select("id,name,phone,email,status,score,temperature,budget_max")
      .order("score", { ascending: false });
    if (error) setError(error.message);
    setLeads((data ?? []) as Lead[]);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function moveLead(id: string, status: string) {
    const previous = leads;
    setLeads((current) => current.map((lead) => (lead.id === id ? { ...lead, status } : lead)));
    const { error } = await supabase.from("leads").update({ status }).eq("id", id);
    if (error) {
      setLeads(previous);
      setError(error.message);
    }
  }

  const totals = useMemo(
    () => Object.fromEntries(stages.map(([key]) => [key, leads.filter((lead) => (lead.status ?? "novo") === key).length])),
    [leads]
  );

  if (loading) return <p className="text-zinc-400">Carregando pipeline...</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">Motor comercial</p>
          <h1 className="mt-2 text-3xl font-black">Pipeline inteligente</h1>
          <p className="mt-2 text-zinc-400">Atualize a etapa de cada lead e acompanhe o fluxo comercial em tempo real.</p>
        </div>
        <Link href="/leads/new" className="rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-zinc-950">Novo lead</Link>
      </div>

      {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-200">{error}</div>}

      <div className="grid gap-4 xl:grid-cols-3 2xl:grid-cols-6">
        {stages.map(([key, label]) => (
          <section key={key} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold">{label}</h2>
              <span className="rounded-full bg-zinc-800 px-2 py-1 text-xs text-zinc-300">{totals[key] ?? 0}</span>
            </div>
            <div className="space-y-3">
              {leads.filter((lead) => (lead.status ?? "novo") === key).map((lead) => (
                <article key={lead.id} className="rounded-xl border border-zinc-800 bg-zinc-950 p-3">
                  <Link href={`/leads/${lead.id}`} className="font-semibold hover:text-blue-300">{lead.name || "Lead sem nome"}</Link>
                  <p className="mt-1 text-xs text-zinc-500">Score {lead.score ?? 0} · {lead.temperature ?? "frio"}</p>
                  {lead.budget_max && <p className="mt-2 text-sm text-zinc-300">Até {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(lead.budget_max)}</p>}
                  <select
                    value={lead.status ?? "novo"}
                    onChange={(event) => void moveLead(lead.id, event.target.value)}
                    className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-xs"
                  >
                    {stages.map(([stage, stageLabel]) => <option key={stage} value={stage}>{stageLabel}</option>)}
                  </select>
                </article>
              ))}
              {!leads.some((lead) => (lead.status ?? "novo") === key) && <p className="rounded-xl border border-dashed border-zinc-800 p-4 text-center text-xs text-zinc-600">Sem leads</p>}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
