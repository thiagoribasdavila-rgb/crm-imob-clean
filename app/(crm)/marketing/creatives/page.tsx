"use client";
import { FormEvent, useCallback, useEffect, useState, type CSSProperties } from "react";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";

type Development = { id: string; name: string };
type Creative = { id: string; review_status: string; funnel_stage: string; persona_moment: string; message_angle: string; format: string; primary_promise: string; objection_addressed: string; hook: string; creative_asset: { name: string }; performance: Record<string, number | string | boolean | null> };
type Payload = { creatives: Creative[]; developments: Development[] };
const brl = (v: unknown) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(v || 0));

/*
 * CC-6 · Inteligência de criativos — consolidação do redesign: cards brancos
 * dentro do shell escuro, <main> aninhado no <main> do AppShell e um hero
 * gradiente com três chips coloridos fora da identidade. Agora o brief e a
 * biblioteca são painéis da identidade, cada versão tem um único estado
 * semântico (badge + banda) e a garantia "sem publicação automática" virou
 * faixa "Seguro por padrão". Formulário, criação, revisão e métricas por
 * resultado do CRM preservados.
 */

const FIELD_CLASS =
  "w-full rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] px-3 py-2.5 text-sm text-[#e8eef8] outline-none transition-colors focus:border-[color:var(--atlas-accent)] disabled:opacity-50";

const REVIEW_META: Record<string, { tone: "warning" | "success" | "danger" | "neutral"; label: string; sev: string | null }> = {
  draft: { tone: "warning", label: "Rascunho", sev: "#f5b544" },
  approved: { tone: "success", label: "Aprovado", sev: "#34d399" },
  rejected: { tone: "danger", label: "Rejeitado", sev: "#fb7185" },
};

const CONFIDENCE_LABEL: Record<string, string> = { high: "alta", medium: "média", low: "baixa" };
const INTERPRETATION_LABEL: Record<string, string> = {
  association_for_controlled_test: "associação — hipótese para teste controlado, não causa",
  insufficient_sample: "amostra insuficiente (menos de 30 leads) — sem leitura",
};

const readingOf = (p: Creative["performance"]) =>
  INTERPRETATION_LABEL[String(p.interpretation)] ?? String(p.interpretation);

const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

/*
 * O motor calcula o funil inteiro por versão e a tela mostrava só percentuais —
 * que somem sob amostra pequena. Resultado: uma peça com 2 vendas e 12 leads
 * aparecia igual a uma peça que nunca vendeu. A CONTAGEM é fato observado e
 * aparece sempre; o PERCENTUAL só com amostra (30+ leads) e numerador lançado,
 * porque taxa sobre 12 leads é ruído, não leitura.
 *
 * Zero só é exibido quando existe fato lançado para a versão: a API exige as 11
 * métricas em cada linha de creative_performance_daily_facts, então com fato
 * lançado o zero foi apurado. Sem nenhum fato, nada é zero — é AUSENTE, e a
 * tela diz isso com palavra, não com "0".
 *
 * A presença de fato é lida da CONTAGEM DE LINHAS (performance.daysMeasured),
 * não de "alguma métrica > 0". A heurística antiga invertia o erro de
 * honestidade: uma versão com dias lançados e as 11 métricas zeradas — peça
 * aprovada que rodou e não entregou nada — caía no ramo "nenhum número foi
 * apurado", afirmando ausência de medição sobre um zero que a diretoria mediu.
 */
const hasFacts = (p: Creative["performance"]) => num(p.daysMeasured) > 0;

/** Todos os totais em zero COM dias lançados: resultado medido, não ausência. */
const measuredAllZero = (p: Creative["performance"]) =>
  hasFacts(p)
  && [p.spend, p.impressions, p.clicks, p.crmLeads, p.qualifiedLeads, p.visits, p.proposals, p.wins].every(
    (value) => num(value) <= 0,
  );

