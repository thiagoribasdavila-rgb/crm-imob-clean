"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

type Snapshot = {
  campaigns: number;
  spend: number;
  revenue: number;
  automations: number;
  conversations: number;
  pendingApprovals: number;
};

export default function AtlasV2Page() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ campaigns: 0, spend: 0, revenue: 0, automations: 0, conversations: 0, pendingApprovals: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function load() {
      const [campaigns, automations, conversations, approvals] = await Promise.all([
        supabase.from("campaigns").select("spend,revenue"),
        supabase.from("automation_rules").select("id", { count: "exact", head: true }).eq("status", "active"),
        supabase.from("conversations").select("id", { count: "exact", head: true }).eq("status", "open"),
        supabase.from("approval_requests").select("id", { count: "exact", head: true }).eq("status", "pending"),
      ]);
      if (!active) return;
      const items = campaigns.data ?? [];
      setSnapshot({
        campaigns: items.length,
        spend: items.reduce((sum, item) => sum + Number(item.spend || 0), 0),
        revenue: items.reduce((sum, item) => sum + Number(item.revenue || 0), 0),
        automations: automations.count ?? 0,
        conversations: conversations.count ?? 0,
        pendingApprovals: approvals.count ?? 0,
      });
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  const roi = useMemo(() => snapshot.spend ? ((snapshot.revenue - snapshot.spend) / snapshot.spend) * 100 : 0, [snapshot]);

  const modules = [
    ["Marketing AI", "/marketing", "Campanhas, CPL, ROI e atribuição"],
    ["Conversas", "/conversations", "WhatsApp, Instagram, Messenger e e-mail"],
    ["Criativos", "/creatives", "Biblioteca, aprovação e performance"],
    ["Automações", "/automations", "Gatilhos, ações e governança"],
    ["Aprovações", "/approvals", "Human-in-the-loop para ações sensíveis"],
    ["Integrações", "/integrations", "Meta, WhatsApp, Google e orquestradores"],
  ];

  return (
    <div className="space-y-8">
      <header>
        <p className="atlas-eyebrow">Atlas V2 · Growth Operating Layer</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-.045em]">Marketing, comunicação e automação em uma única camada.</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">O V2 conecta aquisição, atendimento, criatividade, atribuição e execução governada para acelerar receita sem perder controle humano.</p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Campanhas", snapshot.campaigns],
          ["Investimento", money.format(snapshot.spend)],
          ["Receita", money.format(snapshot.revenue)],
          ["ROI", `${roi.toFixed(1)}%`],
          ["Conversas abertas", snapshot.conversations],
          ["Aprovações", snapshot.pendingApprovals],
        ].map(([label, value]) => <article key={String(label)} className="atlas-panel p-5"><p className="text-xs uppercase tracking-[.14em] text-slate-500">{label}</p><p className="mt-3 text-2xl font-semibold text-white">{loading ? "—" : value}</p></article>)}
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {modules.map(([name, href, description]) => <Link key={href} href={href} className="atlas-panel group p-6 transition hover:-translate-y-0.5 hover:border-sky-400/20"><div className="flex items-center justify-between"><h2 className="text-lg font-semibold text-white">{name}</h2><span className="text-sky-300 transition group-hover:translate-x-1">→</span></div><p className="mt-3 text-sm leading-6 text-slate-400">{description}</p></Link>)}
      </section>

      <section className="rounded-3xl border border-emerald-400/15 bg-emerald-400/[0.06] p-6">
        <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-300">Governança ativa</p>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-100/75">Mensagens em massa, publicação de campanhas, contratos e ações financeiras exigem aprovação humana. Automações de baixo risco podem operar dentro de limites configurados.</p>
      </section>
    </div>
  );
}
