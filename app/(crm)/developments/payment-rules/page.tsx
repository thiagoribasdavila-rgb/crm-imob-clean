"use client";

import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import { AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { supabase } from "@/lib/supabase";

type Rule = {
  id: string;
  developer_name: string;
  version: number;
  rule_name: string;
  payment_flow: string;
  down_payment_percent: number | null;
  installments_count: number | null;
  balloon_payment_notes: string | null;
  financing_notes: string | null;
  valid_from: string | null;
  valid_until: string | null;
  active: boolean;
};
type Payload = {
  rules: Rule[];
  homologation: Array<{
    developerName: string;
    versions: number;
    activeVersions: number;
    latestVersion: number;
    historyPreserved: boolean;
  }>;
  canManage: boolean;
};

/* CC-6: anel de foco padrão e campo compartilhado (sem min-h para permitir
   textarea compor min-h próprio sem conflito de utilitários). */
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const field =
  `w-full rounded-xl border border-[rgba(148,163,184,0.14)] bg-white/[0.03] px-4 py-2.5 text-sm text-[#e8eef8] transition-colors placeholder:text-[#6b7890] focus:border-[color:var(--atlas-accent)] ${focusRing}`;

export default function PaymentRulesPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    developerName: "",
    ruleName: "",
    paymentFlow: "",
    downPaymentPercent: "",
    installmentsCount: "",
    balloonPaymentNotes: "",
    financingNotes: "",
    validFrom: "",
    validUntil: "",
  });
  async function request(init?: RequestInit) {
    const { data: session } = await supabase.auth.getSession();
    const response = await fetch("/api/v1/developers/payment-rules", {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.session?.access_token}`,
        ...(init?.headers || {}),
      },
    });
    const body = await response.json();
    if (!response.ok)
      throw new Error(body.error || "Falha nas regras de pagamento.");
    return body;
  }
  async function load() {
    try {
      setData((await request()) as Payload);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar.");
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      await request({ method: "POST", body: JSON.stringify(form) });
      setForm({
        developerName: "",
        ruleName: "",
        paymentFlow: "",
        downPaymentPercent: "",
        installmentsCount: "",
        balloonPaymentNotes: "",
        financingNotes: "",
        validFrom: "",
        validUntil: "",
      });
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao salvar.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="space-y-4 pb-10" data-payment-rules-layout="cc6-governance">
      <PageHeader
        eyebrow="Incorporadoras · Fase 30"
        title="Fluxos de pagamento versionados"
        description="A nova versão desativa a anterior sem apagar o histórico usado em simulações e propostas."
      />

      {error ? (
        <div role="alert" className="cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-sm text-[#fb7185]" style={{ "--cc6-sev": "#fb7185" } as CSSProperties}>
          {error}
        </div>
      ) : null}

      {/* Evidência de versionamento (única superfície com 3D): estado semântico
          único por incorporadora + motivo em uma linha mono. */}
      {data?.homologation.length ? (
        <section aria-labelledby="payment-rules-evidence-title">
          <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
            <header className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="cc6-eyebrow">Evidência automática</p>
                <h2 id="payment-rules-evidence-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">
                  Histórico preservado por incorporadora
                </h2>
              </div>
              <span className="cc6-chip">{data.homologation.length} incorporadoras</span>
            </header>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {data.homologation.map((item, index) => (
                <div
                  key={item.developerName.toLocaleLowerCase("pt-BR")}
                  className="cc6-sev-band cc6-panel-quiet cc6-reveal py-3 pl-4 pr-3"
                  style={{ animationDelay: `${80 + Math.min(index, 8) * 40}ms`, "--cc6-sev": item.historyPreserved ? "#34d399" : "#f5b544" } as CSSProperties}
                >
                  <div className="flex items-start justify-between gap-3">
                    <strong className="truncate text-[13px] font-semibold text-[#e8eef8]">{item.developerName}</strong>
                    <StatusBadge tone={item.historyPreserved ? "success" : "warning"}>
                      {item.historyPreserved ? "Comprovado" : "Criar 2ª versão"}
                    </StatusBadge>
                  </div>
                  <p className="cc6-num mt-1.5 text-[11px] text-[#6b7890]">
                    {item.versions} {item.versions === 1 ? "versão" : "versões"} · v{item.latestVersion} atual · {item.activeVersions} ativa{item.activeVersions === 1 ? "" : "s"}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] leading-4 text-[#6b7890]">
              Comprovação verde exige ao menos duas versões, exatamente uma ativa e a anterior mantida no histórico.
            </p>
          </TiltShell>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[.9fr_1.1fr] xl:items-start">
        <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "120ms" }} aria-labelledby="payment-rules-form-title">
          <header className="px-5 pb-4 pt-5">
            <p className="cc6-eyebrow">Nova versão</p>
            <h2 id="payment-rules-form-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Regra da incorporadora</h2>
            <p className="mt-1 text-xs leading-5 text-[#6b7890]">Somente condições confirmadas em documento vigente.</p>
          </header>
          <form onSubmit={save} className="cc6-hairline grid gap-3 p-5">
            <label className="block text-xs font-medium text-[#aab6ca]">Incorporadora
              <input
                required
                className={`${field} mt-1.5`}
                placeholder="Incorporadora"
                value={form.developerName}
                onChange={(e) => setForm({ ...form, developerName: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-[#aab6ca]">Nome da regra
              <input
                required
                className={`${field} mt-1.5`}
                placeholder="Nome da regra"
                value={form.ruleName}
                onChange={(e) => setForm({ ...form, ruleName: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-[#aab6ca]">Fluxo de pagamento
              <textarea
                required
                minLength={10}
                className={`${field} mt-1.5 min-h-28`}
                placeholder="Fluxo completo: ato, mensais, intermediárias, chaves..."
                value={form.paymentFlow}
                onChange={(e) => setForm({ ...form, paymentFlow: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-[#aab6ca]">Entrada %
                <input
                  className={`${field} mt-1.5`}
                  type="number"
                  min="0"
                  max="100"
                  step="0.001"
                  placeholder="Entrada %"
                  value={form.downPaymentPercent}
                  onChange={(e) => setForm({ ...form, downPaymentPercent: e.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-[#aab6ca]">Parcelas
                <input
                  className={`${field} mt-1.5`}
                  type="number"
                  min="0"
                  max="600"
                  placeholder="Parcelas"
                  value={form.installmentsCount}
                  onChange={(e) => setForm({ ...form, installmentsCount: e.target.value })}
                />
              </label>
            </div>
            <label className="block text-xs font-medium text-[#aab6ca]">Balões e intermediárias
              <textarea
                className={`${field} mt-1.5`}
                placeholder="Balões e intermediárias"
                value={form.balloonPaymentNotes}
                onChange={(e) => setForm({ ...form, balloonPaymentNotes: e.target.value })}
              />
            </label>
            <label className="block text-xs font-medium text-[#aab6ca]">Financiamento e observações
              <textarea
                className={`${field} mt-1.5`}
                placeholder="Financiamento e observações"
                value={form.financingNotes}
                onChange={(e) => setForm({ ...form, financingNotes: e.target.value })}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs font-medium text-[#aab6ca]">Vigência inicial
                <input
                  className={`${field} mt-1.5`}
                  type="date"
                  value={form.validFrom}
                  onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                />
              </label>
              <label className="block text-xs font-medium text-[#aab6ca]">Válido até
                <input
                  className={`${field} mt-1.5`}
                  type="date"
                  value={form.validUntil}
                  onChange={(e) => setForm({ ...form, validUntil: e.target.value })}
                />
              </label>
            </div>
            <button
              disabled={!data?.canManage || saving}
              className="atlas-button-primary disabled:opacity-40"
            >
              {saving ? "Salvando…" : "Criar nova versão"}
            </button>
            {data && !data.canManage ? (
              <p className="text-[11px] leading-4 text-[#6b7890]">Somente papéis de gestão criam versões; a leitura permanece aberta.</p>
            ) : null}
          </form>
        </section>

        <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "150ms" }} aria-labelledby="payment-rules-history-title">
          <header className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-4 pt-5">
            <div>
              <p className="cc6-eyebrow">Histórico</p>
              <h2 id="payment-rules-history-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Regras cadastradas</h2>
            </div>
            {data ? <span className="cc6-chip">{data.rules.length} versões</span> : null}
          </header>
          <div className="cc6-hairline space-y-2 p-5">
            {!data ? (
              <AtlasSkeleton className="h-60 w-full" />
            ) : !data.rules.length ? (
              <AtlasEmpty
                reason="first-use"
                eyebrow="Condições ainda não registradas"
                title="Nenhuma regra cadastrada"
                description="Registre a primeira quando receber as condições da incorporadora."
              />
            ) : (
              data.rules.map((rule, index) => (
                <article
                  key={rule.id}
                  className={`cc6-panel-quiet cc6-reveal p-4 transition-colors hover:border-[rgba(148,163,184,0.22)]! ${rule.active ? "cc6-sev-band pl-5" : ""}`}
                  style={{ animationDelay: `${Math.min(index, 8) * 40}ms`, ...(rule.active ? { "--cc6-sev": "#34d399" } : null) } as CSSProperties}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-[#6b7890]">
                        {rule.developer_name} · v{rule.version}
                      </p>
                      <h3 className="mt-1 truncate text-[13px] font-semibold text-[#e8eef8]">{rule.rule_name}</h3>
                    </div>
                    <StatusBadge tone={rule.active ? "success" : "neutral"}>
                      {rule.active ? "Ativa" : "Histórico"}
                    </StatusBadge>
                  </div>
                  <p className="cc6-num mt-2 text-[11px] text-[#6b7890]">
                    entrada {rule.down_payment_percent ?? "—"}% · {rule.installments_count ?? "—"} parcelas · vigência {rule.valid_from || "aberta"} → {rule.valid_until || "aberta"}
                  </p>
                  <p className="mt-2 whitespace-pre-line text-xs leading-5 text-[#aab6ca]">{rule.payment_flow}</p>
                  {rule.balloon_payment_notes || rule.financing_notes ? (
                    <p className="cc6-hairline mt-2 pt-2 text-[11px] leading-4 text-[#6b7890]">
                      {[rule.balloon_payment_notes, rule.financing_notes].filter(Boolean).join(" · ")}
                    </p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
