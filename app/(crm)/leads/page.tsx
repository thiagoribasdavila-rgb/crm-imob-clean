"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type LeadRecord = {
  id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  created_at?: string | null;
};

export default function LeadsPage() {
  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadLeads() {
      const { data, error: queryError } = await supabase
        .from("leads")
        .select("*")
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

    loadLeads();
    return () => {
      mounted = false;
    };
  }, []);

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

      {error ? (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          Não foi possível carregar os leads: {error}
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/50">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 className="font-bold">Base de leads</h2>
            <p className="mt-1 text-xs text-zinc-500">{loading ? "Carregando registros..." : `${leads.length} registro(s)`}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-zinc-950/60 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Lead</th>
                <th className="px-5 py-3 font-semibold">Contato</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Entrada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {!loading && leads.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-zinc-500">
                    Nenhum lead cadastrado. Use “Novo lead” para iniciar a operação.
                  </td>
                </tr>
              ) : null}

              {leads.map((lead) => (
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
                  <td className="px-5 py-4">
                    <span className="rounded-full border border-zinc-700 bg-zinc-800 px-3 py-1 text-xs capitalize text-zinc-300">
                      {lead.status || "sem status"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-zinc-400">
                    {lead.created_at ? new Date(lead.created_at).toLocaleDateString("pt-BR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
