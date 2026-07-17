"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { calculateLeadScore } from "@/lib/atlas/scoring";

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

export default function NewLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [errorField, setErrorField] = useState("");
  const [duplicateLeadId, setDuplicateLeadId] = useState<string | null>(null);
  const [developments, setDevelopments] = useState<Array<{ id: string; name: string; developer_name: string | null }>>([]);

  useEffect(() => {
    void supabase.from("developments").select("id,name,developer_name").order("name").then(({ data }) => setDevelopments(data ?? []));
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

  const fieldClass =
    "w-full rounded-xl border border-white/[0.08] bg-[#080d18] px-4 py-3 text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/60 focus:ring-4 focus:ring-sky-400/10";

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-sky-300">Entrada comercial</p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.04em] text-white">Novo lead</h1>
          <p className="mt-2 max-w-2xl text-slate-400">Cadastro seguro, deduplicado e conectado ao pipeline, histórico, eventos e inteligência do Atlas.</p>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Score previsto</p>
          <div className="mt-1 flex items-center gap-3">
            <span className="text-2xl font-black text-white">{scorePreview.score}</span>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${scorePreview.temperature === "quente" ? "bg-rose-400/10 text-rose-300" : scorePreview.temperature === "morno" ? "bg-amber-400/10 text-amber-300" : "bg-sky-400/10 text-sky-300"}`}>{scorePreview.temperature}</span>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} noValidate className="space-y-6 rounded-3xl border border-white/[0.08] bg-[#0a101d]/80 p-4 shadow-2xl shadow-black/20 sm:p-6 md:p-8" data-phase="25-lead-registration">
        <div className="rounded-2xl border border-emerald-400/15 bg-emerald-400/[0.05] p-4"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-300">Cadastro rápido</p><p className="mt-2 text-sm text-slate-300">Preencha nome e pelo menos um contato. O restante pode ser completado depois no Lead 360.</p></div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm text-slate-300"><span>Nome *</span><input required minLength={2} maxLength={120} autoFocus autoComplete="name" aria-invalid={errorField === "name"} className={fieldClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="space-y-2 text-sm text-slate-300"><span>Telefone</span><input inputMode="tel" autoComplete="tel" aria-invalid={errorField === "phone" || errorField === "contact"} placeholder="(11) 99999-9999" className={fieldClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label className="space-y-2 text-sm text-slate-300"><span>E-mail</span><input type="email" maxLength={254} autoComplete="email" aria-invalid={errorField === "email" || errorField === "contact"} placeholder="cliente@email.com" className={fieldClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="space-y-2 text-sm text-slate-300"><span>Origem</span><select className={fieldClass} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}><option>Meta Ads</option><option>Google</option><option>WhatsApp</option><option>Indicação</option><option>Portal</option><option>Orgânico</option><option>Manual</option></select></label>
          <label className="space-y-2 text-sm text-slate-300 md:col-span-2"><span>Projeto de interesse</span><select className={fieldClass} value={form.development_id} onChange={(e) => setForm({ ...form, development_id: e.target.value })}><option value="">Ainda não identificado</option>{developments.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.developer_name || "Incorporadora"}</option>)}</select><span className="block text-xs text-slate-600">Ao informar o projeto, a lead entra na fila equilibrada da equipe.</span></label>
        </div>
        <details className="group rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4"><summary className="cursor-pointer list-none text-sm font-bold text-sky-200">Adicionar qualificação agora <span className="ml-2 text-xs font-normal text-slate-500 group-open:hidden">opcional</span></summary><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="space-y-2 text-sm text-slate-300"><span>Objetivo</span><select className={fieldClass} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}><option value="moradia">Moradia</option><option value="investimento">Investimento</option><option value="locacao">Locação</option></select></label><label className="space-y-2 text-sm text-slate-300"><span>Dormitórios</span><input type="number" min="0" max="20" className={fieldClass} value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} /></label><label className="space-y-2 text-sm text-slate-300"><span>Orçamento mínimo</span><input type="number" min="0" max="1000000000" step="1000" aria-invalid={errorField === "budget"} className={fieldClass} value={form.budget_min} onChange={(e) => setForm({ ...form, budget_min: e.target.value })} /></label><label className="space-y-2 text-sm text-slate-300"><span>Orçamento máximo</span><input type="number" min="0" max="1000000000" step="1000" aria-invalid={errorField === "budget" || errorField === "budgetMax"} className={fieldClass} value={form.budget_max} onChange={(e) => setForm({ ...form, budget_max: e.target.value })} /></label><label className="space-y-2 text-sm text-slate-300 md:col-span-2"><span>Regiões preferidas</span><input className={fieldClass} placeholder="Perdizes, Pinheiros, Vila Madalena" value={form.preferred_regions} onChange={(e) => setForm({ ...form, preferred_regions: e.target.value })} /><span className="block text-xs text-slate-600">Separe as regiões por vírgulas.</span></label><label className="space-y-2 text-sm text-slate-300 md:col-span-2"><span>Observações</span><textarea rows={4} maxLength={5000} className={fieldClass} placeholder="Contexto, prazo de compra, condições especiais..." value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /><span className="block text-right text-xs text-slate-600">{form.notes.length}/5000</span></label></div></details>

        {error && (
          <div role="alert" className="rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-sm text-red-100">
            <p>{error}</p>
            {duplicateLeadId && <button type="button" onClick={() => router.push(`/leads/${duplicateLeadId}`)} className="mt-3 font-bold text-white underline underline-offset-4">Abrir lead existente</button>}
          </div>
        )}

        <div className="rounded-2xl border border-sky-400/15 bg-sky-400/[0.06] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">Inteligência inicial</p>
          <p className="mt-2 text-sm text-slate-300">{scorePreview.reasons.length ? scorePreview.reasons.join(" · ") : "Preencha contato, orçamento, objetivo e região para aumentar a qualidade do lead."}</p>
        </div>

        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" disabled={saving} onClick={() => router.back()} className="rounded-xl border border-white/[0.1] px-4 py-3 text-sm font-semibold text-slate-300 transition hover:bg-white/[0.04] disabled:opacity-50">Cancelar</button>
          <button disabled={saving || form.name.trim().length < 2 || (!form.phone.trim() && !form.email.trim())} className="min-h-12 rounded-xl bg-white px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-45">{saving ? "Criando e verificando..." : "Criar lead"}</button>
        </div>
      </form>
    </div>
  );
}
