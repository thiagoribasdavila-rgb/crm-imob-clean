"use client";

import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

/*
 * CC-6 · Orquestração de orçamento — mesma API e mesmas ações (zero fetch
 * novo; nada é aplicado nas plataformas). Consolidações do redesign:
 * - a governança era declarada 3× no header (eyebrow "PERFORMANCE · ESTOQUE ·
 *   CAPACIDADE · CAIXA", descrição e 3 chips) — virou uma linha + um badge;
 *   estoque e capacidade seguem visíveis por candidato, onde são dado;
 * - o status do plano em texto cru duplicava o sinal dos botões — virou badge
 *   semântico único;
 * - números decisivos (cenários aguardando decisão, base elegível, amostra
 *   válida) subiram para o topo em metric mono — antes só existiam implícitos
 *   nas listas;
 * - o vazio de planos não aparece mais durante o carregamento inicial.
 */

type Candidate = {
  developmentName: string;
  platform: string;
  performanceScore: number;
  inventoryAvailable: number;
  capacityHeadroomPercent: number;
  sampleSufficient: boolean;
};
type Plan = {
  id: string;
  name: string;
  status: string;
  total_budget: number;
  period_start: string;
  period_end: string;
  allocations: {
    allocated: number;
    unallocated: number;
    allocations: Array<{
      developmentName: string;
      platform: string;
      recommendedBudget: number;
      score: number;
      sampleSufficient: boolean;
    }>;
    blocked: Array<{ developmentName: string; blockers: string[] }>;
  };
};
type Payload = { plans: Plan[]; candidates: Candidate[] };

