"use client";

import { FormEvent, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { calculateLeadScore } from "@/lib/atlas/scoring";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";

const initialForm = {
  name: "",
  email: "",
  phone: "",
  source: "Meta Ads",
  purpose: "moradia",
  budget_min: "",
  budget_max: "",
  bedrooms: "",
  preferred_regions: "",
  notes: "",
  development_id: "",
};

/* CC-6: campo único do formulário — hairline, foco pelo acento (borda +
   focus-visible), inválido em rose via aria-invalid já emitido pelos campos. */
const FIELD_CLASS =
  "mt-2 w-full rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0b1224] px-3.5 py-2.5 text-sm text-[#e8eef8] outline-none transition-colors placeholder:text-[#6b7890] focus:border-[color:var(--atlas-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--atlas-accent)] aria-[invalid=true]:border-[rgba(251,113,133,0.55)]";
const LABEL_CLASS = "block text-xs text-[#6b7890]";

const TEMPERATURE_TONE: Record<string, "danger" | "warning" | "info"> = {
  quente: "danger",
  morno: "warning",
};

export default function NewLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState("");
  const [duplicateLeadId, setDuplicateLeadId] = useState<string | null>(null);
  const [developments, setDevelopments] = useState<Array<{ id: string; name: string; developer_name: string | null }>>([]);

  useEffect(() => {
    void supabase
      .from("crm_projects")
      .select("id,name,developer_name")
      .order("name")
      .then(({ data }) => setDevelopments(data ?? []));
  }, []);

  const preferredRegions = useMemo(
    () => form.preferred_regions.split(",").map((value) => value.trim()).filter(Boolean),
    [form.preferred_regions],
  );

  const scorePreview = useMemo(
    () => calculateLeadScore({
      email: form.email || null,
      phone: form.phone || null,
      source: form.source,
      purpose: form.purpose,
      budgetMax: form.budget_max ? Number(form.budget_max) : null,
      bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
      preferredRegions,
      status: "novo",
    }),
    [form, preferredRegions],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    setSaving(true);
    setError("");
    setErrorField("");
    setDuplicateLeadId(null);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error("Sua sessão expirou. Entre novamente.");

      const response = await fetch("/api/v1/leads", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: form.name,
          email: form.email || undefined,
          phone: form.phone || undefined,
          source: form.source,
          purpose: form.purpose,
          budgetMin: form.budget_min ? Number(form.budget_min) : null,
          budgetMax: form.budget_max ? Number(form.budget_max) : null,
          bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
          preferredRegions,
          notes: form.notes || undefined,
          developmentId: form.development_id || undefined,
        }),
      });

      const result = (await response.json()) as {
        error?: string;
        field?: string;
        duplicateLeadId?: string;
        lead?: { id: string };
      };

      if (!response.ok) {
        setDuplicateLeadId(result.duplicateLeadId ?? null);
        setErrorField(result.field ?? "");
        throw new Error(result.error || "Não foi possível criar o lead.");
      }

      router.push(result.lead?.id ? `/leads/${result.lead.id}` : "/leads");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Falha ao criar lead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 pb-8">
      <PageHeader
        eyebrow="CRM · Entrada comercial"
        title="Novo lead"
        description="Nome e um contato bastam — o restante pode ser completado depois no Lead 360."
      />

      <form
        onSubmit={handleSubmit}
        noValidate
        className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_260px]"
        data-phase="25-lead-registration"
      >
        <section className="cc6-panel cc6-reveal p-5 sm:p-6" aria-labelledby="lead-form-title">
          <header>
            <p className="cc6-eyebrow">Cadastro deduplicado</p>
            <h2 id="lead-form-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">
              Dados do contato
            </h2>
          </header>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className={LABEL_CLASS} htmlFor="lead-name">
              Nome *
              <input
                id="lead-name"
                required
                minLength={2}
                maxLength={120}
                autoFocus
                autoComplete="name"
                aria-invalid={errorField === "name"}
                className={FIELD_CLASS}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label className={LABEL_CLASS} htmlFor="lead-phone">
              Telefone
              <input
                id="lead-phone"
                inputMode="tel"
                autoComplete="tel"
                aria-invalid={errorField === "phone" || errorField === "contact"}
                placeholder="(11) 99999-9999"
                className={FIELD_CLASS}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </label>
            <label className={LABEL_CLASS} htmlFor="lead-email">
              E-mail
              <input
                id="lead-email"
                type="email"
                maxLength={254}
                autoComplete="email"
                aria-invalid={errorField === "email" || errorField === "contact"}
                className={FIELD_CLASS}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <label className={LABEL_CLASS} htmlFor="lead-source">
              Origem
              <select
                id="lead-source"
                className={FIELD_CLASS}
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              >
                <option>Meta Ads</option>
                <option>Google</option>
                <option>WhatsApp</option>
                <option>Indicação</option>
                <option>Portal</option>
                <option>Orgânico</option>
                <option>Manual</option>
              </select>
            </label>
            <label className={`${LABEL_CLASS} md:col-span-2`} htmlFor="lead-development">
              Projeto de interesse
              <select
                id="lead-development"
                className={FIELD_CLASS}
                value={form.development_id}
                onChange={(e) => setForm({ ...form, development_id: e.target.value })}
              >
                <option value="">Ainda não identificado</option>
                {developments.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} · {item.developer_name || "Incorporadora"}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-[11px] leading-4 text-[#6b7890]">
                Com projeto, a lead entra na fila equilibrada da equipe.
              </span>
            </label>
          </div>

          <details className="cc6-hairline mt-5 pt-4">
            <summary className="cc6-eyebrow cursor-pointer list-none text-[10px]! transition-colors hover:text-[#aab6ca]">
              Qualificação opcional · objetivo, orçamento e regiões
            </summary>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className={LABEL_CLASS} htmlFor="lead-purpose">
                Objetivo
                <select
                  id="lead-purpose"
                  className={FIELD_CLASS}
                  value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                >
                  <option value="moradia">Moradia</option>
                  <option value="investimento">Investimento</option>
                  <option value="locacao">Locação</option>
                </select>
              </label>
              <label className={LABEL_CLASS} htmlFor="lead-bedrooms">
                Dormitórios
                <input
                  id="lead-bedrooms"
                  type="number"
                  min="0"
                  max="20"
                  className={FIELD_CLASS}
                  value={form.bedrooms}
                  onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
                />
              </label>
              <label className={LABEL_CLASS} htmlFor="lead-budget-min">
                Orçamento mínimo
                <input
                  id="lead-budget-min"
                  type="number"
                  min="0"
                  max="1000000000"
                  step="1000"
                  aria-invalid={errorField === "budget"}
                  className={FIELD_CLASS}
                  value={form.budget_min}
                  onChange={(e) => setForm({ ...form, budget_min: e.target.value })}
                />
              </label>
              <label className={LABEL_CLASS} htmlFor="lead-budget-max">
                Orçamento máximo
                <input
                  id="lead-budget-max"
                  type="number"
                  min="0"
                  max="1000000000"
                  step="1000"
                  aria-invalid={errorField === "budget" || errorField === "budgetMax"}
                  className={FIELD_CLASS}
                  value={form.budget_max}
                  onChange={(e) => setForm({ ...form, budget_max: e.target.value })}
                />
              </label>
              <label className={`${LABEL_CLASS} md:col-span-2`} htmlFor="lead-regions">
                Regiões preferidas
                <input
                  id="lead-regions"
                  className={FIELD_CLASS}
                  value={form.preferred_regions}
                  onChange={(e) => setForm({ ...form, preferred_regions: e.target.value })}
                />
                <span className="mt-1 block text-[11px] leading-4 text-[#6b7890]">Separe por vírgulas.</span>
              </label>
              <label className={`${LABEL_CLASS} md:col-span-2`} htmlFor="lead-notes">
                Observações
                <textarea
                  id="lead-notes"
                  rows={4}
                  maxLength={5000}
                  className={FIELD_CLASS}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
                <span className="cc6-num mt-1 block text-right text-[11px] text-[#6b7890]">{form.notes.length}/5000</span>
              </label>
            </div>
          </details>
        </section>

        {/* Trilho de decisão: score ao vivo + erro + submissão no mesmo lugar. */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-4">
          <section className="cc6-panel-quiet cc6-reveal p-4" style={{ animationDelay: "80ms" }} aria-label="Score previsto do lead">
            <p className="cc6-eyebrow">Score previsto</p>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="cc6-metric-value text-4xl leading-none">{scorePreview.score}</span>
              <StatusBadge tone={TEMPERATURE_TONE[scorePreview.temperature] ?? "info"}>{scorePreview.temperature}</StatusBadge>
            </div>
            <p className="cc6-hairline mt-3 pt-3 text-xs leading-5 text-[#6b7890]">
              {scorePreview.reasons.length
                ? scorePreview.reasons.join(" · ")
                : "Contato, orçamento, objetivo e região aumentam a qualidade do lead."}
            </p>
          </section>

          {error && (
            <div
              role="alert"
              className="cc6-panel-quiet cc6-sev-band py-3 pl-4 pr-3 text-sm leading-5 text-[#fb7185]"
              style={{ "--cc6-sev": "#fb7185" } as CSSProperties}
            >
              <p>{error}</p>
              {duplicateLeadId && (
                <button
                  type="button"
                  onClick={() => router.push(`/leads/${duplicateLeadId}`)}
                  className="mt-2 font-medium text-[#e8eef8] underline underline-offset-4"
                >
                  Abrir lead existente
                </button>
              )}
            </div>
          )}

          <div className="cc6-reveal flex flex-col gap-2" style={{ animationDelay: "140ms" }}>
            <button
              type="submit"
              disabled={saving || form.name.trim().length < 2 || (!form.phone.trim() && !form.email.trim())}
              className="atlas-button-primary min-h-12 justify-center disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saving ? "Criando e verificando..." : "Criar lead"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => router.back()}
              className="cc6-ghost-btn min-h-11 justify-center disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}
