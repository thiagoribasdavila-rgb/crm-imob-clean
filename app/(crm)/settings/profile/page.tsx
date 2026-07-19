"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { SessionSecurityPanel } from "./SessionSecurityPanel";

type Profile = { id: string; name: string | null; role: string; availability_status: string | null };
const inputClass = "w-full rounded-xl border border-white/10 bg-white/[.035] px-4 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-sky-400/40";

export default function ProfileSettings() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => { void (async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setLoading(false); return; }
    setEmail(auth.user.email || "");
    const { data } = await supabase.from("profiles").select("id,name,role,availability_status").eq("id", auth.user.id).single();
    setProfile(data as Profile | null); setLoading(false);
  })(); }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); if (!profile) return; setSaving(true); setNotice(null);
    const name = profile.name?.trim();
    if (!name) { setNotice({ tone: "error", text: "Informe seu nome completo." }); setSaving(false); return; }
    const { error } = await supabase.from("profiles").update({ name }).eq("id", profile.id);
    setNotice(error ? { tone: "error", text: error.message } : { tone: "success", text: "Perfil atualizado com sucesso." }); setSaving(false);
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setNotice(null);
    if (newPassword.length < 12) { setNotice({ tone: "error", text: "A nova senha precisa ter pelo menos 12 caracteres." }); return; }
    if (newPassword !== confirmPassword) { setNotice({ tone: "error", text: "As senhas não coincidem." }); return; }
    setSaving(true);
    const verified = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    const { error } = verified.error ? verified : await supabase.auth.updateUser({ password: newPassword });
    if (!error) { setCurrentPassword(""); setNewPassword(""); setConfirmPassword(""); }
    setNotice(error ? { tone: "error", text: error.message } : { tone: "success", text: "Senha alterada com segurança." }); setSaving(false);
  }

  if (loading) return <div className="animate-pulse rounded-3xl border border-white/10 bg-white/[.03] p-8 text-slate-400">Carregando seu perfil...</div>;
  if (!profile) return <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-6 text-rose-100">Não foi possível localizar seu perfil.</div>;
  const initials = (profile.name || email || "AT").slice(0, 2).toUpperCase();

  return <div className="space-y-6 pb-10">
    <section className="rounded-[28px] border border-sky-400/15 bg-gradient-to-br from-sky-500/[.12] via-slate-950/70 to-violet-500/[.1] p-6 sm:p-8"><p className="text-xs font-bold uppercase tracking-[.18em] text-sky-300">Minha conta Atlas</p><h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">Perfil do corretor</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">Sua identidade profissional, segurança e atalhos de trabalho em um só lugar.</p></section>
    {notice ? <div role="status" className={`rounded-2xl border p-4 text-sm ${notice.tone === "success" ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100" : "border-rose-400/20 bg-rose-400/10 text-rose-100"}`}>{notice.text}</div> : null}
    <section className="grid gap-6 xl:grid-cols-[.75fr_1.25fr]">
      <aside className="rounded-3xl border border-white/[.08] bg-white/[.025] p-6 text-center"><div className="mx-auto grid h-32 w-32 place-items-center rounded-[32px] border border-sky-400/20 bg-gradient-to-br from-sky-400/20 to-violet-400/20 text-3xl font-black text-white">{initials}</div><h2 className="mt-5 text-xl font-bold text-white">{profile.name || "Usuário Atlas"}</h2><p className="mt-1 text-sm text-slate-500">{email}</p><span className="mt-3 inline-flex rounded-full border border-violet-400/20 bg-violet-400/10 px-3 py-1 text-[10px] font-bold uppercase text-violet-200">{profile.role}</span><p className="mt-6 rounded-2xl border border-white/10 bg-white/[.03] p-4 text-xs leading-5 text-slate-400">Identidade conectada à organização. Foto, telefone e CRECI serão liberados quando esses campos estiverem homologados no banco.</p></aside>
      <form onSubmit={saveProfile} className="rounded-3xl border border-white/[.08] bg-white/[.025] p-6"><h2 className="text-xl font-bold text-white">Dados profissionais</h2><p className="mt-2 text-sm text-slate-500">Mantenha sua identificação principal atualizada.</p><div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-400">Nome completo<input className={`${inputClass} mt-2`} value={profile.name || ""} onChange={(event) => setProfile({ ...profile, name: event.target.value })} /></label><label className="text-xs font-semibold text-slate-400">E-mail<input className={`${inputClass} mt-2 opacity-60`} value={email} disabled /></label><label className="text-xs font-semibold text-slate-400">Disponibilidade<input className={`${inputClass} mt-2 opacity-60`} value={profile.availability_status || "OFFLINE"} disabled /></label><label className="text-xs font-semibold text-slate-400">Papel<input className={`${inputClass} mt-2 opacity-60`} value={profile.role} disabled /></label></div><div className="mt-5 flex justify-end"><button disabled={saving} className="rounded-xl bg-sky-400 px-5 py-3 text-sm font-bold text-slate-950 disabled:opacity-50">{saving ? "Salvando..." : "Salvar perfil"}</button></div></form>
    </section>
    <section className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]"><form onSubmit={changePassword} className="rounded-3xl border border-white/[.08] bg-white/[.025] p-6"><h2 className="text-xl font-bold text-white">Segurança e senha</h2><p className="mt-2 text-sm text-slate-500">Use uma senha exclusiva com pelo menos 12 caracteres.</p><div className="mt-6 grid gap-4"><input className={inputClass} required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Senha atual" /><input className={inputClass} required minLength={12} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Nova senha" /><input className={inputClass} required minLength={12} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirmar nova senha" /></div><button disabled={saving} className="mt-5 rounded-xl border border-white/15 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Alterar senha</button></form><aside className="rounded-3xl border border-violet-400/15 bg-violet-400/[.06] p-6"><h2 className="text-xl font-bold text-white">Atalhos úteis</h2><div className="mt-5 grid gap-3">{[["/dashboard", "Minhas prioridades", "Veja o que precisa ser feito agora"], ["/calendar", "Agenda e visitas", "Organize compromissos do dia"], ["/leads", "Minha carteira", "Acesse seus clientes e follow-ups"], ["/settings/ai", "Preferências da IA", "Ajuste o comportamento do copiloto"]].map(([href, title, detail]) => <Link key={href} href={href} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4 transition hover:border-violet-300/25"><strong className="text-sm text-white">{title} →</strong><p className="mt-1 text-xs text-slate-500">{detail}</p></Link>)}</div></aside></section>
    <SessionSecurityPanel />
  </div>;
}
