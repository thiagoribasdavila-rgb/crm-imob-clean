"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasSkeleton } from "@/components/ui/AtlasUI";

type ConversationRow = {
  id: string;
  channel: string | null;
  status: string | null;
  unread_count: number | null;
  last_message_at: string | null;
  lead_id: string | null;
  assigned_to: string | null;
  created_at: string | null;
};

type MessageRow = {
  id: string;
  conversation_id: string;
  direction: string | null;
  channel: string | null;
  content: string | null;
  status: string | null;
  created_at: string | null;
};

type LeadRow = { id: string; name: string | null };
type ProfileRow = { id: string; name: string | null; full_name: string | null };

type Conversation = ConversationRow & {
  leadName: string | null;
  brokerName: string | null;
  latestMessage: MessageRow | null;
};

function channelLabel(channel: string | null) {
  if (channel === "whatsapp") return "WhatsApp";
  if (channel === "email") return "E-mail";
  if (channel === "phone") return "Telefone";
  return "CRM";
}

function safePreview(value: string | null) {
  const normalized = (value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Sem prévia disponível";
  return normalized.length > 110 ? `${normalized.slice(0, 107)}…` : normalized;
}

function relativeTime(value: string | null) {
  if (!value) return "Sem movimentação";
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Agora";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export default function ConversationsPage() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setError(null);
      const { data: session } = await supabase.auth.getSession();
      if (!active) return;
      setCurrentUserId(session.session?.user.id || null);

      const { data: conversations, error: conversationsError } = await supabase
        .from("conversations")
        .select("id,channel,status,unread_count,last_message_at,lead_id,assigned_to,created_at")
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(120);

      if (!active) return;
      if (conversationsError) {
        setError("Não foi possível carregar as conversas registradas. Seus dados permanecem protegidos.");
        setItems([]);
        setLoading(false);
        return;
      }

      const rows = (conversations || []) as ConversationRow[];
      const conversationIds = rows.map((item) => item.id);
      const leadIds = [...new Set(rows.map((item) => item.lead_id).filter(Boolean))] as string[];
      const brokerIds = [...new Set(rows.map((item) => item.assigned_to).filter(Boolean))] as string[];
      const [messagesResult, leadsResult, profilesResult] = await Promise.all([
        conversationIds.length
          ? supabase.from("messages").select("id,conversation_id,direction,channel,content,status,created_at").in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(500)
          : Promise.resolve({ data: [], error: null }),
        leadIds.length ? supabase.from("leads").select("id,name").in("id", leadIds) : Promise.resolve({ data: [], error: null }),
        brokerIds.length ? supabase.from("profiles").select("id,name,full_name").in("id", brokerIds) : Promise.resolve({ data: [], error: null }),
      ]);

      if (!active) return;
      if (messagesResult.error || leadsResult.error || profilesResult.error) {
        setError("Parte do histórico não pôde ser carregada. Atualize a tela para tentar novamente.");
      }
      const latestMessageByConversation = new Map<string, MessageRow>();
      for (const message of (messagesResult.data || []) as MessageRow[]) {
        if (!latestMessageByConversation.has(message.conversation_id)) latestMessageByConversation.set(message.conversation_id, message);
      }
      const leadMap = new Map(((leadsResult.data || []) as LeadRow[]).map((lead) => [lead.id, lead.name]));
      const profileMap = new Map(((profilesResult.data || []) as ProfileRow[]).map((profile) => [profile.id, profile.full_name || profile.name]));
      setItems(rows.map((item) => ({
        ...item,
        leadName: item.lead_id ? leadMap.get(item.lead_id) || null : null,
        brokerName: item.assigned_to ? profileMap.get(item.assigned_to) || null : null,
        latestMessage: latestMessageByConversation.get(item.id) || null,
      })));
      setLoading(false);
    }

    void load();
    const channel = supabase.channel("atlas-conversations-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, () => { void load(); })
      .subscribe();
    const refreshVisible = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", refreshVisible);
      void supabase.removeChannel(channel);
    };
  }, []);

  const whatsappItems = useMemo(() => items.filter((item) => item.channel === "whatsapp"), [items]);
  const mine = useMemo(() => items.filter((item) => item.assigned_to === currentUserId), [items, currentUserId]);
  const unread = useMemo(() => items.reduce((total, item) => total + Number(item.unread_count || 0), 0), [items]);
  const recordingActive = whatsappItems.length > 0;

  return (
    <div className="space-y-7">
      <header className="atlas-grid-glow overflow-hidden rounded-[28px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.12] via-blue-500/[.06] to-violet-500/[.1] p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2"><AtlasBadge tone="info">CANAL OFICIAL</AtlasBadge><AtlasBadge tone={recordingActive ? "success" : "warning"}>{recordingActive ? "HISTÓRICO GRAVADO" : "CONEXÃO PENDENTE"}</AtlasBadge></div>
        <h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Conversas da sua carteira, com contexto para agir.</h1>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">O login do Atlas não acessa o WhatsApp pessoal do corretor. A diretoria conecta um número oficial da empresa; as conversas desse canal são roteadas ao corretor responsável e registradas no CRM com consentimento, opt-out e histórico auditável.</p>
        <div className="mt-5 flex flex-wrap gap-3 text-xs text-slate-300"><span className="rounded-full border border-white/10 bg-slate-950/25 px-3 py-2">{whatsappItems.length} conversa(s) WhatsApp registradas</span><span className="rounded-full border border-white/10 bg-slate-950/25 px-3 py-2">{unread} aguardando leitura</span><span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.07] px-3 py-2 text-cyan-100"><strong>RESPONDER AGORA</strong> · Próxima ação: continuar a descoberta.</span><span className="rounded-full border border-white/10 bg-slate-950/25 px-3 py-2">{mine.length} na sua carteira</span></div>
        {!recordingActive ? <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/15 bg-amber-300/[.06] p-4 text-sm text-amber-100"><span>Não há conversa oficial gravada nesta organização ainda.</span><Link href="/integrations/whatsapp" className="font-semibold text-sky-200 underline underline-offset-4">Diretoria: conectar WhatsApp oficial →</Link></div> : null}
      </header>

      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}

      <section className="atlas-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] px-5 py-4 text-sm text-slate-400"><span>{loading ? "Carregando conversas reais..." : `${items.length} conversa(s) no seu escopo`}</span><span className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-emerald-300"><i className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />Atualização ao vivo</span></div>
        {loading ? <div className="space-y-3 p-5"><AtlasSkeleton className="h-20 w-full" /><AtlasSkeleton className="h-20 w-full" /><AtlasSkeleton className="h-20 w-full" /></div> : null}
        {!loading && items.length === 0 ? <div className="p-10 text-center"><p className="font-semibold text-white">Nenhuma conversa oficial sincronizada.</p><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">Assim que o WhatsApp Business oficial estiver conectado e uma mensagem for recebida, ela aparecerá aqui para o corretor responsável. O Atlas guarda o histórico no CRM e usa somente sinais e resumos autorizados para apoiar a IA.</p></div> : null}
        {!loading && items.length ? <div className="divide-y divide-white/[0.06]">{items.map((item) => <article key={item.id} className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/10 text-[10px] font-bold uppercase text-emerald-300">{channelLabel(item.channel).slice(0, 2)}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold text-white">{item.leadName || channelLabel(item.channel)}</p><AtlasBadge tone={item.latestMessage?.direction === "inbound" ? "success" : "info"}>{item.latestMessage?.direction === "inbound" ? "RECEBIDA" : "ENVIADA"}</AtlasBadge></div><p className="mt-1 truncate text-sm text-slate-400">{safePreview(item.latestMessage?.content || null)}</p><p className="mt-2 text-xs text-slate-500">{item.brokerName ? `Responsável: ${item.brokerName}` : "Responsável ainda não definido"} · {relativeTime(item.last_message_at || item.latestMessage?.created_at || null)}</p></div><div className="flex shrink-0 items-center gap-3 sm:block sm:text-right"><div><span className="rounded-full bg-white/[0.05] px-2.5 py-1 text-[10px] uppercase text-slate-400">{item.status || "aberta"}</span><p className="mt-2 text-xs text-slate-500">{item.unread_count || 0} não lida(s)</p></div>{item.lead_id ? <Link href={`/leads/${item.lead_id}`} className="text-xs font-semibold text-sky-300">Abrir lead →</Link> : null}</div></article>)}</div> : null}
      </section>
    </div>
  );
}
