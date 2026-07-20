"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasProgress, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";

type DiscardReport = {
  period: { start: string; end: string; days: number };
  totals: { lostMoves: number | null; discarded: number; uniqueLeads: number; classified: number; coveragePct: number | null };
  byReason: Array<{ key: string; label: string; metaCategory: string; count: number; share: number }>;
  byMetaCategory: Array<{ category: string; count: number; share: number }>;
  bySource: Array<{ source: string; count: number; share: number }>;
  byCampaign: Array<{ campaignId: string | null; campaign: string | null; count: number; share: number }>;
  andromeda: { policy: string; directorDecisionRequired: boolean; readyForCrmLeadStatusSync: boolean; taxonomyVersion: number };
  generatedAt: string;
};
type ReportStatus = "loading" | "ready" | "restricted" | "error";
type WindowDays = 7 | 30 | 90;

const WINDOW_OPTIONS: WindowDays[] = [7, 30, 90];

export default function PipelineDiscardsPage() {
  const [days, setDays] = useState<WindowDays>(30);
  const [report, setReport] = useState<DiscardReport | null>(null);
  const [status, setStatus] = useState<ReportStatus>("loading");

  const loadReport = useCallback(async (window: WindowDays) => {
    setStatus("loading");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente.");
      const response = await fetch(`/api/v1/analytics/discard-report?days=${window}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (response.status === 401 || response.status === 403) { setStatus("restricted"); return; }
      const payload = await response.json();
      if (!response.ok || payload?.ok !== true) throw new Error("O relatório não pôde ser carregado.");
      setReport(payload.data as DiscardReport);
      setStatus("ready");
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => { void loadReport(days); }, [days, loadReport]);

  const loading = status === "loading";
  const hasData = status === "ready" && report !== null && report.totals.discarded > 0;

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-12" data-phase="38-discard-andromeda-report">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <Link href="/pipeline" className="text-xs font-semibold text-sky-300">← Voltar ao pipeline</Link>
          <div className="mt-4 flex flex-wrap gap-2">
            <AtlasBadge tone="violet">Loop Andromeda</AtlasBadge>
            {report ? <AtlasBadge tone="neutral">Taxonomia v{report.andromeda.taxonomyVersion}</AtlasBadge> : null}
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-.05em] text-white sm:text-4xl">Relatório Andromeda de descartes</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Qualidade dos motivos de perda no padrão Meta CRM lead status. Os sinais negativos permanecem internos até a decisão explícita do diretor de sincronizar com a Meta.</p>
        </div>
        <div className="flex shrink-0 gap-2" role="group" aria-label="Janela do relatório em dias">
          {WINDOW_OPTIONS.map((option) => <button key={option} type="button" onClick={() => setDays(option)} aria-pressed={days === option} className={`rounded-xl border px-4 py-2.5 text-xs font-semibold transition ${days === option ? "border-sky-400/30 bg-sky-400/10 text-sky-200" : "border-white/[0.07] bg-white/[0.025] text-slate-400 hover:border-white/15 hover:text-white"}`}>{option} dias</button>)}
        </div>
      </div>

      {status === "restricted" ? <AtlasEmpty reason="not-configured" eyebrow="Acesso restrito" title="Relatório disponível para a gestão" description="O relatório Andromeda de descartes é liberado para gestor, superintendente e diretor. Fale com a gestão da sua operação para receber o consolidado." action={<Link href="/pipeline" className="atlas-button-secondary">Voltar ao pipeline</Link>} /> : null}
      {status === "error" ? <AtlasRecoverableError description="O relatório de descartes está temporariamente indisponível." onRetry={() => void loadReport(days)} busy={loading} scope="page" /> : null}

      {status === "loading" || status === "ready" ? <>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Totais do período">
          <AtlasMetric icon="🗂️" label="Descartes registrados" value={loading || !report ? "—" : report.totals.discarded} detail={`Últimos ${days} dias`} tone="rose" relevance="primary" />
          <AtlasMetric icon="👤" label="Leads únicos" value={loading || !report ? "—" : report.totals.uniqueLeads} tone="blue" />
          <AtlasMetric icon="🏷️" label="Classificados" value={loading || !report ? "—" : report.totals.classified} detail="Motivo dentro da taxonomia" tone="violet" />
          <AtlasMetric icon="📉" label="Perdas no funil" value={loading || !report ? "—" : report.totals.lostMoves ?? "—"} detail="Movimentações para a etapa de perda" tone="amber" />
          <AtlasMetric icon="🎚️" label="Cobertura" value={loading || !report ? "—" : report.totals.coveragePct === null ? "—" : `${report.totals.coveragePct}%`} detail="Perdas com motivo classificado" tone="green" />
        </section>

        {loading ? <div className="space-y-4"><AtlasSkeleton className="h-64 w-full" /><AtlasSkeleton className="h-48 w-full" /></div> : null}

        {status === "ready" && report && !hasData ? <AtlasCard>
          <AtlasCardHeader eyebrow="Período sem registros" title="Nenhum descarte classificado ainda" />
          <div className="p-4 pt-0 sm:p-6 sm:pt-0">
            <AtlasEmpty reason="no-activity" eyebrow="Aprendizado de descarte" title="Nenhum descarte classificado ainda" description={`Nenhuma lead foi descartada com motivo nos últimos ${days} dias. Ao mover uma lead para a etapa de perda no Kanban, o seletor de motivos alimenta este relatório automaticamente.`} action={<Link href="/pipeline" className="atlas-button-secondary">Abrir o pipeline</Link>} />
          </div>
        </AtlasCard> : null}

        {hasData && report ? <>
          <AtlasCard>
            <AtlasCardHeader eyebrow="Taxonomia estruturada" title="Descartes por motivo" description="Cada motivo carrega a categoria de qualidade que o loop Andromeda consome no padrão Meta." action={<AtlasBadge tone="danger">{report.totals.discarded} DESCARTES</AtlasBadge>} />
            <div className="space-y-3 p-4 sm:p-6">
              {report.byReason.map((item) => <article key={item.key} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-2"><p className="text-sm font-semibold text-white">{item.label}</p><AtlasBadge tone="violet">{item.metaCategory}</AtlasBadge></div>
                  <p className="shrink-0 text-xs text-slate-400"><strong className="text-base font-semibold text-white">{item.count}</strong> · {item.share}%</p>
                </div>
                <div className="mt-3"><AtlasProgress value={item.share} /></div>
              </article>)}
            </div>
          </AtlasCard>

          <div className="grid gap-5 xl:grid-cols-2">
            <AtlasCard>
              <AtlasCardHeader eyebrow="Dimensão Meta" title="Categorias de qualidade" description="Agregado enviado ao aprendizado de entrega quando a sincronização for autorizada." />
              <div className="space-y-3 p-4 sm:p-6">
                {report.byMetaCategory.map((item) => <div key={item.category} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] px-4 py-3">
                  <AtlasBadge tone="violet">{item.category}</AtlasBadge>
                  <p className="text-xs text-slate-400"><strong className="text-sm font-semibold text-white">{item.count}</strong> · {item.share}%</p>
                </div>)}
              </div>
            </AtlasCard>
            <AtlasCard>
              <AtlasCardHeader eyebrow="Governança" title="Status do loop Andromeda" description="Os motivos nascem internos; o envio de lead_status à Meta exige o gate de decisão do diretor." />
              <div className="space-y-3 p-4 sm:p-6">
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] px-4 py-3"><span className="text-xs text-slate-400">Política de sinais negativos</span><AtlasBadge tone="info">Interno até decisão</AtlasBadge></div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] px-4 py-3"><span className="text-xs text-slate-400">Decisão do diretor</span><AtlasBadge tone={report.andromeda.directorDecisionRequired ? "warning" : "success"}>{report.andromeda.directorDecisionRequired ? "Obrigatória" : "Dispensada"}</AtlasBadge></div>
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] px-4 py-3"><span className="text-xs text-slate-400">Pronto para sincronizar CRM lead status</span><AtlasBadge tone={report.andromeda.readyForCrmLeadStatusSync ? "success" : "neutral"}>{report.andromeda.readyForCrmLeadStatusSync ? "Sim · cobertura ≥ 80%" : "Ainda não · cobertura < 80%"}</AtlasBadge></div>
                <p className="text-[11px] leading-5 text-slate-500">Gerado em {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(report.generatedAt))} · taxonomia v{report.andromeda.taxonomyVersion}.</p>
              </div>
            </AtlasCard>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <AtlasCard>
              <AtlasCardHeader eyebrow="Origem do lead" title="Descartes por origem" description="Onde nascem as leads que estão sendo descartadas." />
              <div className="space-y-3 p-4 sm:p-6">
                {report.bySource.map((item) => <div key={item.source} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] px-4 py-3">
                  <span className="min-w-0 truncate text-sm text-slate-200">{item.source}</span>
                  <p className="shrink-0 text-xs text-slate-400"><strong className="text-sm font-semibold text-white">{item.count}</strong> · {item.share}%</p>
                </div>)}
              </div>
            </AtlasCard>
            <AtlasCard>
              <AtlasCardHeader eyebrow="Mídia paga" title="Descartes por campanha" description="Campanhas cujas leads terminaram descartadas na janela." />
              <div className="space-y-3 p-4 sm:p-6">
                {report.byCampaign.map((item) => <div key={item.campaignId ?? "sem_campanha"} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] px-4 py-3">
                  <span className="min-w-0 truncate text-sm text-slate-200">{item.campaign || item.campaignId || "Sem campanha"}</span>
                  <p className="shrink-0 text-xs text-slate-400"><strong className="text-sm font-semibold text-white">{item.count}</strong> · {item.share}%</p>
                </div>)}
              </div>
            </AtlasCard>
          </div>
        </> : null}
      </> : null}
    </div>
  );
}
