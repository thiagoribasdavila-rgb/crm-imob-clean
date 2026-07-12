"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { trackAtlasEvent } from "@/lib/analytics/events";

type LeadRecord = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  source?: string | null;
  score?: number | null;
  temperature?: string | null;
  created_at?: string | null;
};

type LeadsApiResponse = {
  ok?: boolean;
  data?: {
    items?: LeadRecord[];
    page?: { hasMore?: boolean; nextCursor?: string | null };
  };
  error?: { message?: string };
};

const statusTone: Record<string, string> = {
  novo: "border-sky-400/20 bg-sky-400/10 text-sky-200",
  contato: "border-blue-400/20 bg-blue-400/10 text-blue-200",
  qualificacao: "border-violet-400/20 bg-violet-400/10 text-violet-200",
  visita: "border-amber-400/20 bg-amber-400/10 text-amber-200",
  proposta: "border-orange-400/20 bg-orange-400/10 text-orange-200",
  contrato: "border-emerald-400/20 bg-emerald-400/10 text-emerald-200",
  ganho: "border-green-400/20 bg-green-400/10 text-green-200",
  perdido: "border-rose-400/20 bg-rose-400/10 text-rose-200",
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeQuery, setActiveQuery] = useState("");

  const loadLeads = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "initial") setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente.");

      const params = new URLSearchParams({ limit: "100" });
      const normalizedQuery = activeQuery.trim();
      if (normalizedQuery) params.set("q", normalizedQuery);

      const response = await fetch(`/api/v1/crm/leads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      const payload = (await response.json()) as LeadsApiResponse;

      if (!response.ok) throw new Error(payload.error?.message || "Não foi possível carregar os leads.");

      const items = payload.data?.items ?? [];
      setLeads(items);
      trackAtlasEvent("atlas_leads_loaded", { count: items.length, filtered: Boolean(normalizedQuery) });
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Falha ao carregar leads.";
      setError(message);
      setLeads([]);
      trackAtlasEvent("atlas_leads_load_failed", { reason: message.includes("Sessão") ? "session" : "api_error" });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeQuery]);

  useEffect(() => {
    void loadLeads();
  }, [loadLeads]);

  const metrics = useMemo(() => {
    const hot = leads.filter((lead) => lead.temperature === "quente" || Number(lead.score ?? 0) >= 70).length;
    const withoutContact = leads.filter((lead) => !lead.email && !lead.phone).length;
    const open = leads.filter((lead) => !["ganho", "perdido"].includes(lead.status ?? "novo")).length;
    return { total: leads.length, hot, withoutContact, open };
  }, [leads]);

  return (
    <div className="space-y-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-400">Operação comercial</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">Leads</h1>
          <p className="mt-2 text-sm text-zinc-400">Centralize, acompanhe e qualifique todos os contatos recebidos.</p>
        </div>
        <Link href="/leads/new" className="rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-zinc-950 hover:bg-zinc-200">
          + Novo lead
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total", metrics.total],
          ["Abertos", metrics.open],
          ["Quentes", metrics.hot],
          ["Sem contato", metrics.withoutContact],
        ].map(([label, value]) => (
          <article key={label} className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-white">{value}</p>
          </article>
        ))}
      </section>

      <section className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-bold">Base de leads</h2>
            <p className="mt-1 text-xs text-zinc-500">{loading ? "Carregando registros..." : `${leads.length} registro(s)`}</p>
          </div>
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              const normalized = query.trim();
              if (normalized === activeQuery) void loadLeads("refresh");
              else setActiveQuery(normalized);
            }}
          >
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar nome, e-mail ou telefone..."
              className="min-w-64 rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm text-white outline-none placeholder:text-zinc-600 focus:border-blue-400"
            />
            <button disabled={refreshing} className="rounded-xl border border-zinc-700 px-4 py-2 text-sm font-semibold text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
              {refreshing ? "Atualizando..." : "Buscar"}
            </button>
          </form>
        </div>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            Não foi possível carregar os leads: {error}
            <button type="button" onClick={() => void loadLeads("refresh")} className="ml-2 font-bold underline underline-offset-4">Tentar novamente</button>
          </div>
        ) : null}

        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-zinc-950/60 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Lead</th>
                <th className="px-5 py-3 font-semibold">Contato</th>
                <th className="px-5 py-3 font-semibold">Score</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Origem</th>
                <th className="px-5 py-3 font-semibold">Entrada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {!loading && leads.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-zinc-500">
                    Nenhum lead encontrado. Use “Novo lead” para iniciar a operação.
                  </td>
                </tr>
              ) : null}

              {loading ? (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-zinc-500">Carregando leads...</td></tr>
              ) : null}

              {!loading && leads.map((lead) => {
                const status = lead.status || "novo";
                return (
                  <tr key={lead.id} className="transition hover:bg-zinc-900">
                    <td className="px-5 py-4">
                      <Link href={`/leads/${lead.id}`} className="font-semibold text-white hover:text-blue-300">
                        {lead.name || "Lead sem nome"}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-zinc-400">
                      <div>{lead.email || "E-mail não informado"}</div>
                      <div className="mt-1 text-xs text-zinc-500">{lead.phone || "Telefone não informado"}</div>
                    </td>
                    <td className="px-5 py-4 text-zinc-300">
                      <div className="font-bold">{lead.score ?? "—"}</div>
                      <div className="mt-1 text-xs capitalize text-zinc-500">{lead.temperature || "sem temperatura"}</div>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full border px-3 py-1 text-xs capitalize ${statusTone[status] ?? "border-zinc-700 bg-zinc-800 text-zinc-300"}`}>
                        {status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-zinc-400">{lead.source || "—"}</td>
                    <td className="px-5 py-4 text-zinc-400">
                      {lead.created_at ? new Date(lead.created_at).toLocaleDateString("pt-BR") : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
