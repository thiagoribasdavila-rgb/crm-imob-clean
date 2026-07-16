"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { EmptyState } from "@/components/atlas/empty-state";
import { ErrorState } from "@/components/atlas/error-state";
import { LoadingState } from "@/components/atlas/loading-state";
import { MetricCard } from "@/components/atlas/metric-card";
import { StatusBadge } from "@/components/atlas/status-badge";

type Member = {
  id: string;
  full_name: string | null;
  role: string;
  commercial_role: string | null;
  reports_to: string | null;
  active: boolean;
};

const roleLabel: Record<string, string> = {
  director: "Diretor",
  superintendent: "Superintendente",
  manager: "Gerente",
  broker: "Corretor",
};

export default function BrokersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [leadCounts, setLeadCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const [profilesResult, leadsResult] = await Promise.all([
        supabase.from("profiles").select("id,full_name,role,commercial_role,reports_to,active").order("full_name"),
        supabase.from("leads").select("assigned_to"),
      ]);
      if (!active) return;
      if (profilesResult.error || leadsResult.error) {
        setError(profilesResult.error?.message || leadsResult.error?.message || "Não foi possível carregar a equipe.");
      } else {
        setMembers((profilesResult.data ?? []) as Member[]);
        const counts = new Map<string, number>();
        for (const lead of leadsResult.data ?? []) {
          if (lead.assigned_to) counts.set(lead.assigned_to, (counts.get(lead.assigned_to) ?? 0) + 1);
        }
        setLeadCounts(counts);
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, []);

  const metrics = useMemo(() => ({
    managers: members.filter((member) => (member.commercial_role || member.role) === "manager" && member.active).length,
    brokers: members.filter((member) => (member.commercial_role || member.role) === "broker" && member.active).length,
    active: members.filter((member) => member.active).length,
    portfolio: [...leadCounts.values()].reduce((total, count) => total + count, 0),
  }), [leadCounts, members]);

  const memberMap = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);

  return (
    <div className="space-y-6 pb-10">
      <section className="atlas-leads-hero">
        <div>
          <div className="flex flex-wrap gap-2">
            <StatusBadge tone="violet">HIERARQUIA COMERCIAL</StatusBadge>
            <StatusBadge tone="success">ESCOPO SEGURO</StatusBadge>
          </div>
          <h1>Seu time, da liderança até a carteira de cada corretor.</h1>
          <p>A visão acompanha seu nível de acesso. Você enxerga apenas as pessoas e carteiras que estão abaixo de você na estrutura comercial.</p>
          <div className="atlas-command-actions">
            <Link className="atlas-button-primary" href="/leads">Distribuir leads</Link>
            <Link className="atlas-button-secondary" href="/analytics/brokers">Ver desempenho</Link>
          </div>
        </div>
      </section>

      <section className="atlas-leads-metrics">
        <MetricCard label="Pessoas visíveis" value={loading ? "—" : metrics.active} detail="Dentro do seu escopo" trend="TIME" />
        <MetricCard label="Gerentes" value={loading ? "—" : metrics.managers} detail="Lideranças comerciais" trend="GESTÃO" tone="violet" />
        <MetricCard label="Corretores" value={loading ? "—" : metrics.brokers} detail="Ativos na operação" trend="CAMPO" />
        <MetricCard label="Leads na estrutura" value={loading ? "—" : metrics.portfolio} detail="Carteiras sob gestão" trend="CARTEIRA" tone="warning" />
      </section>

      {error ? <ErrorState description={error} /> : null}
      {!error ? (
        <section className="atlas-leads-table-panel">
          <div className="atlas-leads-table-head">
            <div><strong>Estrutura do time</strong><span>Responsável direto, função e volume da carteira</span></div>
            <StatusBadge tone="info">ACESSO POR NÍVEL</StatusBadge>
          </div>
          {loading ? <div className="p-5"><LoadingState rows={5} /></div> : members.length === 0 ? (
            <EmptyState title="Nenhuma pessoa no seu escopo" description="Vincule os perfis na hierarquia comercial para montar o time." />
          ) : (
            <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-3">
              {members.map((member) => {
                const role = member.commercial_role || member.role;
                const leader = member.reports_to ? memberMap.get(member.reports_to) : null;
                return (
                  <article key={member.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <span className="atlas-lead-avatar">{(member.full_name || "AT").slice(0, 2).toUpperCase()}</span>
                        <div><strong className="block text-white">{member.full_name || "Usuário Atlas"}</strong><span className="text-xs text-slate-400">{roleLabel[role] || role}</span></div>
                      </div>
                      <StatusBadge tone={member.active ? "success" : "danger"}>{member.active ? "Ativo" : "Inativo"}</StatusBadge>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded-xl bg-white/5 p-3"><span className="block text-xs text-slate-500">Liderança</span><strong className="text-slate-200">{leader?.full_name || "Topo da estrutura"}</strong></div>
                      <div className="rounded-xl bg-white/5 p-3"><span className="block text-xs text-slate-500">Carteira</span><strong className="text-slate-200">{leadCounts.get(member.id) ?? 0} leads</strong></div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
