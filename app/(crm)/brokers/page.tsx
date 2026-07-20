"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";

type Member = { id: string; fullName: string; role: string; reportsTo: string | null; active: boolean; portfolio: number; hotLeads: number; overdue: number; withoutNextAction: number; hotWithoutNextAction: number; won: number };
type Payload = { members: Member[]; supportQueue: Member[]; summary: { activePeople: number; brokers: number; portfolio: number; overdue: number }; method: { peopleRanking: boolean } };

const roleLabel: Record<string, string> = { director: "Diretor", superintendent: "Superintendente", manager: "Gerente", broker: "Corretor", admin: "Diretor" };
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

/* CC-6: um único estado semântico por carteira — o gargalo dominante (atraso >
   quente sem ação > sem próxima ação), nunca duas cores disputando a linha. */
function memberState(member: Member): { tone: "neutral" | "danger" | "warning" | "success"; label: string } {
  if (!member.active) return { tone: "neutral", label: "Inativo" };
  if (member.overdue > 0) return { tone: "danger", label: `${member.overdue} em atraso` };
  if (member.hotWithoutNextAction > 0) return { tone: "warning", label: `${member.hotWithoutNextAction} quentes sem ação` };
  if (member.withoutNextAction > 0) return { tone: "warning", label: `${member.withoutNextAction} sem próxima ação` };
  return { tone: "success", label: "Fluxo em dia" };
}

