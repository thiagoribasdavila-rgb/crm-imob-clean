"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

/*
 * CC-6 · Laboratório de mídia — mesma API e mesmas transições (zero fetch
 * novo; nenhuma campanha é alterada automaticamente). Consolidações:
 * - a governança era declarada 3× no header (eyebrow "HIPÓTESE · CONTROLE ·
 *   TESTE · EVIDÊNCIA", descrição e 3 chips) — virou uma linha + um badge;
 *   o controle obrigatório continua garantido pelo próprio formulário;
 * - "plataforma · status" em texto cru duplicava o sinal dos botões de
 *   transição — virou badge de status + chip de plataforma;
 * - valores crus (audience, qualified_lead_rate…) na linha meta do card
 *   ganharam os mesmos rótulos pt-BR que o formulário já usava;
 * - números decisivos (aguardando decisão, prontos para iniciar, em campo,
 *   ciclos aprovados) subiram para o topo em metric mono;
 * - o vazio de experimentos não aparece mais durante o carregamento inicial.
 */

type Cycle = { id: string; readiness_score: number; created_at: string };
type Experiment = {
  id: string;
  name: string;
  hypothesis: string;
  platform: string;
  single_variable: string;
  primary_metric: string;
  guardrail_metric: string;
  budget_cap: number;
  daily_budget_cap: number;
  status: string;
  latestCheckpoint?: { assessment: Record<string, unknown> } | null;
};
type Payload = { experiments: Experiment[]; approvedCycles: Cycle[] };

const money = (v: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v || 0));

const platformLabels: Record<string, string> = {
  meta: "Meta",
  google_ads: "Google",
  youtube: "YouTube",
  tiktok_ads: "TikTok",
  portal: "Portal",
};
const variableLabels: Record<string, string> = {
  audience: "Público",
  creative: "Criativo",
  placement: "Posicionamento",
  optimization_event: "Evento de otimização",
};
const metricLabels: Record<string, string> = {
  qualified_lead_rate: "taxa de lead qualificado",
  cpl: "CPL",
};
const experimentStatus: Record<
  string,
  { label: string; tone: "warning" | "success" | "danger" | "neutral" | "info" }
