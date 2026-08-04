"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { SessionSecurityPanel } from "./SessionSecurityPanel";
import { BrokerConnectionPanel } from "@/components/whatsapp/broker-connection-panel";
import {
  validarCadastro, validarFoto, caminhoDaFoto, formatarTelefone, LIMITE_DA_BIO,
  TIPOS_DE_IMAGEM_ACEITOS,
} from "@/lib/crm/cadastro-do-corretor";

type Profile = {
  id: string; name: string | null; role: string; availability_status: string | null;
  full_name: string | null; phone: string | null; creci: string | null; bio: string | null; avatar_url: string | null;
};

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const inputClass =
  `min-h-11 w-full rounded-xl border border-[rgba(148,163,184,0.14)] bg-white/[0.03] px-4 text-sm text-[var(--atlas-texto-forte)] transition-colors placeholder:text-[var(--atlas-texto-fraco)] focus:border-[color:var(--atlas-accent)] ${focusRing}`;

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
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  useEffect(() => { void (async () => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) { setLoading(false); return; }
    setEmail(auth.user.email || "");
    const { data } = await supabase.from("profiles").select("id,name,role,availability_status,full_name,phone,creci,bio,avatar_url").eq("id", auth.user.id).single();
    setProfile(data as Profile | null); setLoading(false);
  })(); }, []);

  async function saveProfile(event: FormEvent) {
    event.preventDefault(); if (!profile) return; setSaving(true); setNotice(null);
    // A tela grava DIRETO no Supabase (política `profiles_update_self`): não há
    // rota no meio para validar. Ou a regra vive no módulo puro, ou vive
    // espalhada em onChange — e é assim que um CRECI com espaço no fim vira um
    // CRECI diferente do mesmo CRECI.
    const veredito = validarCadastro({
      fullName: profile.full_name || profile.name, phone: profile.phone, creci: profile.creci, bio: profile.bio,
    });
    if (!veredito.ok) { setNotice({ tone: "error", text: veredito.mensagem }); setSaving(false); return; }
    const { error } = await supabase.from("profiles").update(veredito.valor).eq("id", profile.id);
    if (!error) setProfile({ ...profile, ...veredito.valor });
    setNotice(error ? { tone: "error", text: error.message } : { tone: "success", text: "Perfil atualizado com sucesso." }); setSaving(false);
  }

  /**
   * A foto vai para `profile-avatars`, na PASTA DO PRÓPRIO USUÁRIO — a política
   * do storage exige `foldername(name)[1] = auth.uid()`, e o erro que volta
   * quando o caminho é outro ("violates row-level security") não fala em pasta.
   * Por isso o caminho se monta no módulo, uma vez.
   */
  async function enviarFoto(arquivo: File | null | undefined) {
    if (!profile || !arquivo) return;
    const check = validarFoto(arquivo);
    if (!check.ok) { setNotice({ tone: "error", text: check.mensagem }); return; }
    setEnviandoFoto(true); setNotice(null);
    const caminho = caminhoDaFoto(profile.id, arquivo.type);
    // `upsert` porque o nome do arquivo é fixo: trocar a foto SUBSTITUI, em vez
    // de acumular um arquivo por troca dentro da pasta de cada pessoa.
    const envio = await supabase.storage.from("profile-avatars").upload(caminho, arquivo, { upsert: true, contentType: arquivo.type });
    if (envio.error) { setNotice({ tone: "error", text: `Não consegui enviar a foto: ${envio.error.message}` }); setEnviandoFoto(false); return; }
    const { data: publica } = supabase.storage.from("profile-avatars").getPublicUrl(caminho);
    // O sufixo de tempo derrota o cache do navegador: sem ele, trocar a foto
    // mantém a antiga na tela e a pessoa acha que o envio falhou.
    const url = `${publica.publicUrl}?v=${Date.now()}`;
    const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", profile.id);
    if (error) { setNotice({ tone: "error", text: error.message }); setEnviandoFoto(false); return; }
    setProfile({ ...profile, avatar_url: url });
    setNotice({ tone: "success", text: "Foto atualizada." });
    setEnviandoFoto(false);
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

  if (loading) return <div className="cc6-panel-quiet animate-pulse p-6 text-sm text-[var(--atlas-texto-fraco)]">Carregando seu perfil…</div>;
  if (!profile) return (
    <div role="alert" className="cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-sm text-[var(--atlas-estado-perigo)]" style={{ "--cc6-sev": "var(--atlas-danger)" } as CSSProperties}>
      Não foi possível localizar seu perfil.
    </div>
  );
  const initials = (profile.full_name || profile.name || email || "AT").slice(0, 2).toUpperCase();

  return (
    <div className="space-y-4 pb-10" data-profile-layout="cc6-identity">
      <PageHeader eyebrow="Configurações · Minha conta" title="Identidade e segurança" />

      <div aria-live="polite" className="empty:hidden">
        {notice ? (
          <div
            role="status"
            className={`cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-sm ${notice.tone === "success" ? "text-[var(--atlas-estado-sucesso)]" : "text-[var(--atlas-estado-perigo)]"}`}
            style={{ "--cc6-sev": notice.tone === "success" ? "var(--atlas-success)" : "var(--atlas-danger)" } as CSSProperties}
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
              {/* A foto é um BOTÃO de rótulo, não um ícone decorativo ao lado
                  de um "escolher arquivo": o alvo é a própria imagem, que é
                  onde a pessoa clica por instinto. O input fica escondido mas
                  focável pelo teclado. */}
              <label
                className={`relative grid h-16 w-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-xl ${profile.avatar_url ? "" : "cc6-panel-quiet"} ${focusRing} focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[var(--atlas-accent)]`}
                title="Trocar foto"
              >
                {profile.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span aria-hidden="true" className="text-xl font-semibold text-[var(--atlas-texto-forte)]">{initials}</span>
                )}
                <span className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-micro font-medium text-white">
                  {enviandoFoto ? "enviando…" : "trocar"}
                </span>
                <input
                  type="file"
                  className="sr-only"
                  accept={TIPOS_DE_IMAGEM_ACEITOS.join(",")}
                  disabled={enviandoFoto}
                  onChange={(event) => { void enviarFoto(event.target.files?.[0]); event.target.value = ""; }}
                />
                <span className="sr-only">Trocar foto do perfil</span>
              </label>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">{profile.full_name || profile.name || "Usuário Atlas"}</h2>
                {/* `.cc6-num` recebe um âmbar escuro cravado de uma regra global do tema
                    claro (escrita para o chip de estado "parado há Nd"): o
                    e-mail da própria pessoa saía âmbar, como se fosse alerta, em
                    4,98:1. Sem a classe: 5,84:1 e cinza. */}
                <p className="mt-0.5 truncate text-[12px] text-[var(--atlas-texto-fraco)]" title={email}>{email}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge tone="info">{profile.role}</StatusBadge>
                  <span className="cc6-chip">{profile.availability_status || "OFFLINE"}</span>
                </div>
              </div>
            </div>
            <div className="min-w-0 flex-1 lg:border-l lg:border-[rgba(148,163,184,0.12)] lg:pl-5">
              {/* Estes campos existiam no banco desde 22/07 — `avatar_url`,
                  `phone`, `creci`, `bio` — junto com o bucket e as políticas de
                  envio. A tela dizia "entram quando homologados no banco" e o
                  resultado, medido em 03/08/2026, era 26 perfis com ZERO foto,
                  ZERO telefone, ZERO CRECI e ZERO arquivo no bucket. Nada estava
                  quebrado: faltava o formulário. */}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-medium text-[var(--atlas-texto-medio)] sm:col-span-2">Nome completo
                  <input
                    className={`${inputClass} mt-1.5`}
                    value={profile.full_name || profile.name || ""}
                    onChange={(event) => setProfile({ ...profile, full_name: event.target.value, name: event.target.value })}
                    placeholder="Nome e sobrenome — é o que a lead vê"
                    autoComplete="name"
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--atlas-texto-medio)]">Telefone
                  <input
                    className={`${inputClass} mt-1.5`}
                    value={formatarTelefone(profile.phone)}
                    onChange={(event) => setProfile({ ...profile, phone: event.target.value })}
                    placeholder="(11) 98765-4321"
                    inputMode="tel"
                    autoComplete="tel"
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--atlas-texto-medio)]">CRECI
                  <input
                    className={`${inputClass} mt-1.5`}
                    value={profile.creci || ""}
                    onChange={(event) => setProfile({ ...profile, creci: event.target.value })}
                    placeholder="123456-SP"
                  />
                </label>
                <label className="block text-xs font-medium text-[var(--atlas-texto-medio)] sm:col-span-2">
                  Apresentação
                  {/* O contador só aparece perto do limite: número permanente ao
                      lado de campo vazio é ruído, e some do olhar justamente
                      quando passaria a importar. */}
                  {(profile.bio || "").length > LIMITE_DA_BIO - 60 ? (
                    <span className={`ml-2 tabular-nums ${(profile.bio || "").length > LIMITE_DA_BIO ? "text-[var(--atlas-estado-perigo)]" : "text-[var(--atlas-texto-fraco)]"}`}>
                      {(profile.bio || "").length}/{LIMITE_DA_BIO}
                    </span>
                  ) : null}
                  <textarea
                    className={`${inputClass} mt-1.5 min-h-20 py-2.5 leading-5`}
                    value={profile.bio || ""}
                    onChange={(event) => setProfile({ ...profile, bio: event.target.value })}
                    placeholder="Uma linha sobre você — aparece para o incorporador parceiro."
                    rows={2}
                  />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                <p className="text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">Telefone e CRECI ficam visíveis para a sua liderança.</p>
                <button type="submit" disabled={saving} className="atlas-button-primary min-h-11 disabled:opacity-50">
                  {saving ? "Salvando…" : "Salvar perfil"}
                </button>
              </div>
            </div>
          </form>
        </TiltShell>
      </section>

      {/* Conectar o WhatsApp fica no PERFIL, não em Integrações: o número é
          pessoal do corretor e quem decide conectar é ele, não a empresa.
          Integrações é onde a liderança configura o que é da empresa. */}
      <section className="cc6-panel cc6-reveal p-5" aria-labelledby="profile-whatsapp-title" style={{ animationDelay: "110ms" }}>
        <p className="cc6-eyebrow">Atendimento</p>
        <h2 id="profile-whatsapp-title" className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Meu WhatsApp</h2>
        {/* Medido: `.atlas-eyebrow` pinta 12px, sem caixa alta e sem tracking;
            `.cc6-eyebrow` pinta 11px mono uppercase. Esta era a ÚNICA das seis
            seções da tela com a primeira — um quinto degrau tipográfico, criado
            por uma classe só. E `text-slate-500` era o único texto da página
            fora dos tokens de cor. */}
        <p className="mt-1 mb-4 text-sm leading-6 text-[var(--atlas-texto-fraco)]">
          Conectando, cada conversa sua entra sozinha no histórico da lead — nada de copiar e colar no fim do dia.
        </p>
        <BrokerConnectionPanel />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr] xl:items-start">
        <form onSubmit={changePassword} className="cc6-panel cc6-reveal p-5" style={{ animationDelay: "100ms" }} aria-labelledby="profile-password-title">
          <p className="cc6-eyebrow">Segurança</p>
          <h2 id="profile-password-title" className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Trocar senha</h2>
          <p className="mt-1 text-rotulo text-[var(--atlas-texto-fraco)] [font-variant-numeric:tabular-nums]">mínimo 12 caracteres · senha atual exigida</p>
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
          <h2 id="profile-shortcuts-title" className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Continuar o trabalho</h2>
          <div className="mt-2">
            {shortcuts.map(([href, label]) => (
              <Link
                key={href}
                href={href}
                className={`cc6-hairline group flex min-h-11 items-center justify-between gap-3 text-sm font-medium text-[var(--atlas-texto-medio)] transition-colors hover:text-[var(--atlas-texto-forte)] ${focusRing}`}
              >
                {label}
                <span aria-hidden="true" className="text-[var(--atlas-texto-fraco)] transition-colors group-hover:text-[color:var(--atlas-accent-hover)]">→</span>
              </Link>
            ))}
          </div>
        </section>
      </section>

      <SessionSecurityPanel />
    </div>
  );
}
