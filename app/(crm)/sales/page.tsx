"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/atlas/page-header";
import { KanbanHandoffBanner } from "@/components/atlas/kanban-handoff-banner";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { AtlasBadge, AtlasEmpty, AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { isMissingRelation, leadAsOpportunity, mapLegacyLead } from "@/lib/compat/legacy-v2";

type Opportunity = {
  id: string; stage: string; value: number | null; probability: number; expected_close_at: string | null;
  won_at: string | null; lost_at: string | null; commission_sla_days: number | null; commission_due_at: string | null;
  commission_received_at: string | null; commission_status: "not_applicable" | "pending" | "due_soon" | "overdue" | "partial" | "received" | "divergent";
  commission_net: number | null; commission_gross: number | null; commission_percentage: number | null;
  commission_split_percentage: number | null; commission_received_amount: number;
  leads: { id: string; name: string | null } | null; properties: { title: string | null } | null;
};
type View = "all" | "attention" | "closing" | "won";
type FinancialEditor = {
  mode: "configure" | "payment";
  item: Opportunity;
  gross: string;
  net: string;
  percentage: string;
  splitPercentage: string;
  paymentAmount: string;
  notes: string;
};
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
  const [financialEditor, setFinancialEditor] = useState<FinancialEditor | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    const { data, error: loadError } = await supabase.from("opportunities")
      .select("id,stage,value,probability,expected_close_at,won_at,lost_at,commission_sla_days,commission_due_at,commission_received_at,commission_status,commission_gross,commission_percentage,commission_split_percentage,commission_net,commission_received_amount,leads(id,name),properties(title)")
      .order("created_at", { ascending: false });
    if (loadError && isMissingRelation(loadError)) {
      const legacy = await supabase.from("leads").select("*").neq("status", "arquivado").order("created_at", { ascending: false }).limit(2000);
      if (legacy.error) setError("Não foi possível carregar as oportunidades.");
      else setItems(((legacy.data ?? []) as Record<string, unknown>[]).map(mapLegacyLead).map(leadAsOpportunity).map((item) => ({
        ...item, expected_close_at: null, won_at: ["ganho", "won", "fechado"].includes(String(item.stage).toLowerCase()) ? String(item.updated_at || item.created_at) : null,
        lost_at: ["perdido", "lost"].includes(String(item.stage).toLowerCase()) ? String(item.updated_at || item.created_at) : null,
        commission_sla_days: null, commission_due_at: null, commission_received_at: null, commission_status: "not_applicable",
        commission_net: null, commission_gross: null, commission_percentage: null, commission_split_percentage: null, commission_received_amount: 0,
        leads: { id: String(item.lead_id), name: String(item.name || "Lead sem nome") }, properties: null,
      })) as Opportunity[]);
    } else {
      if (loadError) setError("Não foi possível carregar as oportunidades.");
      setItems((data ?? []) as unknown as Opportunity[]);
    }
    setReferenceTime(Date.now()); setLoading(false);
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
    if (!data.session?.access_token) { setError("Sessão expirada. Entre novamente."); return false; }
    setSavingId(id); setError("");
    try {
      const response = await fetch(`/api/v1/sales/${id}/commission`, { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(payload) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Não foi possível atualizar a comissão.");
      await load();
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao atualizar comissão.");
      return false;
    }
    finally { setSavingId(null); }
  }
  function configureCommission(item: Opportunity) {
    setFinancialEditor({
      mode: "configure",
      item,
      gross: String(item.commission_gross ?? ""),
      net: String(item.commission_net ?? ""),
      percentage: String(item.commission_percentage ?? ""),
      splitPercentage: String(item.commission_split_percentage ?? ""),
      paymentAmount: "",
      notes: "",
    });
  }
  function registerPayment(item: Opportunity) {
    setFinancialEditor({
      mode: "payment",
      item,
      gross: "",
      net: "",
      percentage: "",
      splitPercentage: "",
      paymentAmount: "",
      notes: "",
    });
  }
  async function submitFinancialEditor() {
    if (!financialEditor) return;
    const payload = financialEditor.mode === "configure"
      ? {
        action: "configure",
        gross: financialEditor.gross,
        net: financialEditor.net,
        percentage: financialEditor.percentage || null,
        splitPercentage: financialEditor.splitPercentage || null,
        notes: financialEditor.notes,
      }
      : {
        action: "payment",
        paymentAmount: financialEditor.paymentAmount,
        notes: financialEditor.notes,
      };
    const saved = await updateCommission(financialEditor.item.id, payload);
    if (saved) setFinancialEditor(null);
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
  const revenueDecisionQueue = items.map((item) => {
    const risk = opportunityRisk(item);
    const commission = commissionStatus(item);
    if (canManage && item.won_at && commission === "overdue") return { item, urgency: 7, title: "Comissão vencida", detail: "Confirmar o recebimento, a divergência ou o novo prazo com evidência." };
    if (canManage && item.won_at && commission === "due_soon") return { item, urgency: 6, title: "Comissão vence em até 7 dias", detail: "Validar documento, responsável e previsão de recebimento." };
    if (!item.won_at && !item.lost_at && risk.key === "overdue") return { item, urgency: 5, title: "Previsão de fechamento vencida", detail: "Revalidar data, valor e próxima ação antes de manter o forecast." };
    if (!item.won_at && !item.lost_at && risk.key === "at_risk") return { item, urgency: 4, title: "Prazo próximo com baixa probabilidade", detail: "Revisar objeção, compromisso futuro e critério de avanço." };
    if (!item.won_at && !item.lost_at && risk.key === "incomplete") return { item, urgency: 3, title: "Forecast sem dados mínimos", detail: "Completar valor e data esperada para uma leitura responsável." };
    return null;
  }).filter((decision): decision is { item: Opportunity; urgency: number; title: string; detail: string } => Boolean(decision)).sort((a, b) => b.urgency - a.urgency || Number(b.item.value || 0) - Number(a.item.value || 0)).slice(0, 3);

  function openRevenueCopilot(decision: { item: Opportunity; title: string; detail: string }) {
    const item = decision.item;
    const risk = opportunityRisk(item);
    window.dispatchEvent(new CustomEvent("atlas:open-copilot", { detail: {
      prompt: `Prepare uma revisão humana para uma oportunidade na etapa ${item.stage}, valor ${brl.format(Number(item.value || 0))}, probabilidade ${item.probability}%, risco ${risk.label}, fechamento ${item.expected_close_at || "não definido"} e comissão ${commissionStatus(item)}. O sinal atual é: ${decision.title}. Sugira dados a confirmar, próxima decisão e evidência necessária. Não altere o forecast, não registre pagamento e não envie mensagens.`,
      context: { module: "sales-revenue-decision", opportunityId: item.id, humanApprovalRequired: true },
    } }));
  }

  return <div className="space-y-6 pb-8" data-evolution-phase="47" data-kanban-context="111-kanban-context-intake" data-sales-layout="revenue-decision-first">
    <section className="relative overflow-hidden rounded-[28px] border border-white/[.08] bg-white/[.025] p-6 pr-32 sm:p-8 sm:pr-44">
      <Image src="/brand/atlas-robot-broker.png" alt="Robô-corretor Atlas" width={84} height={126} className="pointer-events-none absolute -bottom-8 right-5 h-auto w-20 opacity-70" />
      <PageHeader eyebrow="Revenue engine · Opportunity workspace" title="Vendas e oportunidades" description="Valor, probabilidade, prazo e risco organizados para o time saber quais negócios exigem ação agora." action={{ href: "/reports", label: "Abrir previsão", priority: "secondary" }} />
    </section>
    <KanbanHandoffBanner module="sales" />
    <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5"><AtlasMetric label="VGV total" value={brl.format(metrics.total)} detail="Base total visível" trend="VGV" tone="blue"/><AtlasMetric label="Forecast ponderado" value={brl.format(metrics.weighted)} detail="Valor × probabilidade" trend="PREVISÃO" tone="violet"/><AtlasMetric label="Vendas ganhas" value={brl.format(metrics.won)} detail="Receita comercial confirmada" trend="GANHO" tone="green"/><AtlasMetric label="Oportunidades abertas" value={metrics.open} detail="Negócios em andamento" trend="PIPE" tone="blue"/><AtlasMetric label="Exigem atenção" value={attentionCount} detail="Prazo, valor ou previsão" trend="AGIR" tone={attentionCount ? "rose" : "green"}/></section>
    {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} /> : null}
    <section data-phase="47-revenue-decision-queue">
      <AtlasCard>
        <AtlasCardHeader eyebrow="Fase 47 · Decisões de receita" title="O que precisa de confirmação para avançar" description="Até três sinais verificáveis de fechamento ou recebimento. O forecast orienta a revisão, mas não promete venda nem receita." action={<AtlasBadge tone="violet">APROVAÇÃO HUMANA</AtlasBadge>}/>
        <div className="grid gap-3 p-5 sm:p-6 lg:grid-cols-3">
          {revenueDecisionQueue.map((decision) => <article key={`${decision.item.id}-${decision.title}`} className="rounded-2xl border border-violet-300/15 bg-violet-300/[.04] p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="text-sm font-semibold text-white">{decision.title}</h2><p className="mt-1 text-xs text-slate-500">{decision.item.leads?.name || "Oportunidade"} · {decision.item.stage}</p></div><AtlasBadge tone={decision.urgency >= 6 ? "danger" : "warning"}>{decision.urgency >= 6 ? "URGENTE" : "REVISAR"}</AtlasBadge></div><p className="mt-3 text-xs leading-5 text-slate-400">{decision.detail}</p><div className="mt-4 flex flex-wrap gap-2"><button type="button" onClick={() => openRevenueCopilot(decision)} className="atlas-button-secondary">Preparar decisão com IA</button>{decision.item.leads?.id ? <Link href={`/leads/${decision.item.leads.id}`} className="atlas-button-secondary">Abrir negócio</Link> : null}</div></article>)}
          {!loading && !revenueDecisionQueue.length ? <div className="lg:col-span-3"><AtlasEmpty reason="completed" eyebrow="Receita sob controle" title="Nenhuma confirmação crítica neste recorte" description="Continue revisando valor, probabilidade, prazo e comissão com evidência humana." /></div> : null}
          {loading ? [1,2,3].map((item) => <AtlasSkeleton key={item} className="h-44"/>) : null}
        </div>
        <div className="border-t border-white/[.06] px-5 py-3 text-[10px] text-slate-500">IA prepara a revisão · decisão e registro permanecem humanos · previsão não é garantia de fechamento.</div>
      </AtlasCard>
    </section>
    <AtlasCard><AtlasCardHeader eyebrow="Pipeline de receita" title="Fila de oportunidades" description="Os negócios de maior risco aparecem primeiro. A previsão orienta, mas não garante fechamento." action={<AtlasBadge tone="violet">REVISÃO HUMANA</AtlasBadge>}/>
      <div className="grid gap-3 border-t border-white/[.06] p-4 sm:grid-cols-[1fr_auto] sm:p-5"><input value={query} onChange={(event) => setQuery(event.target.value)} className="w-full px-4" placeholder="Buscar lead, imóvel ou etapa"/><div className="flex gap-2 overflow-x-auto">{([['all','Todas'],['attention',`Atenção ${attentionCount}`],['closing','Fecha em 30d'],['won','Ganhas']] as const).map(([key,label]) => <button key={key} onClick={() => setView(key)} className={`atlas-kanban-toggle shrink-0 ${view === key ? "is-active" : ""}`}>{label}</button>)}</div></div>
      {loading ? <div className="grid gap-3 p-5">{[1,2,3].map((item) => <AtlasSkeleton key={item} className="h-20"/>)}</div> : visible.length ? <div className="overflow-x-auto"><table className="min-w-[1040px] text-sm"><thead><tr><th>Lead</th><th>Imóvel</th><th>Etapa</th><th>Valor</th><th>Forecast</th><th>Fechamento</th><th>Risco</th>{canManage ? <><th>SLA comissão</th><th>Ações</th></> : null}</tr></thead><tbody>{visible.map((item) => {
        const risk = opportunityRisk(item); const status = commissionStatus(item); const commissionTone = status === "received" ? "success" : ["overdue", "divergent"].includes(status) ? "danger" : "warning";
        return <tr key={item.id}><td>{item.leads?.id ? <Link className="font-semibold text-white hover:text-cyan-200" href={`/leads/${item.leads.id}`}>{item.leads.name || "Lead sem nome"} →</Link> : "Sem lead"}</td><td className="text-slate-400">{item.properties?.title || "Sem imóvel"}</td><td><AtlasBadge tone="info">{item.stage}</AtlasBadge></td><td className="font-semibold text-white">{brl.format(Number(item.value || 0))}</td><td><strong className="text-violet-200">{brl.format(Number(item.value || 0) * item.probability / 100)}</strong><span className="mt-1 block text-[10px] text-slate-600">{item.probability}%</span></td><td className="text-slate-400">{item.expected_close_at ? new Date(item.expected_close_at).toLocaleDateString("pt-BR") : "Definir data"}</td><td><AtlasBadge tone={risk.tone}>{risk.label}</AtlasBadge></td>{canManage ? <><td>{item.won_at ? <div><AtlasBadge tone={commissionTone}>{status.replaceAll("_", " ").toUpperCase()}</AtlasBadge><p className="mt-2 text-[10px] text-slate-500">{item.commission_sla_days ?? 30} dias{item.commission_net ? ` · ${brl.format(item.commission_received_amount || 0)} de ${brl.format(item.commission_net)}` : ""}</p></div> : <span className="text-slate-600">Após a venda</span>}</td><td>{item.won_at ? <div className="flex min-w-36 flex-col gap-2"><button disabled={savingId === item.id} onClick={() => configureCommission(item)} className="atlas-button-secondary">Configurar</button><button disabled={savingId === item.id || !item.commission_net} onClick={() => registerPayment(item)} className="atlas-button-primary">Recebimento</button></div> : item.leads?.id ? <Link className="atlas-button-secondary" href={`/leads/${item.leads.id}`}>Abrir negócio</Link> : null}</td></> : null}</tr>;
      })}</tbody></table></div> : <div className="p-5"><AtlasEmpty reason={items.length ? "no-results" : "first-use"} eyebrow={items.length ? "Fila filtrada" : "Pipeline de receita ainda vazio"} title={items.length ? "Nenhuma oportunidade neste filtro" : "Nenhuma oportunidade registrada"} description={items.length ? "Limpe a busca ou altere o filtro para ampliar a fila." : "As oportunidades aparecerão quando uma lead avançar para um negócio comercial."} action={items.length ? <button type="button" className="atlas-button-secondary" onClick={() => { setQuery(""); setView("all"); }}>Limpar filtros</button> : <Link href="/pipeline" className="atlas-button-primary">Abrir pipeline</Link>}/></div>}
    </AtlasCard>
    {financialEditor ? <div className="fixed inset-0 z-[120] grid place-items-center bg-black/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="financial-editor-title">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Fechar edição financeira" onClick={() => setFinancialEditor(null)} />
      <section className="relative w-full max-w-2xl rounded-[28px] border border-white/10 bg-[#090d17] p-6 shadow-2xl sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="atlas-eyebrow">Registro financeiro auditado</p>
            <h2 id="financial-editor-title" className="mt-2 text-2xl font-bold text-white">{financialEditor.mode === "configure" ? "Configurar comissão" : "Registrar recebimento"}</h2>
            <p className="mt-2 text-sm text-slate-400">{financialEditor.item.leads?.name || "Venda ganha"} · toda alteração preserva o valor anterior no histórico.</p>
          </div>
          <button type="button" className="atlas-icon-button" aria-label="Fechar" onClick={() => setFinancialEditor(null)}>×</button>
        </div>
        {financialEditor.mode === "configure" ? <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-400">Comissão bruta (R$)<input autoFocus inputMode="decimal" value={financialEditor.gross} onChange={(event) => setFinancialEditor({ ...financialEditor, gross: event.target.value })} className="mt-2 w-full" placeholder="0,00" /></label>
          <label className="text-xs font-semibold text-slate-400">Comissão líquida prevista (R$)<input inputMode="decimal" value={financialEditor.net} onChange={(event) => setFinancialEditor({ ...financialEditor, net: event.target.value })} className="mt-2 w-full" placeholder="0,00" /></label>
          <label className="text-xs font-semibold text-slate-400">Percentual da comissão (%)<input inputMode="decimal" value={financialEditor.percentage} onChange={(event) => setFinancialEditor({ ...financialEditor, percentage: event.target.value })} className="mt-2 w-full" placeholder="Opcional" /></label>
          <label className="text-xs font-semibold text-slate-400">Percentual do corretor/time (%)<input inputMode="decimal" value={financialEditor.splitPercentage} onChange={(event) => setFinancialEditor({ ...financialEditor, splitPercentage: event.target.value })} className="mt-2 w-full" placeholder="Opcional" /></label>
        </div> : <div className="mt-6">
          <label className="text-xs font-semibold text-slate-400">Valor recebido agora (R$)<input autoFocus inputMode="decimal" value={financialEditor.paymentAmount} onChange={(event) => setFinancialEditor({ ...financialEditor, paymentAmount: event.target.value })} className="mt-2 w-full" placeholder="0,00" /></label>
          <p className="mt-3 text-xs text-slate-500">Recebido até agora: {brl.format(financialEditor.item.commission_received_amount || 0)}{financialEditor.item.commission_net ? ` de ${brl.format(financialEditor.item.commission_net)}` : ""}.</p>
        </div>}
        <label className="mt-4 block text-xs font-semibold text-slate-400">Evidência ou observação<textarea value={financialEditor.notes} onChange={(event) => setFinancialEditor({ ...financialEditor, notes: event.target.value })} className="mt-2 min-h-24 w-full resize-y" maxLength={2000} placeholder="Identifique documento, parcela ou responsável pela confirmação." /></label>
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" className="atlas-button-secondary" onClick={() => setFinancialEditor(null)}>Cancelar</button>
          <button type="button" className="atlas-button-primary" disabled={savingId === financialEditor.item.id || (financialEditor.mode === "configure" ? !financialEditor.gross || !financialEditor.net : !financialEditor.paymentAmount)} onClick={() => void submitFinancialEditor()}>{savingId === financialEditor.item.id ? "Registrando..." : financialEditor.mode === "configure" ? "Confirmar configuração" : "Confirmar recebimento"}</button>
        </div>
      </section>
    </div> : null}
  </div>;
}