export default function BrokersPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    const session = (await supabase.auth.getSession()).data.session;
    if (!session) { setError("Sua sessão expirou."); setLoading(false); return; }
    const response = await fetch("/api/v1/crm/team/conversion", { headers: { Authorization: `Bearer ${session.access_token}` } });
    const payload = await response.json();
    if (response.ok) setData(payload.data); else setError(payload.error?.message || "A equipe não pôde ser carregada.");
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const memberMap = useMemo(() => new Map((data?.members ?? []).map((member) => [member.id, member])), [data?.members]);
  function openCopilot(member: Member) { window.dispatchEvent(new CustomEvent("atlas:open-copilot", { detail: { prompt: `Prepare um plano de apoio para uma carteira comercial com ${member.portfolio} leads ativos, ${member.hotLeads} quentes, ${member.overdue} atrasados e ${member.withoutNextAction} sem próxima ação. Não compare pessoas, não envie mensagens e não altere registros.`, context: { module: "team-conversion", role: member.role } } })); }

  const summary = data?.summary;
  const decisive = [
    { label: "pessoas visíveis", value: summary?.activePeople ?? 0, ink: "" },
    { label: "corretores ativos", value: summary?.brokers ?? 0, ink: "" },
    { label: "leads na estrutura", value: summary?.portfolio ?? 0, ink: "" },
    { label: "ações atrasadas", value: summary?.overdue ?? 0, ink: (summary?.overdue ?? 0) > 0 ? "cc6-crit" : "cc6-ok" },
  ];

  return (
    <div className="space-y-4 pb-10" data-evolution-phase="45" data-team-layout="conversion-support">
      <PageHeader
        eyebrow="Equipe · Apoio à conversão"
        title="Ajude cada carteira a avançar"
        description="Diretoria e gestores enxergam apenas a própria estrutura. Atrasos e ausência de próxima ação orientam apoio — não há ranking punitivo de pessoas."
        action={{ href: "/distribution", label: "Distribuir leads" }}
      />

      {/* Números decisivos antes da lista: capacidade, campo, carteira e a
          pressão de SLA na mesma régua mono. Única superfície com 3D. */}
      <section aria-label="Números decisivos da equipe">
        <TiltShell className="cc6-panel cc6-reveal p-5 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4" aria-busy={loading}>
            <div className="flex flex-wrap gap-x-10 gap-y-4">
              {decisive.map((metric) => (
                <div key={metric.label}>
                  <p className={`cc6-metric-value text-2xl leading-none sm:text-3xl ${loading ? "" : metric.ink}`}>{loading ? "—" : metric.value}</p>
                  <p className="cc6-metric-label mt-1.5">{metric.label}</p>
                </div>
              ))}
            </div>
            <Link href="/reports" className="cc6-ghost-btn min-h-11">Ver resultados</Link>
          </div>
        </TiltShell>
      </section>

      {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} /> : null}

      {data?.supportQueue.length ? (
        <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "60ms" }} aria-labelledby="team-support-title">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="cc6-eyebrow">Apoio à conversão</p>
              <h2 id="team-support-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Onde a liderança pode ajudar agora</h2>
            </div>
            <span className="cc6-chip" title="Até três carteiras com bloqueios observáveis — apoio, não ranking de pessoas.">{data.supportQueue.length} para apoiar</span>
          </header>
          <div className="mt-3 grid gap-2">
            {data.supportQueue.map((member) => (
              <article key={member.id} className="cc6-sev-band cc6-panel-quiet flex flex-col gap-3 py-3 pl-4 pr-3 sm:flex-row sm:items-center sm:justify-between" style={{ "--cc6-sev": "#f5b544" } as CSSProperties}>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[#e8eef8]">{member.fullName}</p>
                  <p className="mt-0.5 text-xs text-[#6b7890]">{roleLabel[member.role] || member.role}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="cc6-chip"><strong className={`cc6-num font-semibold ${member.overdue ? "cc6-crit" : ""}`}>{member.overdue}</strong> atrasados</span>
                  <span className="cc6-chip"><strong className={`cc6-num font-semibold ${member.hotWithoutNextAction ? "cc6-warn" : ""}`}>{member.hotWithoutNextAction}</strong> quentes sem ação</span>
                  <button type="button" onClick={() => openCopilot(member)} className={`cc6-ghost-btn min-h-11 ${focusRing}`}>✦ Preparar apoio com IA</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {!error ? (
        <section className="cc6-panel cc6-reveal p-4 sm:p-5" style={{ animationDelay: "120ms" }} aria-labelledby="team-structure-title">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="cc6-eyebrow">Acesso por nível</p>
              <h2 id="team-structure-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Estrutura do time</h2>
            </div>
            {!loading && data?.members.length ? (
              <span className="cc6-chip" title="Responsável direto, função e sinais da carteira">{data.members.length} pessoas</span>
            ) : null}
          </header>
          <div className="cc6-hairline mt-3" aria-busy={loading}>
            {loading ? (
              <div className="grid gap-2 py-4">{[1, 2, 3, 4, 5].map((row) => <AtlasSkeleton key={row} className="h-14" />)}</div>
            ) : !data?.members.length ? (
              <p className="py-4 text-xs leading-5 text-[#6b7890]">Nenhuma pessoa no seu escopo — vincule os perfis na hierarquia comercial para montar o time.</p>
            ) : (
              data.members.map((member) => {
                const leader = member.reportsTo ? memberMap.get(member.reportsTo) : null;
                const state = memberState(member);
                return (
                  <article key={member.id} className="flex flex-col gap-3 border-t border-[rgba(148,163,184,0.12)] py-4 transition-colors first:border-t-0 hover:border-[rgba(148,163,184,0.28)] hover:bg-white/[0.015] md:flex-row md:items-center md:justify-between md:gap-6">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-[#e8eef8]">{member.fullName}</p>
                        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-[#6b7890]">
                        {roleLabel[member.role] || member.role} · responde a {leader?.fullName || "topo da estrutura"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-x-8 gap-y-2 md:text-right">
                      {([["carteira", member.portfolio], ["quentes", member.hotLeads], ["sem ação", member.withoutNextAction]] as const).map(([label, value]) => (
                        <div key={label}>
                          <p className="cc6-num text-sm font-semibold text-[#e8eef8]">{value}</p>
                          <p className="cc6-metric-label">{label}</p>
                        </div>
                      ))}
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
