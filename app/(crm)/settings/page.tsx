"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Organization = { id: string; name: string; slug: string | null; plan: string; active: boolean };

export default function SettingsPage() {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: profile } = await supabase.from("profiles").select("organization_id").eq("id", auth.user.id).maybeSingle();
      if (!profile?.organization_id) return;
      const { data } = await supabase.from("organizations").select("id,name,slug,plan,active").eq("id", profile.organization_id).single();
      if (data) {
        const org = data as Organization;
        setOrganization(org);
        setName(org.name);
        setSlug(org.slug || "");
      }
    }
    load();
  }, []);

  async function save() {
    if (!organization || !name.trim()) return;
    setSaving(true);
    setMessage(null);
    const { error } = await supabase.from("organizations").update({ name: name.trim(), slug: slug.trim() || null }).eq("id", organization.id);
    setMessage(error ? error.message : "Configurações salvas com sucesso.");
    setSaving(false);
  }

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-violet-400">Atlas Governance</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Configurações da operação</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">Identidade da empresa, plano, segurança e políticas de aprovação para o Atlas AI.</p>
      </header>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h2 className="text-lg font-bold">Organização</h2>
          <div className="mt-6 space-y-5">
            <label className="block"><span className="text-sm text-zinc-400">Nome da empresa</span><input value={name} onChange={e => setName(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-blue-500" /></label>
            <label className="block"><span className="text-sm text-zinc-400">Slug</span><input value={slug} onChange={e => setSlug(e.target.value)} className="mt-2 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none focus:border-blue-500" /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-xs uppercase tracking-wider text-zinc-500">Plano</p><p className="mt-2 font-bold capitalize">{organization?.plan || "—"}</p></div>
              <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4"><p className="text-xs uppercase tracking-wider text-zinc-500">Status</p><p className="mt-2 font-bold">{organization?.active ? "Ativo" : "Indisponível"}</p></div>
            </div>
            <button onClick={save} disabled={saving || !organization} className="rounded-xl bg-white px-5 py-3 text-sm font-bold text-zinc-950 disabled:opacity-50">{saving ? "Salvando..." : "Salvar alterações"}</button>
            {message ? <p className="text-sm text-zinc-300">{message}</p> : null}
          </div>
        </article>

        <article className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
          <h2 className="text-lg font-bold">Aprovação humana</h2>
          <div className="mt-5 space-y-4 text-sm text-zinc-300">
            {["Publicação de campanhas", "Disparos em massa", "Alterações financeiras", "Exclusão de dados", "Ações autônomas de agentes"].map(item => <div key={item} className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950 p-4"><span>{item}</span><span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">Obrigatória</span></div>)}
          </div>
        </article>
      </section>
    </div>
  );
}
