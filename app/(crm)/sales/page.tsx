"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { AtlasRecoverableError, AtlasSkeleton } from "@/components/ui/AtlasUI";
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
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/* CC-6: tinta semântica por significado — vencido/urgente em rose, revisão em
   amber. Rótulos de comissão em pt-BR no lugar do enum técnico. */
const SEV_INK = { crit: "#fb7185", warn: "#f5b544" } as const;
const COMMISSION_LABEL: Record<string, string> = {
  received: "Recebida",
  partial: "Parcial",
  divergent: "Divergente",
  overdue: "Vencida",
  due_soon: "Vence em 7d",
  pending: "Pendente",
  not_applicable: "—",
};
const TH_CLASS = "px-4 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[#6b7890]";
const VIEW_OPTIONS: Array<[View, string]> = [["all", "Todas"], ["attention", "Atenção"], ["closing", "Fecha em 30d"], ["won", "Ganhas"]];

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

  const decisive = [
    { label: "VGV total", value: brl.format(metrics.total), ink: "" },
    { label: "forecast ponderado", value: brl.format(metrics.weighted), ink: "" },
    { label: "vendas ganhas", value: brl.format(metrics.won), ink: metrics.won ? "cc6-ok" : "" },
    { label: "abertas", value: String(metrics.open), ink: "" },
    { label: "exigem atenção", value: String(attentionCount), ink: attentionCount ? "cc6-crit" : "cc6-ok" },
  ];

  return (
    <div className="space-y-4 pb-8" data-evolution-phase="47" data-sales-layout="revenue-decision-first">
      <PageHeader
        eyebrow="Revenue engine · Oportunidades"
        title="Vendas e oportunidades"
        description="Os negócios de maior risco aparecem primeiro — a previsão orienta a revisão, não garante fechamento."
        action={{ href: "/atlas-v3/forecast", label: "Abrir forecast", priority: "secondary" }}
      />

      {/* Números decisivos antes de qualquer lista: base, previsão, ganho e
          pressão de atenção na mesma régua mono. */}
      <section aria-label="Números decisivos da receita">
        <TiltShell className="cc6-panel cc6-reveal p-5 sm:p-6" delayMs={0}>
          <div className="flex flex-wrap gap-x-10 gap-y-4" aria-busy={loading}>
            {decisive.map((metric) => (
              <div key={metric.label}>
                <p className={`cc6-metric-value text-2xl leading-none sm:text-3xl ${loading ? "" : metric.ink}`}>
                  {loading ? "—" : metric.value}
                </p>
                <p className="cc6-metric-label mt-1.5">{metric.label}</p>
              </div>
            ))}
          </div>
        </TiltShell>
      </section>

      {error ? <AtlasRecoverableError description={error} onRetry={() => void load()} busy={loading} /> : null}

      <section data-phase="47-revenue-decision-queue">
        <div className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "60ms" }}>
          <header className="px-5 pt-5 pb-3">
            <p className="cc6-eyebrow">Fase 47 · Decisões de receita</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">O que precisa de confirmação para avançar</h2>
          </header>
          <div aria-busy={loading}>
            {loading ? (
              <div className="cc6-hairline space-y-2 p-5">
                {[1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-16" />)}
              </div>
            ) : revenueDecisionQueue.length ? (
              revenueDecisionQueue.map((decision, index) => {
                const crit = decision.urgency >= 6;
                return (
                  <article
                    key={`${decision.item.id}-${decision.title}`}
                    className="cc6-reveal cc6-hairline cc6-sev-band flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5"
                    style={{ animationDelay: `${100 + index * 60}ms`, "--cc6-sev": crit ? SEV_INK.crit : SEV_INK.warn } as CSSProperties}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-medium text-[#e8eef8]">{decision.title}</h3>
                        <StatusBadge tone={crit ? "danger" : "warning"}>{crit ? "Urgente" : "Revisar"}</StatusBadge>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-[#6b7890]">
                        {decision.item.leads?.name || "Oportunidade"} · {decision.item.stage} · {decision.detail}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => openRevenueCopilot(decision)} className="cc6-ghost-btn">✦ Preparar com IA</button>
                      {decision.item.leads?.id ? (
                        <Link href={`/leads/${decision.item.leads.id}`} className="cc6-ghost-btn">Abrir negócio</Link>
                      ) : null}
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="cc6-hairline px-5 py-5 text-sm leading-6 text-[#6b7890]">
                Nenhuma confirmação crítica neste recorte — valor, probabilidade, prazo e comissão seguem com evidência humana.
              </p>
            )}
          </div>
          <p className="cc6-hairline px-5 py-2.5 text-[10px] leading-4 text-[#6b7890]">
            Até três sinais verificáveis · a IA prepara a revisão, decisão e registro permanecem humanos.
          </p>
        </div>
      </section>

      <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "120ms" }} aria-labelledby="sales-queue-title">
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
          <div>
            <p className="cc6-eyebrow">Pipeline de receita</p>
            <h2 id="sales-queue-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Fila de oportunidades</h2>
          </div>
          {!loading ? <span className="cc6-chip">{visible.length} visíveis</span> : null}
        </header>
        <div className="mt-4 flex flex-wrap items-center gap-2 px-5 pb-4">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="min-w-56 flex-1 rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] px-3.5 py-2.5 text-sm text-[#e8eef8] outline-none transition-colors placeholder:text-[#6b7890] focus:border-[color:var(--atlas-accent)]"
            placeholder="Buscar lead, imóvel ou etapa"
            aria-label="Buscar oportunidades"
          />
          <div className="flex gap-1.5 overflow-x-auto" role="group" aria-label="Filtrar oportunidades">
            {VIEW_OPTIONS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={view === key}
                className={`cc6-chip shrink-0 cursor-pointer transition-colors ${
                  view === key
                    ? "border-[color:var(--atlas-accent)]! text-[#e8eef8]!"
                    : "hover:border-[rgba(148,163,184,0.35)]! hover:text-[#e8eef8]!"
                }`}
              >
                {label}
                {key === "attention" ? (
                  <strong className={`font-semibold ${attentionCount ? "cc6-crit" : ""}`}>{attentionCount}</strong>
                ) : null}
              </button>
            ))}
          </div>
        </div>
        {loading ? (
          <div className="cc6-hairline space-y-2 p-5">
            {[1, 2, 3].map((item) => <AtlasSkeleton key={item} className="h-14" />)}
          </div>
        ) : visible.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px] text-sm">
              <thead>
                <tr className="border-b border-b-[rgba(148,163,184,0.12)]">
                  <th className={TH_CLASS}>Lead</th>
                  <th className={TH_CLASS}>Imóvel</th>
                  <th className={TH_CLASS}>Etapa</th>
                  <th className={TH_CLASS}>Valor</th>
                  <th className={TH_CLASS}>Forecast</th>
                  <th className={TH_CLASS}>Fechamento</th>
                  <th className={TH_CLASS}>Risco</th>
                  {canManage ? <><th className={TH_CLASS}>SLA comissão</th><th className={TH_CLASS}>Ações</th></> : null}
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => {
                  const risk = opportunityRisk(item); const status = commissionStatus(item); const commissionTone = status === "received" ? "success" : ["overdue", "divergent"].includes(status) ? "danger" : "warning";
                  return (
                    <tr key={item.id} className="border-t border-t-[rgba(148,163,184,0.08)] align-top transition-colors hover:bg-[rgba(75,141,248,0.04)]">
                      <td className="px-4 py-3">
                        {item.leads?.id ? (
                          <Link className="font-medium text-[#e8eef8] transition-colors hover:text-[color:var(--atlas-accent-hover)]" href={`/leads/${item.leads.id}`}>
                            {item.leads.name || "Lead sem nome"}
                          </Link>
                        ) : (
                          <span className="text-[#6b7890]">Sem lead</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#aab6ca]">{item.properties?.title || "—"}</td>
                      <td className="px-4 py-3 text-[#aab6ca]">{item.stage}</td>
                      <td className="cc6-num px-4 py-3 font-medium text-[#e8eef8]">{item.value == null ? "—" : brl.format(Number(item.value))}</td>
                      <td className="px-4 py-3">
                        <span className="cc6-num block text-[#e8eef8]">{item.value == null ? "—" : brl.format(Number(item.value) * item.probability / 100)}</span>
                        <span className="cc6-num mt-0.5 block text-[10px] text-[#6b7890]">{item.probability}%</span>
                      </td>
                      <td className="cc6-num px-4 py-3 text-[#aab6ca]">
                        {item.expected_close_at ? new Date(item.expected_close_at).toLocaleDateString("pt-BR") : <span className="cc6-warn">Definir data</span>}
                      </td>
                      <td className="px-4 py-3"><StatusBadge tone={risk.tone}>{risk.label}</StatusBadge></td>
                      {canManage ? (
                        <>
                          <td className="px-4 py-3">
                            {item.won_at ? (
                              <div>
                                <StatusBadge tone={commissionTone}>{COMMISSION_LABEL[status] ?? status}</StatusBadge>
                                <p className="cc6-num mt-1.5 text-[10px] text-[#6b7890]">
                                  {item.commission_sla_days ?? 30} dias{item.commission_net ? ` · ${brl.format(item.commission_received_amount || 0)} de ${brl.format(item.commission_net)}` : ""}
                                </p>
                              </div>
                            ) : (
                              <span className="text-xs text-[#6b7890]">Após a venda</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {item.won_at ? (
                              <div className="flex min-w-36 flex-col gap-2">
                                <button disabled={savingId === item.id} onClick={() => configureCommission(item)} className="cc6-ghost-btn justify-center disabled:opacity-50">Configurar</button>
                                <button disabled={savingId === item.id || !item.commission_net} onClick={() => registerPayment(item)} className="atlas-button-primary disabled:opacity-50">Recebimento</button>
                              </div>
                            ) : item.leads?.id ? (
                              <Link className="cc6-ghost-btn" href={`/leads/${item.leads.id}`}>Abrir negócio</Link>
                            ) : null}
                          </td>
                        </>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="cc6-hairline px-5 py-6 text-sm leading-6 text-[#6b7890]">
            {items.length ? (
              <>
                Nenhuma oportunidade neste filtro.{" "}
                <button type="button" className="cursor-pointer font-medium text-[color:var(--atlas-accent)] hover:underline" onClick={() => { setQuery(""); setView("all"); }}>
                  Limpar filtros
                </button>
              </>
            ) : (
              <>
                Nenhuma oportunidade registrada — elas nascem quando uma lead avança para um negócio comercial.{" "}
                <Link href="/pipeline" className="font-medium text-[color:var(--atlas-accent)] hover:underline">
                  Abrir pipeline
                </Link>
              </>
            )}
          </p>
        )}
      </section>
    </div>
  );
}
