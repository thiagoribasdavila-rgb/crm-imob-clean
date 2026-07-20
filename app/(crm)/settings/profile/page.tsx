"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { SessionSecurityPanel } from "./SessionSecurityPanel";

type Profile = { id: string; name: string | null; role: string; availability_status: string | null };

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const inputClass =
  `min-h-11 w-full rounded-xl border border-[rgba(148,163,184,0.14)] bg-white/[0.03] px-4 text-sm text-[#e8eef8] transition-colors placeholder:text-[#6b7890] focus:border-[color:var(--atlas-accent)] ${focusRing}`;

/* Atalhos do corretor: uma linha por destino, sem prosa. */
const shortcuts: Array<[string, string]> = [
  ["/dashboard", "Minhas prioridades"],
  ["/calendar", "Agenda e visitas"],
  ["/leads", "Minha carteira"],
  ["/settings/ai", "Preferências da IA"],
];

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

  if (loading) return <div className="cc6-panel-quiet animate-pulse p-6 text-sm text-[#6b7890]">Carregando seu perfil…</div>;
  if (!profile) return (
    <div role="alert" className="cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-sm text-[#fb7185]" style={{ "--cc6-sev": "#fb7185" } as CSSProperties}>
      Não foi possível localizar seu perfil.
    </div>
  );
  const initials = (profile.name || email || "AT").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-4 pb-10" data-profile-layout="cc6-identity">
      <PageHeader eyebrow="Configurações · Minha conta" title="Identidade e segurança" />

      <div aria-live="polite" className="empty:hidden">
        {notice ? (
          <div
            role="status"
            className={`cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-sm ${notice.tone === "success" ? "text-[#34d399]" : "text-[#fb7185]"}`}
            style={{ "--cc6-sev": notice.tone === "success" ? "#34d399" : "#fb7185" } as CSSProperties}
          >
            {notice.text}
          </div>
        ) : null}
      </div>

      {/* Identidade (única superfície com 3D): nome, e-mail, papel e
          disponibilidade exibidos uma única vez; só o nome é editável. */}
      <section aria-label="Identidade profissional">
        <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
          <form onSubmit={saveProfile} className="flex flex-col gap-5 lg:flex-row lg:items-start">
            <div className="flex min-w-0 items-center gap-4 lg:w-72 lg:shrink-0">
              <span aria-hidden="true" className="cc6-panel-quiet grid h-16 w-16 shrink-0 place-items-center text-xl font-semibold text-[#e8eef8]">
                {initials}
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold tracking-tight text-[#e8eef8]">{profile.name || "Usuário Atlas"}</h2>
                <p className="cc6-num mt-0.5 truncate text-[12px] text-[#6b7890]" title={email}>{email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge tone="info">{profile.role}</StatusBadge>
                  <span className="cc6-chip">{profile.availability_status || "OFFLINE"}</span>
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1 lg:border-l lg:border-[rgba(148,163,184,0.12)] lg:pl-5">
              <label className="block text-xs font-medium text-[#aab6ca]">Nome completo
                <input className={`${inputClass} mt-1.5`} value={profile.name || ""} onChange={(event) => setProfile({ ...profile, name: event.target.value })} />
              </label>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-[11px] leading-4 text-[#6b7890]">Foto, telefone e CRECI entram quando homologados no banco.</p>
                <button type="submit" disabled={saving} className="atlas-button-primary disabled:opacity-50">
                  {saving ? "Salvando…" : "Salvar perfil"}
                </button>
              </div>
            </div>
          </form>
        </TiltShell>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr] xl:items-start">
        <form onSubmit={changePassword} className="cc6-panel cc6-reveal p-5" style={{ animationDelay: "100ms" }} aria-labelledby="profile-password-title">
          <p className="cc6-eyebrow">Segurança</p>
          <h2 id="profile-password-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Trocar senha</h2>
          <p className="cc6-num mt-1 text-[11px] text-[#6b7890]">mínimo 12 caracteres · senha atual exigida</p>
          <div className="cc6-hairline mt-4 grid gap-3 pt-4">
            <label className="sr-only" htmlFor="profile-current-password">Senha atual</label>
            <input id="profile-current-password" className={inputClass} required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} placeholder="Senha atual" />
            <label className="sr-only" htmlFor="profile-new-password">Nova senha</label>
            <input id="profile-new-password" className={inputClass} required minLength={12} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="Nova senha" />
            <label className="sr-only" htmlFor="profile-confirm-password">Confirmar nova senha</label>
            <input id="profile-confirm-password" className={inputClass} required minLength={12} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirmar nova senha" />
          </div>
          <button type="submit" disabled={saving} className="cc6-ghost-btn mt-4 min-h-11 disabled:opacity-50">Alterar senha</button>
        </form>

        <section className="cc6-panel cc6-reveal p-5" style={{ animationDelay: "130ms" }} aria-labelledby="profile-shortcuts-title">
          <p className="cc6-eyebrow">Atalhos</p>
          <h2 id="profile-shortcuts-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Continuar o trabalho</h2>
          <div className="mt-2">
            {shortcuts.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className={`cc6-hairline group flex min-h-11 items-center justify-between gap-3 text-sm font-medium text-[#aab6ca] transition-colors hover:text-[#e8eef8] ${focusRing}`}
              >
                {label}
                <span aria-hidden="true" className="text-[#6b7890] transition-colors group-hover:text-[color:var(--atlas-accent-hover)]">→</span>
              </Link>
            ))}
          </div>
        </section>
      </section>

      <SessionSecurityPanel />
    </div>
  );
}