function funnelOf(p: Creative["performance"]): Array<{ label: string; count: number; rate: string; sold: boolean }> {
  const sample = Boolean(p.sampleSufficient);
  const rate = (value: unknown, numerator: unknown) =>
    !sample || num(numerator) <= 0 ? "" : `${(Math.round(num(value) * 10) / 10).toFixed(1)}%`;
  return [
    { label: "Leads CRM", count: num(p.crmLeads), rate: "", sold: false },
    { label: "Qualificados", count: num(p.qualifiedLeads), rate: rate(p.qualificationRate, p.qualifiedLeads), sold: false },
    { label: "Visitas", count: num(p.visits), rate: rate(p.visitRate, p.visits), sold: false },
    { label: "Propostas", count: num(p.proposals), rate: rate(p.proposalRate, p.proposals), sold: false },
    { label: "Vendas", count: num(p.wins), rate: rate(p.winRate, p.wins), sold: num(p.wins) > 0 },
  ];
}

function costsOf(p: Creative["performance"]): Array<{ label: string; value: string }> {
  const sample = Boolean(p.sampleSufficient);
  return [
    // CPL sob o MESMO gate do CPQL: uma versão com 1 lead e R$ 500 de gasto
    // estampava "CPL R$ 500,00" com cara de medido, ao lado de uma nota de
    // rodapé que prometia gate de 30 leads. CPL é justamente o número que o
    // diretor usa para comparar peças.
    { label: "CPL", value: !sample || num(p.crmLeads) <= 0 || p.cpl == null ? "—" : brl(p.cpl) },
    { label: "CPQL", value: !sample || num(p.qualifiedLeads) <= 0 || p.cpql == null ? "—" : brl(p.cpql) },
    { label: "Confiança", value: CONFIDENCE_LABEL[String(p.confidence)] ?? "baixa" },
  ];
}

