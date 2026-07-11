"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

type LeadRecord = {
  id: string;
  name?: string | null;
  status?: string | null;
  created_at?: string | null;
};

const statusGroups = {
  novos: ["novo", "new"],
  contato: ["contato", "contacted"],
  proposta: ["proposta", "proposal"],
  ganhos: ["ganho", "fechado", "won", "closed"],
};

export default function DashboardPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadDashboard() {
      setLoading(true);
      const { data, error: queryError } = await supabase
        .from("leads")
        .select("id,name,status,created_at")
        .order("created_at", { ascending: false });

      if (!mounted) return;

      if (queryError) {
        setError(queryError.message);
        setLeads([]);
      } else {
        setError(null);
        setLeads((data ?? []) as LeadRecord[]);
      }
      setLoading(false);
    }

    loadDashboard();
    return () => {
      mounted = false;
    };
  }, []);

  const metrics = useMemo(() => {
    const count = (statuses: string[]) =>
      leads.filter((lead) => statuses.includes((lead.status ?? "").toLowerCase())).length;

    return {
      total: leads.length,
      novos: count(statusGroups.novos),
      contato: count(statusGroups.contato),
      proposta: count(statusGroups.proposta),
      ganhos: count(statusGroups.ganhos),
    };
  }, [leads]);

  const cards = [
    { label: "Leads totais", value: metrics.total, detail: "Base comercial ativa" },
    { label: "Novos", value: metrics.novos, detail: "Aguardando primeiro contato" },
    { label: "Em contato", value: metrics.contato, detail: "Atendimento em andamento" },
    { label: "Propostas", value: metrics.proposta, detail: "Oportunidades avançadas" },
    { label: "Ganhos", value: metrics.ganhos, detail: "Negócios concluídos" },
  ];

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">Atlas AI CRM</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Visão executiva</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
            Acompanhe a operação comercial, identifique gargalos e priorize os próximos atendimentos.
          </p>
        </div>
        <div className="flex gap-3">
          <Link href="/leads" className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-semibold hover:bg-zinc-900">
            Ver leads
          </Link>
          <Link href="/leads/new" className="rounded-xl bg-white px-4 py-3 text-sm font-bold text-zinc-950 hover:bg-zinc-200">
            Novo lead
          </Link>
        </div>
      </header>

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          Não foi possível carregar o dashboard: {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <article key={card.label} className="rounded-2xl border border-zinc-800 bg-zinc-900/70 p-5 shadow-sm">
            <p className="text-sm text-zinc-400">{card.label}</p>
            <p className="mt-3 text-3xl font-black">{loading ? "—" : card.value}</p>
            <p className="mt-2 text-xs text-zinc-500">{card.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-bold">Leads recentes</h2>
              <p className="mt-1 text-sm text-zinc-500">Últimos registros recebidos pela operação.</p>
            </div>
            <Link href="/leads" className="text-sm font-semibold text-blue-400 hover:text-blue-300">
              Abrir lista
            </Link>
          </div>

          <div className="mt-6 divide-y divide-zinc-800">
            {!loading && leads.length === 0 ? (
              <p className="py-8 text-center text-sm text-zinc-500">Nenhum lead cadastrado ainda.</p>
            ) : null}
            {leads.slice(0, 6).map((lead) => (
              <div key={lead.id} className="flex items-center justify-between gap-4 py-4">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-zinc-100">{lead.name || "Lead sem nome"}</p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {lead.created_at ? new Date(lead.created_at).toLocaleDateString("pt-BR") : "Data não informada"}
                  </p>
                </div>
                <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs capitalize text-zinc-300">
                  {lead.status || "sem status"}
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-blue-500/15 to-violet-500/10 p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-300">Próxima evolução</p>
          <h2 className="mt-3 text-xl font-black">Centro de decisão Atlas</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-300">
            Esta base já está preparada para receber score de leads, previsão de conversão, alertas e recomendações automáticas nas próximas fases.
          </p>
          <div className="mt-6 space-y-3 text-sm text-zinc-300">
            <p>• Funil comercial conectado ao Supabase</p>
            <p>• Métricas operacionais centralizadas</p>
            <p>• Estrutura pronta para automações e IA</p>
          </div>
        </article>
      </section>
    </div>
  );
}
