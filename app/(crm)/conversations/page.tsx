"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Conversation = {
  id: string;
  channel: string;
  status: string;
  unread_count: number;
  last_message_at: string | null;
  lead_id: string | null;
  customer_id: string | null;
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
        .select("id,channel,status,unread_count,last_message_at,lead_id,customer_id")
        .order("last_message_at", { ascending: false, nullsFirst: false });
      if (!active) return;
      if (queryError) setError(queryError.message);
      else setItems((data ?? []) as Conversation[]);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  return (
    <div className="space-y-8">
      <header><p className="atlas-eyebrow">Omnichannel Inbox</p><h1 className="mt-3 text-3xl font-semibold tracking-[-.04em]">Conversas</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">Central única para WhatsApp, Instagram, Messenger, e-mail e histórico de atendimento.</p></header>
      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}
      <section className="atlas-panel overflow-hidden">
        <div className="border-b border-white/[0.07] px-5 py-4 text-sm text-slate-400">{loading ? "Carregando conversas..." : `${items.length} conversa(s)`}</div>
        <div className="divide-y divide-white/[0.06]">
          {!loading && items.length === 0 ? <div className="p-10 text-center text-sm text-slate-500">Nenhuma conversa sincronizada.</div> : null}
          {items.map((item) => <article key={item.id} className="flex items-center gap-4 p-5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-400/10 text-xs font-bold uppercase text-sky-300">{item.channel.slice(0, 2)}</span><div className="min-w-0 flex-1"><p className="font-semibold capitalize text-white">{item.channel}</p><p className="mt-1 text-xs text-slate-500">{item.lead_id ? `Lead ${item.lead_id.slice(0, 8)}` : item.customer_id ? `Cliente ${item.customer_id.slice(0, 8)}` : "Contato externo"}</p></div><div className="text-right"><span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] uppercase text-slate-400">{item.status}</span><p className="mt-2 text-xs text-slate-500">{item.unread_count} não lida(s)</p></div></article>)}
        </div>
      </section>
    </div>
  );
}