export default function CreativesPage() {
  const [data, setData] = useState<Payload | null>(null), [busy, setBusy] = useState(false), [notice, setNotice] = useState("");
  const [form, setForm] = useState({ developmentId: "", name: "", funnelStage: "discovery", personaMoment: "unspecified", messageAngle: "location", format: "short_video", primaryPromise: "", objectionAddressed: "", hook: "", callToAction: "Conheça o projeto" });
  const load = useCallback(async () => { const r = await fetch("/api/v1/marketing/creatives", { cache: "no-store" }), j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || "Indisponível"); setData(j.data); setForm(f => ({ ...f, developmentId: f.developmentId || j.data.developments?.[0]?.id || "" })); }, []);
  useEffect(() => { load().catch(e => setNotice(e.message)); }, [load]);
  async function act(body: Record<string, unknown>) { setBusy(true); setNotice(""); try { const r = await fetch("/api/v1/marketing/creatives", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || "Ação recusada"); setNotice("Decisão registrada; nenhuma peça foi publicada ou substituída automaticamente."); await load(); } catch (e) { setNotice(e instanceof Error ? e.message : "Falha"); } finally { setBusy(false); } }
  async function submit(e: FormEvent) { e.preventDefault(); await act({ action: "create", ...form }); }

  return (
    <div data-phase="94-real-estate-creative-intelligence" className="space-y-4 pb-10">
      <PageHeader
        eyebrow="Marketing · Projeto · Mensagem · Formato"
        title="Inteligência de criativos"
        description="Biblioteca versionada por projeto, orientada ao funil e medida pelo resultado confirmado no CRM."
        action={{ href: "/marketing/campaigns", label: "Central de campanhas", priority: "secondary" }}
      />

      <section
        aria-label="Garantias do módulo"
        className="cc6-panel-quiet cc6-reveal flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3"
      >
        <StatusBadge tone="success">Seguro por padrão</StatusBadge>
        <p className="text-sm leading-6 text-[#aab6ca]">
          Nenhuma peça é publicada ou substituída automaticamente.
        </p>
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          <span className="cc6-chip">Projeto obrigatório</span>
          <span className="cc6-chip">30 leads para comparar</span>
        </div>
      </section>

      {notice ? (
        <p role="status" className="cc6-panel-quiet cc6-reveal px-4 py-3 text-sm text-[#aab6ca]">
          {notice}
        </p>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-[380px_1fr]" aria-label="Brief e biblioteca de criativos">
        <form onSubmit={submit} className="cc6-panel cc6-reveal h-fit space-y-3 p-5" style={{ animationDelay: "80ms" }}>
          <div>
            <p className="cc6-eyebrow">Novo brief</p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Brief imobiliário</h2>
          </div>
          <select required aria-label="Projeto" value={form.developmentId} onChange={e => setForm({ ...form, developmentId: e.target.value })} className={FIELD_CLASS}>
            <option value="">Selecione o projeto</option>
            {data?.developments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <input required aria-label="Nome da peça" placeholder="Nome da peça" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className={FIELD_CLASS} />
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="Etapa do funil" value={form.funnelStage} onChange={e => setForm({ ...form, funnelStage: e.target.value })} className={FIELD_CLASS}>
              <option value="discovery">Descoberta</option>
              <option value="consideration">Consideração</option>
              <option value="qualification">Qualificação</option>
              <option value="visit">Visita</option>
              <option value="proposal">Proposta</option>
              <option value="conversion">Conversão</option>
              <option value="reactivation">Reativação</option>
            </select>
            <select aria-label="Momento do comprador" value={form.personaMoment} onChange={e => setForm({ ...form, personaMoment: e.target.value })} className={FIELD_CLASS}>
              <option value="unspecified">Momento não definido</option>
              <option value="first_home">Primeiro imóvel</option>
              <option value="upgrade">Upgrade</option>
              <option value="investor">Investidor</option>
              <option value="relocation">Mudança</option>
              <option value="downsizing">Imóvel menor</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="Ângulo da mensagem" value={form.messageAngle} onChange={e => setForm({ ...form, messageAngle: e.target.value })} className={FIELD_CLASS}>
              <option value="location">Localização</option>
              <option value="lifestyle">Estilo de vida</option>
              <option value="investment">Investimento</option>
              <option value="affordability">Condição</option>
              <option value="scarcity">Escassez</option>
              <option value="architecture">Arquitetura</option>
              <option value="amenities">Lazer</option>
              <option value="trust">Confiança</option>
            </select>
            <select aria-label="Formato" value={form.format} onChange={e => setForm({ ...form, format: e.target.value })} className={FIELD_CLASS}>
              <option value="short_video">Vídeo curto</option>
              <option value="static">Estático</option>
              <option value="carousel">Carrossel</option>
              <option value="long_video">Vídeo longo</option>
              <option value="stories">Stories</option>
              <option value="reels">Reels</option>
              <option value="display">Display</option>
              <option value="portal_listing">Portal</option>
            </select>
          </div>
          <input required minLength={5} aria-label="Gancho inicial" placeholder="Gancho inicial" value={form.hook} onChange={e => setForm({ ...form, hook: e.target.value })} className={FIELD_CLASS} />
          <textarea required minLength={10} aria-label="Promessa principal comprovável" placeholder="Promessa principal comprovável" value={form.primaryPromise} onChange={e => setForm({ ...form, primaryPromise: e.target.value })} className={`min-h-20 ${FIELD_CLASS}`} />
          <textarea required minLength={5} aria-label="Objeção que a peça responde" placeholder="Objeção que a peça responde" value={form.objectionAddressed} onChange={e => setForm({ ...form, objectionAddressed: e.target.value })} className={`min-h-20 ${FIELD_CLASS}`} />
          <button disabled={busy || !form.developmentId} className="atlas-button-primary w-full disabled:opacity-40">
            Criar versão para aprovação
          </button>
        </form>

        <div className="space-y-3">
          {data?.creatives.map(c => {
            const meta = REVIEW_META[c.review_status] ?? { tone: "neutral" as const, label: c.review_status, sev: null };
            return (
              <article
                key={c.id}
                className={`cc6-panel-quiet cc6-reveal p-5 ${meta.sev ? "cc6-sev-band" : ""}`}
                style={meta.sev ? ({ "--cc6-sev": meta.sev } as CSSProperties) : undefined}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
                      <span className="cc6-chip">{c.format}</span>
                    </div>
                    <h3 className="mt-2 text-base font-semibold tracking-tight text-[#e8eef8]">
                      {c.creative_asset?.name || "Criativo"}
                    </h3>
                    <p className="mt-1 text-sm leading-6 text-[#aab6ca]">{c.hook}</p>
                    <p className="cc6-num mt-1 text-[11px] text-[#6b7890]">
                      {c.funnel_stage} · {c.persona_moment} · {c.message_angle}
                    </p>
                  </div>
                  {c.review_status === "draft" ? (
                    <div className="flex shrink-0 gap-2">
                      <button
                        disabled={busy}
                        onClick={() => act({ action: "review", versionId: c.id, decision: "approved", reason: "Brief e promessa revisados e aprovados pela diretoria." })}
                        className="atlas-button-primary px-4 py-2 text-xs disabled:opacity-40"
                      >
                        Aprovar
                      </button>
                      <button
                        disabled={busy}
                        onClick={() => act({ action: "review", versionId: c.id, decision: "rejected", reason: "Brief rejeitado por inadequação de mensagem ou evidência." })}
                        className="cc6-ghost-btn disabled:opacity-40"
                      >
                        Rejeitar
                      </button>
                    </div>
                  ) : null}
                </div>
                {hasFacts(c.performance) ? (
                  <>
                    {/* Funil por versão: lead → qualificado → visita → proposta → VENDA.
                        A contagem é o fato; o percentual entra sob a mesma linha só
                        quando a amostra sustenta. "Qual criativo virou venda" para de
                        depender de amostra: 2 vendas em 12 leads é fato, não é taxa. */}
                    <div className="cc6-hairline mt-4 flex flex-wrap gap-x-10 gap-y-3 pt-4">
                      {funnelOf(c.performance).map(({ label, count, rate, sold }) => (
                        <div key={label}>
                          <p className={`cc6-metric-value text-xl leading-none ${sold ? "cc6-ok" : ""}`}>
                            {count}
                            {rate ? <span className="ml-1.5 text-[11px] font-normal text-[#6b7890]">{rate}</span> : null}
                          </p>
                          <p className="cc6-metric-label mt-1">{label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-x-10 gap-y-3">
                      {costsOf(c.performance).map(({ label, value }) => (
                        <div key={label}>
                          <p className="cc6-metric-value text-base leading-none">{value}</p>
                          <p className="cc6-metric-label mt-1">{label}</p>
                        </div>
                      ))}
                    </div>
                    <p className="cc6-num mt-3 text-[11px] leading-5 text-[#6b7890]">
                      Leitura: {readingOf(c.performance)} · fadiga: {String(c.performance.fatigueRisk)}
                    </p>
                    {measuredAllZero(c.performance) ? (
                      <p className="mt-1 text-[11px] leading-5 text-[#f5b544]">
                        {num(c.performance.daysMeasured)} dia(s) de fato lançado, todos zerados — resultado medido,
                        não ausência de medição.
                      </p>
                    ) : null}
                    <p className="mt-1 text-[11px] leading-5 text-[#6b7890]">
                      Desempenho informado manualmente pela diretoria (não reconciliado com o CRM). Contagem é fato
                      lançado; taxas e custos só aparecem com 30+ leads na versão, e “—” significa métrica sem
                      lastro, nunca 0%.
                    </p>
                  </>
                ) : (
                  <p className="cc6-hairline mt-4 pt-4 text-[12px] leading-5 text-[#6b7890]">
                    Sem desempenho lançado para esta versão — nenhum número foi apurado. Isso é ausência de medição,
                    não resultado zero: enquanto a diretoria não lançar os fatos diários, esta peça não entra em
                    comparação nenhuma.
                  </p>
                )}
              </article>
            );
          })}
          {!data?.creatives.length ? (
            <div className="cc6-panel-quiet cc6-reveal p-8 text-center text-sm text-[#6b7890]" style={{ animationDelay: "120ms" }}>
              Crie o primeiro brief associado a um projeto.
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
