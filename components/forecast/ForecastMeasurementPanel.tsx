"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader } from "@/components/ui/AtlasCard";

type Snapshot = { id: string; snapshot_at: string; horizon_days: number; horizon_end: string; predicted_weighted: number; opportunity_count: number; confidence_band: string; evaluated_at: string | null; actual_won_value: number | null; actual_won_count: number | null; accuracy_percent: number | null; result_note: string | null; status: "observing" | "ready_to_evaluate" | "evaluated" };
type Payload = { snapshots: Snapshot[]; summary: { total: number; observing: number; ready: number; evaluated: number }; trend: { status: "insufficient_evidence" | "comparable"; claimAllowed: boolean; samples: number; movement: number | null } };
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

async function token() { return (await supabase.auth.getSession()).data.session?.access_token || ""; }

export function ForecastMeasurementPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [horizon, setHorizon] = useState(30);
  const load = useCallback(async () => {
    const response = await fetch("/api/v1/analytics/forecast/snapshots", { headers: { Authorization: `Bearer ${await token()}` }, cache: "no-store" });
    const body = await response.json();
    if (!response.ok) { setError(body.error?.message || "Medição histórica indisponível."); return; }
    setError(""); setData(body.data || body);
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function act(action: "capture" | "evaluate", snapshotId?: string) {
    setBusy(snapshotId || action); setError("");
    const response = await fetch("/api/v1/analytics/forecast/snapshots", { method: "POST", headers: { Authorization: `Bearer ${await token()}`, "Content-Type": "application/json" }, body: JSON.stringify({ action, horizonDays: horizon, snapshotId }) });
    const body = await response.json();
    if (!response.ok) setError(body.error?.message || "Não foi possível concluir a medição.");
    else await load();
    setBusy("");
  }
  return <AtlasCard data-ux-phase="56-forecast-snapshot-measurement">
    <AtlasCardHeader eyebrow="Previsto × realizado" title="Memória do forecast" description="Congele a previsão, aguarde o horizonte e compare as mesmas oportunidades com vendas observadas." />
    <div className="space-y-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-slate-400">Horizonte
          <select className="atlas-input min-w-36" value={horizon} onChange={(event) => setHorizon(Number(event.target.value))}><option value={30}>30 dias</option><option value={60}>60 dias</option><option value={90}>90 dias</option></select>
        </label>
        <button className="atlas-button-primary" disabled={Boolean(busy)} onClick={() => void act("capture")}>{busy === "capture" ? "Registrando…" : "Registrar fotografia"}</button>
        <p className="max-w-xl text-xs leading-5 text-slate-500">A fotografia é imutável. Aferição e leitura de tendência nunca executam ação comercial.</p>
      </div>
      {error ? <div className="rounded-xl border border-rose-400/20 bg-rose-400/10 p-3 text-xs text-rose-200">{error}</div> : null}
      {!data && !error ? <AtlasSkeleton className="h-40" /> : null}
      {data ? <>
        <div className="grid gap-3 sm:grid-cols-4">
          {[['Fotografias',data.summary.total],['Em observação',data.summary.observing],['Prontas para aferir',data.summary.ready],['Aferidas',data.summary.evaluated]].map(([label,value]) => <div key={String(label)} className="rounded-xl border border-white/[.06] bg-white/[.025] p-3"><span className="text-[10px] uppercase tracking-wider text-slate-500">{label}</span><strong className="mt-1 block text-lg text-white">{value}</strong></div>)}
        </div>
        <div className="rounded-xl border border-violet-400/15 bg-violet-400/[.05] p-3 text-xs leading-5 text-slate-300">
          {data.trend.claimAllowed ? <>Série comparável: <strong>{data.trend.movement! > 0 ? "+" : ""}{data.trend.movement} p.p.</strong> de variação na precisão das três últimas janelas independentes.</> : <>Tendência ainda não declarada: são necessárias três janelas aferidas, de igual horizonte, não sobrepostas e com ao menos cinco oportunidades.</>}
        </div>
        {data.snapshots.length ? <div className="space-y-2">{data.snapshots.slice(0, 8).map((item) => <div key={item.id} className="grid gap-3 rounded-2xl border border-white/[.06] bg-white/[.02] p-4 sm:grid-cols-[1.2fr_1fr_1fr_auto] sm:items-center">
          <div><div className="flex items-center gap-2"><strong className="text-sm text-white">{item.horizon_days} dias</strong><AtlasBadge tone={item.status === "evaluated" ? "success" : item.status === "ready_to_evaluate" ? "warning" : "violet"}>{item.status === "evaluated" ? "Aferido" : item.status === "ready_to_evaluate" ? "Pronto" : "Observando"}</AtlasBadge></div><p className="mt-1 text-[10px] text-slate-500">{item.opportunity_count} oportunidades · encerra {date.format(new Date(item.horizon_end))}</p></div>
          <div><span className="text-[10px] text-slate-500">Previsto</span><strong className="block text-sm text-violet-100">{brl.format(item.predicted_weighted)}</strong></div>
          <div><span className="text-[10px] text-slate-500">Realizado</span><strong className="block text-sm text-white">{item.evaluated_at ? brl.format(item.actual_won_value || 0) : "Aguardando"}</strong>{item.accuracy_percent !== null ? <small className="text-[10px] text-slate-500">Precisão {item.accuracy_percent}%</small> : null}</div>
          {item.status === "ready_to_evaluate" ? <button className="atlas-button-secondary" disabled={Boolean(busy)} onClick={() => void act("evaluate", item.id)}>{busy === item.id ? "Aferindo…" : "Aferir resultado"}</button> : <span className="text-right text-[10px] text-slate-600">{item.result_note || "Sem ação pendente"}</span>}
        </div>)}</div> : <AtlasEmpty title="Nenhuma fotografia registrada" description="Registre a primeira previsão para começar uma medição responsável." />}
      </> : null}
    </div>
  </AtlasCard>;
}