> = {
  draft: { label: "Aguardando decisão", tone: "warning" },
  approved: { label: "Aprovado", tone: "info" },
  running: { label: "Em campo", tone: "success" },
  paused: { label: "Pausado", tone: "warning" },
  completed: { label: "Concluído", tone: "neutral" },
  rejected: { label: "Rejeitado", tone: "danger" },
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const field = `w-full rounded-xl border border-[rgba(148,163,184,.16)] bg-white/[.03] p-3 text-sm text-[#e8eef8] transition-colors placeholder:text-[#6b7890] hover:border-[rgba(148,163,184,.26)] ${focusRing}`;
const btnAccent = `rounded-xl border border-[rgba(75,141,248,.45)] bg-[rgba(75,141,248,.12)] px-4 py-2 text-xs font-semibold text-[#e8eef8] transition-colors hover:bg-[rgba(75,141,248,.2)] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;
const btnOk = `rounded-xl border border-[rgba(52,211,153,.35)] bg-[rgba(52,211,153,.1)] px-4 py-2 text-xs font-semibold text-[#34d399] transition-colors hover:bg-[rgba(52,211,153,.18)] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;
const btnWarn = `rounded-xl border border-[rgba(245,181,68,.4)] bg-[rgba(245,181,68,.1)] px-4 py-2 text-xs font-semibold text-[#f5b544] transition-colors hover:bg-[rgba(245,181,68,.18)] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;
const btnGhost = "cc6-ghost-btn disabled:cursor-not-allowed disabled:opacity-40";

export default function MediaExperimentsPage() {
  const [data, setData] = useState<Payload | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    learningCycleId: "",
    name: "",
    hypothesis: "",
    platform: "meta",
    singleVariable: "audience",
    controlKey: "controle-atual",
    testKey: "teste-novo",
    primaryMetric: "qualified_lead_rate",
    guardrailMetric: "cpl",
    budgetCap: "2000",
    dailyBudgetCap: "200",
    minimumLeadsPerArm: "50",
    minimumDays: "7",
    maximumDays: "21",
    maximumGuardrailIncreasePercent: "20",
  });
  const load = useCallback(async () => {
    const r = await fetch("/api/v1/marketing/experiments", { cache: "no-store" }),
      j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Indisponível");
    setData(j.data);
    setForm((f) => ({ ...f, learningCycleId: f.learningCycleId || j.data.approvedCycles?.[0]?.id || "" }));
  }, []);
  useEffect(() => {
    load().catch((e) => setNotice(e.message));
  }, [load]);
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/v1/marketing/experiments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Ação recusada");
      setNotice("Ação registrada; nenhuma campanha foi alterada automaticamente.");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    await act({
      action: "create",
      ...form,
      ...Object.fromEntries(
        ["budgetCap", "dailyBudgetCap", "minimumLeadsPerArm", "minimumDays", "maximumDays", "maximumGuardrailIncreasePercent"].map(
          (k) => [k, Number(form[k as keyof typeof form])],
        ),
      ),
    });
  }

  const drafts = data ? data.experiments.filter((x) => x.status === "draft").length : 0;
  const readyToStart = data ? data.experiments.filter((x) => x.status === "approved").length : 0;
  const running = data ? data.experiments.filter((x) => x.status === "running").length : 0;

  return (
    <div data-phase="93-governed-media-experiment-lab" className="space-y-4 pb-10">
      <PageHeader
        eyebrow="Marketing · Experimentos"
        title="Laboratório de mídia"
        description="Uma variável por vez, grupo de controle obrigatório, teto de investimento e parada antecipada — o resultado é direcional; quem decide é a diretoria."
      />

      {notice ? (
        <div
          role="status"
          className="cc6-panel cc6-sev-band cc6-reveal p-4 pl-5 text-sm leading-6 text-[#aab6ca]"
          style={{ "--cc6-sev": "var(--atlas-accent)" } as CSSProperties}
        >
          {notice}
        </div>
      ) : null}

      {/* 1º na hierarquia: o que espera decisão humana em cada etapa do funil. */}
      <section aria-label="Números decisivos do laboratório">
        <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="cc6-eyebrow">Pulso do laboratório</p>
            <StatusBadge tone="info">Sem vencedor automático</StatusBadge>
          </div>
          <div className="cc6-hairline mt-4 flex flex-wrap gap-x-10 gap-y-4 pt-4" aria-busy={!data}>
            <div>
              <p className={`cc6-metric-value text-3xl leading-none ${drafts ? "cc6-warn" : ""}`}>
                {data ? drafts : "—"}
              </p>
              <p className="cc6-metric-label mt-1.5">Aguardando decisão</p>
            </div>
            <div>
              <p className="cc6-metric-value text-3xl leading-none">{data ? readyToStart : "—"}</p>
              <p className="cc6-metric-label mt-1.5">Prontos para iniciar</p>
            </div>
            <div>
              <p className={`cc6-metric-value text-3xl leading-none ${running ? "cc6-ok" : ""}`}>
                {data ? running : "—"}
              </p>
              <p className="cc6-metric-label mt-1.5">Em campo</p>
            </div>
            <div>
              <p className="cc6-metric-value text-3xl leading-none">{data ? data.approvedCycles.length : "—"}</p>
              <p className="cc6-metric-label mt-1.5">Ciclos Andromeda aprovados</p>
            </div>
          </div>
        </TiltShell>
      </section>

      <section className="grid gap-4 lg:grid-cols-[380px_1fr]">
        <form
          onSubmit={submit}
          className="cc6-panel cc6-reveal space-y-3 self-start p-5"
          style={{ animationDelay: "120ms" }}
        >
          <h2 className="cc6-eyebrow">Novo plano controlado</h2>
          <select
            aria-label="Ciclo Andromeda aprovado"
            required
            value={form.learningCycleId}
            onChange={(e) => setForm({ ...form, learningCycleId: e.target.value })}
            className={field}
          >
            <option className="text-slate-900" value="">
              Ciclo Andromeda aprovado
            </option>
            {data?.approvedCycles.map((c) => (
              <option className="text-slate-900" key={c.id} value={c.id}>
                Ciclo {c.readiness_score}% · {new Date(c.created_at).toLocaleDateString("pt-BR")}
              </option>
            ))}
          </select>
          <input
            aria-label="Nome do experimento"
            required
            minLength={3}
            placeholder="Nome do experimento"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={field}
          />
          <textarea
            aria-label="Hipótese"
            required
            minLength={20}
            placeholder="Se alterarmos uma variável, esperamos... porque..."
            value={form.hypothesis}
            onChange={(e) => setForm({ ...form, hypothesis: e.target.value })}
            className={`min-h-24 ${field}`}
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              aria-label="Plataforma"
              value={form.platform}
              onChange={(e) => setForm({ ...form, platform: e.target.value })}
              className={field}
            >
              {Object.entries(platformLabels).map(([value, label]) => (
                <option className="text-slate-900" key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Variável isolada"
              value={form.singleVariable}
              onChange={(e) => setForm({ ...form, singleVariable: e.target.value })}
              className={field}
            >
              {Object.entries(variableLabels).map(([value, label]) => (
                <option className="text-slate-900" key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              aria-label="Identificador do controle"
              value={form.controlKey}
              onChange={(e) => setForm({ ...form, controlKey: e.target.value })}
              className={field}
              placeholder="Controle"
            />
            <input
              aria-label="Identificador do teste"
              value={form.testKey}
              onChange={(e) => setForm({ ...form, testKey: e.target.value })}
              className={field}
              placeholder="Teste"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              min="1"
              value={form.budgetCap}
              onChange={(e) => setForm({ ...form, budgetCap: e.target.value })}
              className={`cc6-num ${field}`}
              aria-label="Teto total"
            />
            <input
              type="number"
              min="1"
              value={form.dailyBudgetCap}
              onChange={(e) => setForm({ ...form, dailyBudgetCap: e.target.value })}
              className={`cc6-num ${field}`}
              aria-label="Teto diário"
            />
          </div>
          <button
            disabled={busy || !form.learningCycleId}
            className={`w-full py-2.5 text-sm ${btnAccent}`}
          >
            Criar rascunho
          </button>
        </form>

        {/* 2º na hierarquia: cada experimento com sua transição de governança. */}
        <div className="space-y-3">
          {data?.experiments.map((x, index) => {
            const status = experimentStatus[x.status] ?? { label: x.status, tone: "neutral" as const };
            const interpretation = x.latestCheckpoint
              ? String(x.latestCheckpoint.assessment.interpretation || "")
              : "";
            return (
              <article
                key={x.id}
                className="cc6-panel cc6-reveal p-5 transition-colors hover:border-[rgba(148,163,184,.22)]!"
                style={{ animationDelay: `${160 + Math.min(index, 6) * 50}ms` }}
              >
                <div className="flex flex-wrap justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                      <span className="cc6-chip">{platformLabels[x.platform] ?? x.platform}</span>
                    </div>
                    <h3 className="mt-2 text-lg font-semibold tracking-tight text-[#e8eef8]">{x.name}</h3>
                    <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#aab6ca]">{x.hypothesis}</p>
                    <p className="cc6-num mt-2.5 text-[11px] leading-5 text-[#6b7890]">
                      variável {variableLabels[x.single_variable] ?? x.single_variable} · primária{" "}
                      {metricLabels[x.primary_metric] ?? x.primary_metric} · proteção{" "}
                      {metricLabels[x.guardrail_metric] ?? x.guardrail_metric} · teto {money(x.budget_cap)}
                    </p>
                  </div>
                  {x.status === "draft" && (
                    <div className="flex flex-wrap content-start gap-2">
                      <button
                        disabled={busy}
                        onClick={() =>
                          act({
                            action: "decide",
                            experimentId: x.id,
                            decision: "approved",
                            reason: "Plano controlado revisado e autorizado pela diretoria.",
                          })
                        }
                        className={btnOk}
                      >
                        Aprovar plano
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          act({
                            action: "decide",
                            experimentId: x.id,
                            decision: "rejected",
                            reason: "Plano rejeitado pela diretoria por risco ou evidência insuficiente.",
                          })
                        }
                        className={btnGhost}
                      >
                        Rejeitar
                      </button>
                    </div>
                  )}
                  {x.status === "approved" && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        const externalKey = prompt("Identificador do experimento criado na plataforma:");
                        if (externalKey)
                          act({
                            action: "transition",
                            experimentId: x.id,
                            transition: "start",
                            externalKey,
                            reason: "Execução externa conferida e início registrado pela diretoria.",
                          });
                      }}
                      className={`self-start ${btnAccent}`}
                    >
                      Registrar início externo
                    </button>
                  )}
                  {["running", "paused"].includes(x.status) && (
                    <div className="flex flex-wrap content-start gap-2">
                      <button
                        disabled={busy}
                        onClick={() =>
                          act({
                            action: "transition",
                            experimentId: x.id,
                            transition: x.status === "running" ? "pause" : "resume",
                            reason: "Transição operacional revisada e registrada pela diretoria.",
                          })
                        }
                        className={btnWarn}
                      >
                        {x.status === "running" ? "Pausar" : "Retomar"}
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          act({
                            action: "transition",
                            experimentId: x.id,
                            transition: "complete",
                            reason: "Janela concluída; resultado seguirá para revisão humana.",
                          })
                        }
                        className={btnGhost}
                      >
                        Concluir
                      </button>
                    </div>
                  )}
                </div>
                {x.latestCheckpoint && (
                  <div className="cc6-panel-quiet mt-4 p-3.5">
                    <p className="cc6-eyebrow text-[10px]">Última leitura</p>
                    <p className="mt-1 text-sm leading-6 text-[#aab6ca]">
                      {String(x.latestCheckpoint.assessment.recommendation || "em análise")}
                      {interpretation ? ` · ${interpretation}` : ""}
                    </p>
                  </div>
                )}
              </article>
            );
          })}
          {data && !data.experiments.length ? (
            <p
              className="cc6-panel-quiet cc6-reveal p-6 text-center text-sm leading-6 text-[#6b7890]"
              style={{ animationDelay: "160ms" }}
            >
              Aprove um ciclo Andromeda antes de planejar o primeiro teste.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
