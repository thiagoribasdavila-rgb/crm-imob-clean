"use client";

import { FormEvent, useState } from "react";
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
};

export default function NewLeadPage() {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");

    const budgetMax = form.budget_max ? Number(form.budget_max) : null;
    const preferredRegions = form.preferred_regions
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const scoreResult = calculateLeadScore({
      email: form.email || null,
      phone: form.phone || null,
      source: form.source,
      purpose: form.purpose,
      budgetMax,
      bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
      preferredRegions,
      status: "novo",
    });

    const { data, error } = await supabase
      .from("leads")
      .insert({
        name: form.name,
        email: form.email || null,
        phone: form.phone || null,
        source: form.source,
        purpose: form.purpose,
        budget_min: form.budget_min ? Number(form.budget_min) : null,
        budget_max: budgetMax,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
        preferred_regions: preferredRegions,
        notes: form.notes || null,
        status: "novo",
        score: scoreResult.score,
        temperature: scoreResult.temperature,
      })
      .select("id")
      .single();

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    router.push(data?.id ? `/leads/${data.id}` : "/leads");
    router.refresh();
  }

  const fieldClass =
    "w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-white outline-none transition focus:border-blue-500";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-blue-300">Entrada comercial</p>
        <h1 className="mt-2 text-3xl font-black">Novo lead</h1>
        <p className="mt-2 text-zinc-400">O Atlas calcula o score inicial e prepara o lead para pipeline, matching e automações.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm"><span>Nome *</span><input required className={fieldClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
          <label className="space-y-2 text-sm"><span>Telefone</span><input className={fieldClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></label>
          <label className="space-y-2 text-sm"><span>E-mail</span><input type="email" className={fieldClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="space-y-2 text-sm"><span>Origem</span><select className={fieldClass} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}><option>Meta Ads</option><option>Google</option><option>WhatsApp</option><option>Indicação</option><option>Portal</option><option>Orgânico</option></select></label>
          <label className="space-y-2 text-sm"><span>Objetivo</span><select className={fieldClass} value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })}><option value="moradia">Moradia</option><option value="investimento">Investimento</option><option value="locacao">Locação</option></select></label>
          <label className="space-y-2 text-sm"><span>Dormitórios</span><input type="number" min="0" className={fieldClass} value={form.bedrooms} onChange={(e) => setForm({ ...form, bedrooms: e.target.value })} /></label>
          <label className="space-y-2 text-sm"><span>Orçamento mínimo</span><input type="number" min="0" className={fieldClass} value={form.budget_min} onChange={(e) => setForm({ ...form, budget_min: e.target.value })} /></label>
          <label className="space-y-2 text-sm"><span>Orçamento máximo</span><input type="number" min="0" className={fieldClass} value={form.budget_max} onChange={(e) => setForm({ ...form, budget_max: e.target.value })} /></label>
        </div>
        <label className="block space-y-2 text-sm"><span>Regiões preferidas</span><input className={fieldClass} placeholder="Perdizes, Pinheiros, Vila Madalena" value={form.preferred_regions} onChange={(e) => setForm({ ...form, preferred_regions: e.target.value })} /></label>
        <label className="block space-y-2 text-sm"><span>Observações</span><textarea rows={5} className={fieldClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
        {error && <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">{error}</div>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()} className="rounded-xl border border-zinc-700 px-4 py-3 text-sm font-semibold">Cancelar</button>
          <button disabled={saving} className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 disabled:opacity-60">{saving ? "Salvando..." : "Criar lead"}</button>
        </div>
      </form>
    </div>
  );
}
