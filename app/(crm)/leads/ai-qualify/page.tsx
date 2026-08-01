"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

type Lead = {
  id: string; name: string | null; status: string | null; score: number | null;
  temperature: string | null; source: string | null; assigned_to: string | null;
  next_action_at: string | null; last_interaction_at: string | null; created_at: string | null;
};

function priority(lead: Lead, now: number) {
  let value = Number(lead.score ?? 0);
  if (lead.temperature === "quente") value += 20;
  if (!lead.next_action_at) value += 12;
  else if (new Date(lead.next_action_at).getTime() < now) value += 25;
  if (!lead.last_interaction_at) value += 10;
  return value;
}

export default function AIQualifyPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [referenceTime, setReferenceTime] = useState(0);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) { setError("Sessão expirada."); setLoading(false); return; }
      const response = await fetch("/api/v1/crm/leads?page=1&limit=100&sort=score&direction=desc", { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json();
      if (!response.ok) setError(payload?.error?.message || "Não foi possível carregar a carteira.");
      else setLeads(payload?.data?.items ?? []);
      setReferenceTime(Date.now());
      setLoading(false);
    }
    void load();
  }, []);

  const ranked = useMemo(() => [...leads].sort((a, b) => priority(b, referenceTime) - priority(a, referenceTime)), [leads, referenceTime]);
  const hot = leads.filter((lead) => lead.temperature === "quente" || Number(lead.score ?? 0) >= 70).length;
  const overdue = leads.filter((lead) => lead.next_action_at && referenceTime && new Date(lead.next_action_at).getTime() < referenceTime).length;
  const withoutAction = leads.filter((lead) => !lead.next_action_at).length;

  return (
    <div className="space-y-6 pb-10">
      <section className="atlas-grid-glow overflow-hidden rounded-[30px] border border-violet-400/10 bg-gradient-to-br from-violet-500/[.13] via-blue-500/[.06] to-cyan-500/[.08] p-6 sm:p-8">
        <div className="max-w-4xl"><div className="flex flex-wrap gap-2"><AtlasBadge tone="violet">QUALIFICAÇÃO IA</AtlasBadge><AtlasBadge tone="success">EXPLICÁVEL</AtlasBadge><AtlasBadge tone="info">PRÓXIMA AÇÃO</AtlasBadge></div><h1 className="mt-5 text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Uma fila comercial que explica quem atender primeiro.</h1><p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">O Atlas combina qualidade do perfil, engajamento, avanço no funil, aderência ao estoque e risco de inércia. A nota nunca é uma caixa-preta: cada fator fica visível no Lead 360.</p></div>
      </section>

      <section className="grid gap-4 sm:grid-cols-4">
        <AtlasMetric label="Carteira analisada" value={loading ? "—" : leads.length} detail="Dentro do seu escopo" trend="RLS" tone="blue" />
        <AtlasMetric label="Leads quentes" value={loading ? "—" : hot} detail="Score ≥ 70 ou temperatura quente" trend="PRIORIDADE" tone="rose" />
        <AtlasMetric label="Ações atrasadas" value={loading ? "—" : overdue} detail="Follow-up fora do prazo" trend="SLA" tone="amber" />
        <AtlasMetric label="Sem próxima ação" value={loading ? "—" : withoutAction} detail="Carteira sem cadência definida" trend="RISCO" tone="violet" />
      </section>

      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}
      <AtlasCard>
        <AtlasCardHeader eyebrow="AI priority queue" title="Fila recomendada" description="Ordenada por potencial comercial e urgência operacional." action={<Link href="/leads" className="text-xs font-semibold text-sky-300">Abrir carteira completa →</Link>} />
        <div className="p-5 sm:p-6">
          {loading ? <div className="space-y-3">{[1,2,3,4,5].map((item) => <AtlasSkeleton key={item} className="h-20 w-full" />)}</div> : ranked.length === 0 ? <AtlasEmpty title="Nenhum lead para qualificar" description="Cadastre leads para ativar a fila inteligente." /> : <div className="space-y-3">{ranked.slice(0, 20).map((lead, index) => {
            const isOverdue = Boolean(lead.next_action_at && referenceTime && new Date(lead.next_action_at).getTime() < referenceTime);
            return <Link key={lead.id} href={`/leads/${lead.id}`} className="grid gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 transition hover:border-sky-400/20 hover:bg-sky-400/[0.04] sm:grid-cols-[44px_1fr_auto] sm:items-center"><span className="grid h-10 w-10 place-items-center rounded-xl bg-sky-400/10 text-sm font-bold text-sky-300">{index + 1}</span><div><strong className="block text-sm text-white">{lead.name || "Lead sem nome"}</strong><span className="mt-1 block text-xs text-slate-500">{lead.source || "Origem não informada"} · {lead.status || "novo"} · {isOverdue ? "follow-up atrasado" : lead.next_action_at ? "ação agendada" : "sem próxima ação"}</span></div><div className="flex items-center gap-2"><AtlasBadge tone={isOverdue ? "danger" : lead.temperature === "quente" ? "warning" : "info"}>{lead.score ?? 0} pontos</AtlasBadge><span className="text-sky-300">→</span></div></Link>;
          })}</div>}
        </div>
      </AtlasCard>
    </div>
  );
}
