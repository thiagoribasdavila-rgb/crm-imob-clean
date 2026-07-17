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
        .from("conversations")
        .select("id,channel,status,unread_count,last_message_at,lead_id,customer_id,assigned_to")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (!active) return;
      if (queryError) setError(queryError.message);
      else {
        const conversations = (data ?? []) as Conversation[];
        const conversationIds = conversations.map((item) => item.id);
        const leadIds = conversations.map((item) => item.lead_id).filter(Boolean) as string[];
        const brokerIds = conversations.map((item) => item.assigned_to).filter(Boolean) as string[];
        const [{ data: journeys }, { data: leads }, { data: brokers }] = await Promise.all([
          conversationIds.length ? supabase.from("ai_sales_journeys").select("conversation_id,stage,status,updated_at").in("conversation_id", conversationIds) : Promise.resolve({ data: [] }),
          leadIds.length ? supabase.from("leads").select("id,name").in("id", leadIds) : Promise.resolve({ data: [] }),
          brokerIds.length ? supabase.from("profiles").select("id,full_name").in("id", brokerIds) : Promise.resolve({ data: [] }),
        ]);
        setItems(conversations.map((item) => ({ ...item, leadName: leads?.find((lead) => lead.id === item.lead_id)?.name || undefined, brokerName: brokers?.find((broker) => broker.id === item.assigned_to)?.full_name || undefined, journey: journeys?.find((journey) => journey.conversation_id === item.id) || undefined })) as Conversation[]);
      }
      setLoading(false);
    }
    void load();
    const channel = supabase.channel("atlas-conversations-live").on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => { void load(); }).on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, () => { void load(); }).subscribe();
    const refreshVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", refreshVisible);
    return () => { active = false; document.removeEventListener("visibilitychange", refreshVisible); void supabase.removeChannel(channel); };
  }, []);

  return (
    <div className="space-y-8">
      <header><p className="atlas-eyebrow">Fase 49 · Resposta noturna</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em]">Conversas do meu escopo</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">A resposta chega ao corretor exclusivo, avança a jornada para descoberta e destaca a próxima ação sem misturar carteiras.</p></header>
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
