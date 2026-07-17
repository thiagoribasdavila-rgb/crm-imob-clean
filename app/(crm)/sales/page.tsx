"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/atlas/page-header";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { AtlasBadge, AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";

type Opportunity = {
  id: string; stage: string; value: number | null; probability: number; expected_close_at: string | null;
  won_at: string | null; lost_at: string | null; commission_sla_days: number | null; commission_due_at: string | null;
  commission_received_at: string | null; commission_status: "not_applicable" | "pending" | "due_soon" | "overdue" | "partial" | "received" | "divergent";
  commission_net: number | null; commission_gross: number | null; commission_percentage: number | null;
  commission_split_percentage: number | null; commission_received_amount: number;
  leads: { id: string; name: string | null } | null; properties: { title: string | null } | null;
};
type View = "all" | "attention" | "closing" | "won";
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function SalesPage() {
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [referenceTime, setReferenceTime] = useState(0);
  const [canManage, setCanManage] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>("all");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: loadError } = await supabase.from("opportunities")
      .select("id,stage,value,probability,expected_close_at,won_at,lost_at,commission_sla_days,commission_due_at,commission_received_at,commission_status,commission_gross,commission_percentage,commission_split_percentage,commission_net,commission_received_amount,leads(id,name),properties(title)")
      .order("created_at", { ascending: false });
    if (loadError) setError("Não foi possível carregar as oportunidades.");
    setItems((data ?? []) as unknown as Opportunity[]); setReferenceTime(Date.now()); setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.access_token) return;
      const response = await fetch("/api/v1/auth/me", { headers: { Authorization: `Bearer ${data.session.access_token}` } });
      const body = await response.json(); const profile = body.data?.profile;
      setCanManage(profile?.commercialRole === "director" || profile?.role === "admin");
    })();
  }, [load]);

  async function updateCommission(id: string, payload: Record<string, unknown>) {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) { setError("Sessão expirada. Entre novamente."); return; }
    setSavingId(id); setError("");
    try {
      const response = await fetch(`/api/v1/sales/${id}/commission`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(payload) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Não foi possível atualizar a comissão.");
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Falha ao atualizar comissão."); }
    finally { setSavingId(null); }
  }
  function configureCommission(item: Opportunity) {
    const gross = window.prompt("Comissão bruta (R$):", String(item.commission_gross ?? "")); if (gross === null) return;
    const net = window.prompt("Comissão líquida prevista (R$):", String(item.commission_net ?? "")); if (net === null) return;
    const percentage = window.prompt("Percentual da comissão (%), se houver:", String(item.commission_percentage ?? "")); if (percentage === null) return;
    const splitPercentage = window.prompt("Percentual destinado ao corretor/time (%), se houver:", String(item.commission_split_percentage ?? "")); if (splitPercentage === null) return;
    void updateCommission(item.id, { action: "configure", gross, net, percentage: percentage || null, splitPercentage: splitPercentage || null });
  }
  function registerPayment(item: Opportunity) {
    const paymentAmount = window.prompt("Valor recebido agora (R$):"); if (paymentAmount === null) return;
    const notes = window.prompt("Observação ou identificação do pagamento (opcional):") ?? "";
    void updateCommission(item.id, { action: "payment", paymentAmount, notes });
  }
  function opportunityRisk(item: Opportunity) {
    if (item.won_at) return { key: "won", label: "Venda ganha", tone: "success" as const };
    if (item.lost_at) return { key: "lost", label: "Encerrada", tone: "neutral" as const };
    if (!item.value || !item.expected_close_at) return { key: "incomplete", label: "Dados incompletos", tone: "warning" as const };
    const days = Math.ceil((new Date(item.expected_close_at).getTime() - referenceTime) / 86_400_000);
    if (days < 0) return { key: "overdue", label: "Prazo vencido", tone: "danger" as const };
    if (days <= 14 && item.probability < 50) return { key: "at_risk", label: "Prazo próximo", tone: "danger" as const };
    if (days <= 30) return { key: "closing", label: "Fecha em 30 dias", tone: "violet" as const };
    return { key: "healthy", label: "Em evolução", tone: "info" as const };
  }
  function commissionStatus(item: Opportunity) {
    if (["received", "partial", "divergent"].includes(item.commission_status)) return item.commission_status;
    if (!item.commission_due_at) return "pending";
    const remaining = new Date(item.commission_due_at).getTime() - referenceTime;
    return remaining < 0 ? "overdue" : remaining <= 7 * 86_400_000 ? "due_soon" : "pending";
  }

  const metrics = useMemo(() => {
    const open = items.filter((item) => !item.won_at && !item.lost_at);
    return { total: items.reduce((sum, item) => sum + Number(item.value ?? 0), 0), weighted: open.reduce((sum, item) => sum + Number(item.value ?? 0) * item.probability / 100, 0), won: items.filter((item) => item.won_at).reduce((sum, item) => sum + Number(item.value ?? 0), 0), open: open.length };
  }, [items]);
  const attentionCount = items.filter((item) => ["incomplete", "overdue", "at_risk"].includes(opportunityRisk(item).key)).length;
  const visible = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    const weight: Record<string, number> = { overdue: 5, at_risk: 4, incomplete: 3, closing: 2, healthy: 1, won: 0, lost: 0 };
    return items.filter((item) => {
      const risk = opportunityRisk(item);
      const matchesView = view === "all" || (view === "attention" && ["incomplete", "overdue", "at_risk"].includes(risk.key)) || (view === "closing" && risk.key === "closing") || (view === "won" && Boolean(item.won_at));
      return matchesView && (!normalized || [item.leads?.name, item.properties?.title, item.stage].some((value) => value?.toLocaleLowerCase("pt-BR").includes(normalized)));
    }).sort((a, b) => (weight[opportunityRisk(b).key] - weight[opportunityRisk(a).key]) || Number(b.value || 0) - Number(a.value || 0));
  }, [items, query, referenceTime, view]);

  return <div className="space-y-6 pb-8">
    <section className="relative overflow-hidden rounded-[28px] border border-white/[.08] bg-white/[.025] p-6 pr-32 sm:p-8 sm:pr-44">
      <Image src="/brand/atlas-robot-broker.png" alt="Robô-corretor Atlas" width={84} height={126} className="pointer-events-none absolute -bottom-8 right-5 h-auto w-20 opacity-70" />
      <PageHeader eyebrow="Revenue engine · Opportunity workspace" title="Vendas e oportunidades" description="Valor, probabilidade, prazo e risco organizados para o time saber quais negócios exigem ação agora." actions={<Link href="/atlas-v3/forecast" className="atlas-button-secondary">Abrir forecast</Link>} />
    </section>
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><AtlasMetric label="VGV total" value={brl.format(metrics.total)} detail="Base total visível" trend="VGV" tone="blue"/><AtlasMetric label="Forecast ponderado" value={brl.format(metrics.weighted)} detail="Valor × probabilidade" trend="PREVISÃO" tone="violet"/><AtlasMetric label="Vendas ganhas" value={brl.format(metrics.won)} detail="Receita comercial confirmada" trend="GANHO" tone="green"/><AtlasMetric label="Oportunidades abertas" value={metrics.open} detail="Negócios em andamento" trend="PIPE" tone="blue"/><AtlasMetric label="Exigem atenção" value={attentionCount} detail="Prazo, valor ou previsão" trend="AGIR" tone={attentionCount ? "rose" : "green"}/></section>
    {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}
    <AtlasCard><AtlasCardHeader eyebrow="Pipeline de receita" title="Fila de oportunidades" description="Os negócios de maior risco aparecem primeiro. A previsão orienta, mas não garante fechamento." action={<AtlasBadge tone="violet">REVISÃO HUMANA</AtlasBadge>}/>
      <div className="grid gap-3 border-t border-white/[.06] p-4 sm:grid-cols-[1fr_auto] sm:p-5"><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full px-4" placeholder="Buscar lead, imóvel ou etapa"/><div className="flex gap-2 overflow-x-auto">{([['all','Todas'],['attention',`Atenção ${attentionCount}`],['closing','Fecha em 30d'],['won','Ganhas']] as const).map(([key,label]) => <button key={key} onClick={() => setView(key)} className={`atlas-kanban-toggle shrink-0 ${view === key ? "is-active" : ""}`}>{label}</button>)}</div></div>
      {loading ? <div className="grid gap-3 p-5">{[1,2,3].map((item) => <AtlasSkeleton key={item} className="h-20"/>)}</div> : visible.length ? <div className="overflow-x-auto"><table className="min-w-[1040px] text-sm"><thead><tr><th>Lead</th><th>Imóvel</th><th>Etapa</th><th>Valor</th><th>Forecast</th><th>Fechamento</th><th>Risco</th>{canManage ? <><th>SLA comissão</th><th>Ações</th></> : null}</tr></thead><tbody>{visible.map((item) => {
        const risk = opportunityRisk(item); const status = commissionStatus(item); const commissionTone = status === "received" ? "success" : ["overdue", "divergent"].includes(status) ? "danger" : "warning";
        return <tr key={item.id}><td>{item.leads?.id ? <Link className="font-semibold text-white hover:text-cyan-200" href={`/leads/${item.leads.id}`}>{item.leads.name || "Lead sem nome"} →</Link> : "Sem lead"}</td><td className="text-slate-400">{item.properties?.title || "Sem imóvel"}</td><td><AtlasBadge tone="info">{item.stage}</AtlasBadge></td><td className="font-semibold text-white">{brl.format(Number(item.value || 0))}</td><td><strong className="text-violet-200">{brl.format(Number(item.value || 0) * item.probability / 100)}</strong><span className="mt-1 block text-[10px] text-slate-600">{item.probability}%</span></td><td className="text-slate-400">{item.expected_close_at ? new Date(item.expected_close_at).toLocaleDateString("pt-BR") : "Definir data"}</td><td><AtlasBadge tone={risk.tone}>{risk.label}</AtlasBadge></td>{canManage ? <><td>{item.won_at ? <div><AtlasBadge tone={commissionTone}>{status.replaceAll("_", " ").toUpperCase()}</AtlasBadge><p className="mt-2 text-[10px] text-slate-500">{item.commission_sla_days ?? 30} dias{item.commission_net ? ` · ${brl.format(item.commission_received_amount || 0)} de ${brl.format(item.commission_net)}` : ""}</p></div> : <span className="text-slate-600">Após a venda</span>}</td><td>{item.won_at ? <div className="flex min-w-36 flex-col gap-2"><button disabled={savingId === item.id} onClick={() => configureCommission(item)} className="atlas-button-secondary">Configurar</button><button disabled={savingId === item.id || !item.commission_net} onClick={() => registerPayment(item)} className="atlas-button-primary">Recebimento</button></div> : item.leads?.id ? <Link className="atlas-button-secondary" href={`/leads/${item.leads.id}`}>Abrir negócio</Link> : null}</td></> : null}</tr>;
      })}</tbody></table></div> : <div className="p-5"><AtlasEmpty title={items.length ? "Nenhuma oportunidade neste filtro" : "Nenhuma oportunidade registrada"} description={items.length ? "Limpe a busca ou altere o filtro para ampliar a fila." : "As oportunidades aparecerão quando uma lead avançar para um negócio comercial."} action={items.length ? <button className="atlas-button-secondary" onClick={() => { setQuery(""); setView("all"); }}>Limpar filtros</button> : <Link href="/pipeline" className="atlas-button-primary">Abrir pipeline</Link>}/></div>}
    </AtlasCard>
  </div>;
}
