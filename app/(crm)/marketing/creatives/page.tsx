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
                <div className="cc6-hairline mt-4 flex flex-wrap gap-x-10 gap-y-3 pt-4">
                  {[
                    ["Leads CRM", String(Number(c.performance.crmLeads || 0))],
                    ["CPL", c.performance.cpl == null ? "—" : brl(c.performance.cpl)],
                    ["Confiança", String(c.performance.confidence || "low")],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <p className="cc6-metric-value text-xl leading-none">{value}</p>
                      <p className="cc6-metric-label mt-1">{label}</p>
                    </div>
                  ))}
                </div>
                <p className="cc6-num mt-3 text-[11px] leading-5 text-[#6b7890]">
                  Leitura: {String(c.performance.interpretation)} · fadiga: {String(c.performance.fatigueRisk)}
                </p>
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