const brl = (v: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(Number(v || 0));
const initialDate = new Date(),
  initialStart = initialDate.toISOString().slice(0, 10),
  initialEnd = new Date(initialDate.getTime() + 30 * 86400000).toISOString().slice(0, 10);

const planStatus: Record<string, { label: string; tone: "warning" | "success" | "danger" | "neutral" }> = {
  draft: { label: "Aguardando decisão", tone: "warning" },
  approved: { label: "Aprovado", tone: "success" },
  rejected: { label: "Rejeitado", tone: "danger" },
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const field = `w-full rounded-xl border border-[rgba(148,163,184,.16)] bg-white/[.03] p-3 text-sm text-[#e8eef8] transition-colors placeholder:text-[#6b7890] hover:border-[rgba(148,163,184,.26)] ${focusRing}`;
const btnAccent = `rounded-xl border border-[rgba(75,141,248,.45)] bg-[rgba(75,141,248,.12)] px-4 py-2.5 text-sm font-semibold text-[#e8eef8] transition-colors hover:bg-[rgba(75,141,248,.2)] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;
const btnOk = `rounded-xl border border-[rgba(52,211,153,.35)] bg-[rgba(52,211,153,.1)] px-4 py-2 text-xs font-semibold text-[#34d399] transition-colors hover:bg-[rgba(52,211,153,.18)] disabled:cursor-not-allowed disabled:opacity-40 ${focusRing}`;
const btnGhost = "cc6-ghost-btn disabled:cursor-not-allowed disabled:opacity-40";

export default function BudgetPage() {
  const [data, setData] = useState<Payload | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "Plano mensal de mídia",
    totalBudget: "10000",
    periodStart: initialStart,
    periodEnd: initialEnd,
  });
  const load = useCallback(async () => {
    const r = await fetch("/api/v1/marketing/budget-plans", { cache: "no-store" }),
      j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Indisponível");
    setData(j.data);
  }, []);
  useEffect(() => {
    load().catch((e) => setNotice(e.message));
  }, [load]);
  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setNotice("");
    try {
      const r = await fetch("/api/v1/marketing/budget-plans", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Ação recusada");
      setNotice("Plano registrado; nenhuma verba foi movimentada nas plataformas.");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(false);
    }
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    return act({ action: "generate", ...form, totalBudget: Number(form.totalBudget) });
  }

  const pending = data ? data.plans.filter((p) => p.status === "draft").length : 0;
  const sampleOk = data ? data.candidates.filter((c) => c.sampleSufficient).length : 0;

  return (
    <div data-phase="95-governed-budget-orchestration" className="space-y-4 pb-10">
      <PageHeader
        eyebrow="Marketing · Orçamento"
        title="Orquestração de orçamento"
        description="Recomendação explicável por projeto e canal, limitada por performance, estoque, capacidade e caixa — o CRM é o resultado."
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

      {/* 1º na hierarquia: o que espera decisão humana e com que base. */}
      <section aria-label="Números decisivos da orquestração">
        <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="cc6-eyebrow">Pulso da verba</p>
            <StatusBadge tone="info">Sem alteração automática</StatusBadge>
          </div>
          <div className="cc6-hairline mt-4 flex flex-wrap gap-x-10 gap-y-4 pt-4" aria-busy={!data}>
            <div>
              <p className={`cc6-metric-value text-3xl leading-none ${pending ? "cc6-warn" : ""}`}>
                {data ? pending : "—"}
              </p>
              <p className="cc6-metric-label mt-1.5">Cenários aguardando decisão</p>
            </div>
            <div>
              <p className="cc6-metric-value text-3xl leading-none">{data ? data.candidates.length : "—"}</p>
              <p className="cc6-metric-label mt-1.5">Combinações elegíveis</p>
            </div>
            <div>
              <p className="cc6-metric-value text-3xl leading-none">{data ? sampleOk : "—"}</p>
              <p className="cc6-metric-label mt-1.5">Com amostra válida</p>
            </div>
          </div>
        </TiltShell>
      </section>

      <section className="grid gap-4 lg:grid-cols-[350px_1fr]">
        <div className="space-y-4">
          <form
            onSubmit={submit}
            className="cc6-panel cc6-reveal space-y-3 p-5"
            style={{ animationDelay: "120ms" }}
          >
            <h2 className="cc6-eyebrow">Novo cenário</h2>
            <input
              aria-label="Nome do plano"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={field}
            />
            <input
              aria-label="Orçamento total"
              type="number"
              min="1"
              value={form.totalBudget}
              onChange={(e) => setForm({ ...form, totalBudget: e.target.value })}
              className={`cc6-num ${field}`}
            />
            <div className="grid grid-cols-2 gap-2">
              <input
                aria-label="Início"
                type="date"
                value={form.periodStart}
                onChange={(e) => setForm({ ...form, periodStart: e.target.value })}
                className={`cc6-num [color-scheme:dark] ${field}`}
              />
              <input
                aria-label="Fim"
                type="date"
                value={form.periodEnd}
                onChange={(e) => setForm({ ...form, periodEnd: e.target.value })}
                className={`cc6-num [color-scheme:dark] ${field}`}
              />
            </div>
            <button disabled={busy || !data?.candidates.length} className={`w-full ${btnAccent}`}>
              Gerar recomendação
            </button>
          </form>

          <section
            aria-label="Base elegível"
            className="cc6-panel cc6-reveal p-5"
            style={{ animationDelay: "160ms" }}
          >
            <h2 className="cc6-eyebrow">Base elegível</h2>
            <div className="mt-3 space-y-2">
              {data && !data.candidates.length ? (
                <p className="text-sm leading-6 text-[#6b7890]">
                  Nenhuma combinação projeto × canal elegível na janela.
                </p>
              ) : null}
              {data?.candidates.map((c, i) => (
                <div
                  key={`${c.developmentName}-${c.platform}-${i}`}
                  className="cc6-panel-quiet p-3 transition-colors hover:border-[rgba(148,163,184,.26)]!"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-sm font-medium text-[#e8eef8]">{c.developmentName}</strong>
                    <span className="cc6-chip">{c.platform}</span>
                  </div>
                  <p className="cc6-num mt-1.5 text-[11px] leading-5 text-[#6b7890]">
                    score {c.performanceScore} · {c.inventoryAvailable} unidades · capacidade{" "}
                    {c.capacityHeadroomPercent}% ·{" "}
                    <span className={c.sampleSufficient ? "cc6-ok" : "cc6-warn"}>
                      {c.sampleSufficient ? "amostra válida" : "exploração"}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* 2º na hierarquia: os cenários — aprovar ou rejeitar é a decisão. */}
        <div className="space-y-3">
          {data?.plans.map((p, index) => {
            const status = planStatus[p.status] ?? { label: p.status, tone: "neutral" as const };
            return (
              <article
                key={p.id}
                className="cc6-panel cc6-reveal p-5 transition-colors hover:border-[rgba(148,163,184,.22)]!"
                style={{ animationDelay: `${160 + Math.min(index, 6) * 50}ms` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold tracking-tight text-[#e8eef8]">{p.name}</h3>
                      <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                    </div>
                    <p className="cc6-num mt-1 text-[12px] text-[#6b7890]">
                      {brl(p.total_budget)} · {p.period_start} a {p.period_end}
                    </p>
                  </div>
                  {p.status === "draft" && (
                    <div className="flex gap-2">
                      <button
                        disabled={busy}
                        onClick={() =>
                          act({
                            action: "decide",
                            planId: p.id,
                            decision: "approved",
                            reason: "Alocação revisada com estoque, capacidade e evidência comercial.",
                          })
                        }
                        className={btnOk}
                      >
                        Aprovar cenário
                      </button>
                      <button
                        disabled={busy}
                        onClick={() =>
                          act({
                            action: "decide",
                            planId: p.id,
                            decision: "rejected",
                            reason: "Cenário rejeitado por limite financeiro ou operacional.",
                          })
                        }
                        className={btnGhost}
                      >
                        Rejeitar
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-4 space-y-2">
                  {p.allocations.allocations.map((a, i) => (
                    <div
                      key={`${a.developmentName}-${a.platform}-${i}`}
                      className="cc6-panel-quiet grid grid-cols-[1fr_auto] items-center gap-3 p-3.5"
                    >
                      <div className="min-w-0">
                        <strong className="text-sm font-medium text-[#e8eef8]">{a.developmentName}</strong>
                        <p className="cc6-num mt-0.5 text-[11px] text-[#6b7890]">
                          {a.platform} · score {a.score} ·{" "}
                          <span className={a.sampleSufficient ? "cc6-ok" : "cc6-warn"}>
                            {a.sampleSufficient ? "amostra válida" : "exploração limitada"}
                          </span>
                        </p>
                      </div>
                      <strong className="cc6-num text-sm text-[#e8eef8]">{brl(a.recommendedBudget)}</strong>
                    </div>
                  ))}
                </div>
                <div className="cc6-hairline mt-4 flex flex-wrap gap-x-8 gap-y-2 pt-3">
                  <p className="cc6-num text-[12px] text-[#aab6ca]">
                    Alocado <span className="text-[#e8eef8]">{brl(p.allocations.allocated)}</span>
                  </p>
                  <p className="cc6-num text-[12px] text-[#aab6ca]">
                    Reserva não alocada <span className="text-[#e8eef8]">{brl(p.allocations.unallocated)}</span>
                  </p>
                </div>
              </article>
            );
          })}
          {data && !data.plans.length ? (
            <p
              className="cc6-panel-quiet cc6-reveal p-6 text-center text-sm leading-6 text-[#6b7890]"
              style={{ animationDelay: "160ms" }}
            >
              Importe fatos multicanal por projeto para gerar o primeiro cenário.
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}
