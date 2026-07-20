"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

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

/* CC-6: meter geométrico de participação — hairline como trilho, rose como
   tinta de perda. Sem glow; a barra é a própria evidência do share. */
function ShareMeter({ share }: { share: number }) {
  return (
    <div className="mt-2 h-1 overflow-hidden rounded-full bg-[rgba(148,163,184,0.12)]" aria-hidden="true">
      <div className="h-full rounded-full bg-[#fb7185]" style={{ width: `${Math.min(100, Math.max(0, share))}%` }} />
    </div>
  );
}

export default function PipelineDiscardsPage() {
  const [days, setDays] = useState<WindowDays>(30);
  const [report, setReport] = useState<DiscardReport | null>(null);
  const [status, setStatus] = useState<ReportStatus>("loading");

  // Aborta o request anterior ao trocar a janela (7→90 rápido) — sem isso,
  // uma resposta fora de ordem podia exibir dados da janela errada.
  const abortRef = useRef<AbortController | null>(null);

  const loadReport = useCallback(async (window: WindowDays) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus("loading");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("Sessão expirada. Entre novamente.");
      const response = await fetch(`/api/v1/analytics/discard-report?days=${window}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
      if (controller.signal.aborted) return;
      if (response.status === 401 || response.status === 403) { setStatus("restricted"); return; }
      const payload = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok || payload?.ok !== true) throw new Error("O relatório não pôde ser carregado.");
      setReport(payload.data as DiscardReport);
      setStatus("ready");
    } catch {
      // Abort não é erro: o request mais novo é dono do estado da tela.
      if (controller.signal.aborted) return;
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void loadReport(days);
    return () => abortRef.current?.abort();
  }, [days, loadReport]);

  const loading = status === "loading";
  const hasData = status === "ready" && report !== null && report.totals.discarded > 0;

  const totals = [
    { label: `descartes · ${days}d`, value: loading || !report ? "—" : String(report.totals.discarded), ink: hasData ? "cc6-crit" : "" },
    { label: "leads únicos", value: loading || !report ? "—" : String(report.totals.uniqueLeads), ink: "" },
    { label: "classificados", value: loading || !report ? "—" : String(report.totals.classified), ink: "" },
    { label: "perdas no funil", value: loading || !report || report.totals.lostMoves === null ? "—" : String(report.totals.lostMoves), ink: "" },
    {
      label: "cobertura das perdas",
      value: loading || !report || report.totals.coveragePct === null ? "—" : `${report.totals.coveragePct}%`,
      ink: report && report.totals.coveragePct !== null ? (report.totals.coveragePct >= 80 ? "cc6-ok" : "cc6-warn") : "",
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-12" data-phase="38-discard-andromeda-report">
      <PageHeader
        eyebrow="Pipeline · Loop Andromeda"
        title="Relatório Andromeda de descartes"
        description="Motivos de perda no padrão Meta CRM lead status — internos até a decisão explícita do diretor de sincronizar."
        action={{ href: "/pipeline", label: "Voltar ao pipeline", priority: "secondary" }}
      />

      {status === "restricted" ? (
        <p className="cc6-panel-quiet cc6-reveal px-4 py-3.5 text-sm leading-6 text-[#aab6ca]" role="status">
          Relatório liberado para gestor, superintendente e diretor — fale com a gestão da sua operação para receber o consolidado.
        </p>
      ) : null}
      {status === "error" ? <AtlasRecoverableError description="O relatório de descartes está temporariamente indisponível." onRetry={() => void loadReport(days)} busy={loading} scope="page" /> : null}

      {status === "loading" || status === "ready" ? (
        <>
          {/* Taxonomia em evidência: totais, janela e contagem por motivo no
              mesmo painel — a categoria Meta acompanha cada motivo. */}
          <section aria-labelledby="discard-taxonomy-title">
            <TiltShell className="cc6-panel cc6-reveal overflow-hidden" delayMs={0}>
              <header className="flex flex-wrap items-end justify-between gap-3 px-5 pt-5">
                <div>
                  <p className="cc6-eyebrow">Taxonomia Meta · contagem por motivo</p>
                  <h2 id="discard-taxonomy-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">
                    Descartes por motivo
                  </h2>
                </div>
                <div className="flex shrink-0 gap-1.5" role="group" aria-label="Janela do relatório em dias">
                  {WINDOW_OPTIONS.map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => setDays(option)}
                      aria-pressed={days === option}
                      className={`cc6-chip cursor-pointer transition-colors ${
                        days === option
                          ? "border-[color:var(--atlas-accent)]! text-[#e8eef8]!"
                          : "hover:border-[rgba(148,163,184,0.35)]! hover:text-[#e8eef8]!"
                      }`}
                    >
                      {option} dias
                    </button>
                  ))}
                </div>
              </header>

              <div className="mt-4 flex flex-wrap gap-x-10 gap-y-4 px-5 pb-5" aria-label="Totais do período" aria-busy={loading}>
                {totals.map((metric) => (
                  <div key={metric.label}>
                    <p className={`cc6-metric-value text-2xl leading-none sm:text-3xl ${metric.ink}`}>{metric.value}</p>
                    <p className="cc6-metric-label mt-1.5">{metric.label}</p>
                  </div>
                ))}
              </div>

              {loading ? (
                <div className="cc6-hairline space-y-2 p-5">
                  {[1, 2, 3].map((item) => (
                    <AtlasSkeleton key={item} className="h-14" />
                  ))}
                </div>
              ) : null}

              {status === "ready" && report && !hasData ? (
                <p className="cc6-hairline px-5 py-6 text-sm leading-6 text-[#6b7890]">
                  Nenhum descarte classificado nos últimos {days} dias — ao mover uma lead para a etapa de perda no Kanban, o motivo alimenta este relatório.{" "}
                  <Link href="/pipeline" className="font-medium text-[color:var(--atlas-accent)] hover:underline">
                    Abrir o pipeline
                  </Link>
                </p>
              ) : null}

              {hasData && report ? (
                <>
                  <div className="flex flex-col">
                    {report.byReason.map((item, index) => (
                      <article
                        key={item.key}
                        className="cc6-reveal cc6-hairline flex items-center gap-4 px-5 py-3 transition-colors hover:bg-[rgba(75,141,248,0.04)]"
                        style={{ animationDelay: `${80 + Math.min(index, 8) * 45}ms` }}
                      >
                        <span className="cc6-metric-value w-10 shrink-0 text-right text-lg">{item.count}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium text-[#e8eef8]">{item.label}</p>
                            <StatusBadge tone="violet">{item.metaCategory}</StatusBadge>
                          </div>
                          <ShareMeter share={item.share} />
                        </div>
                        <span className="cc6-num shrink-0 text-xs text-[#6b7890]">{item.share}%</span>
                      </article>
                    ))}
                  </div>
                  <div className="cc6-hairline flex flex-wrap items-center gap-1.5 px-5 py-3" aria-label="Agregado por categoria de qualidade Meta">
                    <span className="cc6-eyebrow text-[10px]!">Categorias Meta</span>
                    {report.byMetaCategory.map((item) => (
                      <span key={item.category} className="cc6-chip">
                        {item.category} <strong className="font-semibold text-[#e8eef8]">{item.count}</strong> · {item.share}%
                      </span>
                    ))}
                  </div>
                </>
              ) : null}
            </TiltShell>
          </section>

          {hasData && report ? (
            <>
              <div className="grid gap-4 xl:grid-cols-2">
                <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "120ms" }} aria-labelledby="discard-source-title">
                  <header className="px-5 pt-5 pb-3">
                    <p className="cc6-eyebrow">Origem do lead</p>
                    <h2 id="discard-source-title" className="mt-1 text-sm font-semibold tracking-tight text-[#e8eef8]">
                      Onde nascem as leads descartadas
                    </h2>
                  </header>
                  {report.bySource.map((item) => (
                    <div key={item.source} className="cc6-hairline flex items-baseline justify-between gap-3 px-5 py-2.5">
                      <span className="min-w-0 truncate text-sm text-[#aab6ca]">{item.source}</span>
                      <span className="cc6-num shrink-0 text-xs text-[#6b7890]">
                        <strong className="text-sm font-semibold text-[#e8eef8]">{item.count}</strong> · {item.share}%
                      </span>
                    </div>
                  ))}
                </section>
                <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "160ms" }} aria-labelledby="discard-campaign-title">
                  <header className="px-5 pt-5 pb-3">
                    <p className="cc6-eyebrow">Mídia paga</p>
                    <h2 id="discard-campaign-title" className="mt-1 text-sm font-semibold tracking-tight text-[#e8eef8]">
                      Campanhas com leads descartadas
                    </h2>
                  </header>
                  {report.byCampaign.map((item) => (
                    <div key={item.campaignId ?? "sem_campanha"} className="cc6-hairline flex items-baseline justify-between gap-3 px-5 py-2.5">
                      <span className="min-w-0 truncate text-sm text-[#aab6ca]">{item.campaign || item.campaignId || "Sem campanha"}</span>
                      <span className="cc6-num shrink-0 text-xs text-[#6b7890]">
                        <strong className="text-sm font-semibold text-[#e8eef8]">{item.count}</strong> · {item.share}%
                      </span>
                    </div>
                  ))}
                </section>
              </div>

              <section className="cc6-panel-quiet cc6-reveal p-4" style={{ animationDelay: "200ms" }} aria-labelledby="discard-governance-title">
                <p className="cc6-eyebrow">Governança</p>
                <h2 id="discard-governance-title" className="mt-1 text-sm font-semibold tracking-tight text-[#e8eef8]">
                  Status do loop Andromeda
                </h2>
                <div className="mt-2 flex flex-col">
                  <div className="flex items-center justify-between gap-3 py-2.5">
                    <span className="text-xs text-[#aab6ca]">Política de sinais negativos</span>
                    <StatusBadge tone="info">Interno até decisão</StatusBadge>
                  </div>
                  <div className="cc6-hairline flex items-center justify-between gap-3 py-2.5">
                    <span className="text-xs text-[#aab6ca]">Decisão do diretor</span>
                    <StatusBadge tone={report.andromeda.directorDecisionRequired ? "warning" : "success"}>
                      {report.andromeda.directorDecisionRequired ? "Obrigatória" : "Dispensada"}
                    </StatusBadge>
                  </div>
                  <div className="cc6-hairline flex items-center justify-between gap-3 py-2.5">
                    <span className="text-xs text-[#aab6ca]">Pronto para sincronizar CRM lead status</span>
                    <StatusBadge tone={report.andromeda.readyForCrmLeadStatusSync ? "success" : "neutral"}>
                      {report.andromeda.readyForCrmLeadStatusSync ? "Sim · cobertura ≥ 80%" : "Ainda não · cobertura < 80%"}
                    </StatusBadge>
                  </div>
                </div>
                <p className="cc6-hairline mt-1 pt-2.5 text-[10px] leading-4 text-[#6b7890]">
                  Gerado em{" "}
                  {new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(report.generatedAt))}{" "}
                  · taxonomia v{report.andromeda.taxonomyVersion}.
                </p>
              </section>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
