"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";

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

const CHANNELS = ["crm", "whatsapp", "email", "telefone"] as const;
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

function timeLabel(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return `${date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} · ${date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
}

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

  const channelCount = (name: string) => items.filter((item) => item.channel === name).length;

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        eyebrow="Conversas · Histórico do CRM"
        title="Conversas do meu escopo"
        description="Interações registradas no CRM por lead, canal e responsável. Mensageria em tempo real será habilitada somente após validar a API oficial."
      />

      {/* Estado honesto do canal: contagens derivadas do que já foi carregado,
          sem inventar caixa de entrada. Única superfície com 3D. */}
      <section aria-label="Interações por canal">
        <TiltShell className="cc6-panel cc6-reveal p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4" aria-busy={loading}>
            <div className="flex flex-wrap gap-x-10 gap-y-4">
              <div>
                <p className="cc6-metric-value text-2xl leading-none sm:text-3xl">{loading ? "—" : items.length}</p>
                <p className="cc6-metric-label mt-1.5">interações visíveis</p>
              </div>
              {CHANNELS.map((name) => (
                <div key={name}>
                  <p className="cc6-metric-value text-2xl leading-none sm:text-3xl">{loading ? "—" : channelCount(name)}</p>
                  <p className="cc6-metric-label mt-1.5">{name}</p>
                </div>
              ))}
            </div>
            <span className="cc6-chip" title="Novos eventos entram automaticamente pelo canal em tempo real do banco.">
              <i aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#34d399] motion-safe:animate-pulse" />
              ao vivo
            </span>
          </div>
        </TiltShell>
      </section>

      {error ? (
        <div className="cc6-sev-band cc6-panel-quiet py-3 pl-4 pr-3 text-sm leading-6 text-[#fb7185]" role="alert" style={{ "--cc6-sev": "#fb7185" } as CSSProperties}>{error}</div>
      ) : null}

      <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "60ms" }} aria-labelledby="conversations-list-title">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="conversations-list-title" className="text-sm font-semibold tracking-tight text-[#e8eef8]">Interações registradas</h2>
          {!loading ? <span className="cc6-chip" title="Últimos 200 eventos do seu escopo, todos registrados no CRM">{items.length} no recorte</span> : null}
        </header>
        <div className="cc6-hairline mt-3" aria-busy={loading}>
          {loading ? (
            <div className="grid gap-2 py-4">{[1, 2, 3, 4, 5].map((row) => <AtlasSkeleton key={row} className="h-14" />)}</div>
          ) : items.length === 0 ? (
            <p className="py-4 text-xs leading-5 text-[#6b7890]">Nenhuma conversa sincronizada — as interações registradas nas leads do seu escopo aparecem aqui.</p>
          ) : (
            items.map((item) => (
              <article key={item.id} className="flex flex-col gap-3 border-t border-[rgba(148,163,184,0.12)] py-4 transition-colors first:border-t-0 hover:border-[rgba(148,163,184,0.28)] hover:bg-white/[0.015] md:flex-row md:items-center md:justify-between md:gap-6">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cc6-chip uppercase">{item.channel}</span>
                    <p className="text-sm font-semibold text-[#e8eef8]">{item.leadName || "Contato externo"}</p>
                    {item.journey?.status === "waiting_broker" ? <StatusBadge tone="warning">Responder agora</StatusBadge> : null}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-[#6b7890]">
                    {item.brokerName ? `Corretor: ${item.brokerName}` : item.customer_id ? `Cliente ${item.customer_id.slice(0, 8)}` : "Sem responsável vinculado"}
                    {item.journey ? ` · Jornada ${item.journey.stage.replaceAll("_", " ")}` : ""}
                  </p>
                  {item.journey?.status === "waiting_broker" ? <p className="mt-1 text-xs leading-5 text-[#f5b544]">Próxima ação: abrir a lead e continuar a descoberta.</p> : null}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-3 md:flex-col md:items-end md:gap-1.5">
                  <p className="cc6-num text-xs text-[#aab6ca]">{timeLabel(item.last_message_at)}</p>
                  {item.lead_id ? (
                    <Link href={`/leads/${item.lead_id}`} className={`rounded-md text-xs font-semibold text-[color:var(--atlas-accent-hover)] transition-colors hover:text-[#e8eef8] ${focusRing}`}>
                      Abrir lead →
                    </Link>
                  ) : null}
                </div>
              </article>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
