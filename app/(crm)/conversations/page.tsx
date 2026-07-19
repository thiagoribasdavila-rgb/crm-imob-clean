"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { AtlasBadge } from "@/components/ui/AtlasUI";

type Conversation = {
  id: string;
  channel: string;
  status: string;
  unread_count: number;
  last_message_at: string | null;
  lead_id: string | null;
  customer_id: string | null;
  assigned_to: string | null;
  leadName?: string;
  brokerName?: string;
  journey?: { stage: string; status: string; updated_at: string };
};

export default function ConversationsPage() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const { data, error: queryError } = await supabase
        .from("lead_events")
        .select("id,lead_id,event_type,type,created_at,created_by")
        .order("created_at", { ascending: false, nullsFirst: false })
        .limit(200);
      if (!active) return;
      if (queryError) setError("O histórico de conversas está temporariamente indisponível.");
      else {
        const rows = (data ?? []) as Array<{ id: string; lead_id: string | null; event_type: string | null; type: string | null; created_at: string | null; created_by: string | null }>;
        const leadIds = [...new Set(rows.map((item) => item.lead_id).filter(Boolean))] as string[];
        const [{ data: leads }, { data: brokers }] = await Promise.all([
          leadIds.length ? supabase.from("leads").select("id,name,assigned_user_id").in("id", leadIds) : Promise.resolve({ data: [] }),
          supabase.from("profiles").select("id,name").eq("active", true),
        ]);
        const leadMap = new Map((leads ?? []).map((lead) => [lead.id, lead]));
        const brokerMap = new Map((brokers ?? []).map((broker) => [broker.id, broker.name]));
        setItems(rows.map((row) => {
          const lead = row.lead_id ? leadMap.get(row.lead_id) : null;
          const eventType = String(row.event_type || row.type || "crm").toLowerCase();
          const channel = eventType.includes("whatsapp") ? "whatsapp" : eventType.includes("email") ? "email" : eventType.includes("call") || eventType.includes("ligacao") ? "telefone" : "crm";
          const assignedTo = lead?.assigned_user_id || row.created_by;
          return {
            id: row.id,
            channel,
            status: "registrada",
            unread_count: 0,
            last_message_at: row.created_at,
            lead_id: row.lead_id,
            customer_id: null,
            assigned_to: assignedTo || null,
            leadName: lead?.name || undefined,
            brokerName: assignedTo ? brokerMap.get(assignedTo) || undefined : undefined,
          } satisfies Conversation;
        }));
      }
      setLoading(false);
    }
    void load();
    const channel = supabase.channel("atlas-conversations-live").on("postgres_changes", { event: "INSERT", schema: "public", table: "lead_events" }, () => { void load(); }).subscribe();
    const refreshVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { active = false; document.removeEventListener("visibilitychange", refreshVisible); void supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="space-y-8">
      <header><p className="atlas-eyebrow">Histórico comercial conectado</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em]">Conversas do meu escopo</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Interações registradas no CRM por lead, canal e responsável. Mensageria em tempo real será habilitada somente após validar a API oficial.</p></header>
      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}
      <section className="atlas-panel overflow-hidden">
        <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4 text-sm text-slate-400"><span>{loading ? "Carregando conversas..." : `${items.length} conversa(s)`}</span><span className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-emerald-300"><i className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />Atualização ao vivo</span></div>
        <div className="divide-y divide-white/[0.06]">
          {!loading && items.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">Nenhuma conversa sincronizada.</div> : null}
          {items.map((item) => <article key={item.id} className="flex items-center gap-4 p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-400/10 text-xs font-bold uppercase text-sky-300">{item.channel.slice(0, 2)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-white">{item.leadName || item.channel}</p>{item.journey?.status === "waiting_broker" ? <AtlasBadge tone="warning">RESPONDER AGORA</AtlasBadge> : null}</div><p className="mt-1 text-xs text-slate-500">{item.brokerName ? `Corretor: ${item.brokerName}` : item.customer_id ? `Cliente ${item.customer_id.slice(0, 8)}` : "Contato externo"}{item.journey ? ` · Jornada ${item.journey.stage.replaceAll("_", " ")}` : ""}</p>{item.journey?.status === "waiting_broker" ? <p className="mt-2 text-xs text-amber-200">Próxima ação: abrir a lead e continuar a descoberta.</p> : null}</div><div className="text-right"><span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] uppercase text-slate-400">{item.status}</span><p className="mt-2 text-xs text-slate-500">{item.unread_count} não lida(s)</p>{item.lead_id ? <Link href={`/leads/${item.lead_id}`} className="mt-2 inline-block text-xs font-semibold text-sky-300">Abrir lead →</Link> : null}</div></article>)}
        </div>
      </section>
    </div>
  );
}
