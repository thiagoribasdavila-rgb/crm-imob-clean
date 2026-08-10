"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronRight, MailPlus, ShieldCheck, UsersRound } from "lucide-react";

type Role = "director" | "superintendent" | "manager" | "broker";
type Profile = { id: string; full_name: string | null; commercial_role: Role | null; role: string; reports_to: string | null; active: boolean; creci: string | null };
type TeamData = { viewer: { id: string; role: Role; allowedNewRoles: Role[] }; profiles: Profile[] };
const labels: Record<Role, string> = { director: "Diretor", superintendent: "Superintendente", manager: "Gerente", broker: "Corretor" };
const expected: Partial<Record<Role, Role>> = { superintendent: "director", manager: "superintendent", broker: "manager" };
const field = "w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-sm text-white outline-none focus:border-sky-400/50";

function profileRole(profile: Profile): Role { return profile.commercial_role || (profile.role === "admin" ? "director" : profile.role as Role); }

export default function TeamSettings() {
  const [data, setData] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", commercialRole: "" as Role | "", reportsTo: "" });

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/v1/team", { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    if (response.ok) setData(payload.data); else setNotice({ ok: false, text: payload?.error?.message || "Não foi possível carregar a equipe." });
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const supervisors = useMemo(() => {
    if (!data || !form.commercialRole) return [];
    const role = expected[form.commercialRole];
    return data.profiles.filter((profile) => profile.active && profileRole(profile) === role);
  }, [data, form.commercialRole]);
  const ordered = useMemo(() => [...(data?.profiles ?? [])].sort((a, b) => {
    const order: Role[] = ["director", "superintendent", "manager", "broker"];
    return order.indexOf(profileRole(a)) - order.indexOf(profileRole(b)) || (a.full_name || "").localeCompare(b.full_name || "");
  }), [data]);
  const counts = useMemo(() => Object.fromEntries((["director", "superintendent", "manager", "broker"] as Role[]).map((role) => [role, ordered.filter((profile) => profileRole(profile) === role && profile.active).length])) as Record<Role, number>, [ordered]);

  function chooseRole(role: Role) {
    const directSupervisor = role === "broker" && data?.viewer.role === "manager" ? data.viewer.id : "";
    setForm((current) => ({ ...current, commercialRole: role, reportsTo: directSupervisor }));
  }

  async function invite(event: FormEvent) {
    event.preventDefault(); setSaving(true); setNotice(null);
    const response = await fetch("/api/v1/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, reportsTo: form.reportsTo || null }) });
    const payload = await response.json().catch(() => null);
    if (response.ok) { setNotice({ ok: true, text: payload.data.message }); setForm({ fullName: "", email: "", commercialRole: "", reportsTo: "" }); await load(); }
    else setNotice({ ok: false, text: payload?.error?.message || "Não foi possível enviar o convite." });
    setSaving(false);
  }

  async function toggle(profile: Profile) {
    setSaving(true); setNotice(null);
    const response = await fetch("/api/v1/team", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profile.id, commercialRole: profileRole(profile), reportsTo: profile.reports_to, active: !profile.active }) });
    const payload = await response.json().catch(() => null);
    setNotice(response.ok ? { ok: true, text: profile.active ? "Acesso desativado com auditoria." : "Acesso reativado." } : { ok: false, text: payload?.error?.message || "Alteração recusada." });
    if (response.ok) await load(); setSaving(false);
  }

  if (loading) return <div className="animate-pulse rounded-3xl border border-white/10 bg-white/[.03] p-8 text-slate-400">Carregando hierarquia comercial...</div>;
  if (!data) return <div className="rounded-3xl border border-rose-400/20 bg-rose-400/10 p-6 text-rose-100">{notice?.text || "Gestão de equipe indisponível para este perfil."}</div>;

  return <div className="space-y-6 pb-12">
    <section className="rounded-[30px] border border-sky-400/15 bg-gradient-to-br from-sky-500/[.13] via-slate-950/80 to-blue-700/[.08] p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-5"><div><p className="text-xs font-bold uppercase tracking-[.2em] text-sky-300">Estrutura comercial</p><h1 className="mt-3 text-3xl font-black text-white sm:text-4xl">Equipe com visão por nível</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-400">Cada profissional enxerga somente sua estrutura: diretoria completa, superintendência abaixo dela, gerência no próprio time e corretor na carteira individual.</p></div><div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-100"><ShieldCheck className="mr-2 inline h-4 w-4" />RLS e hierarquia ativas</div></div>
      <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-4">{(["director", "superintendent", "manager", "broker"] as Role[]).map((role) => <div key={role} className="rounded-2xl border border-white/[.08] bg-black/20 p-4"><p className="text-2xl font-black text-white">{counts[role]}</p><p className="mt-1 text-xs text-slate-500">{labels[role]}{counts[role] === 1 ? "" : "s"} ativos</p></div>)}</div>
    </section>
    {notice ? <div role="status" className={`rounded-2xl border p-4 text-sm ${notice.ok ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100" : "border-rose-400/20 bg-rose-400/10 text-rose-100"}`}>{notice.text}</div> : null}
    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
      <section className="rounded-3xl border border-white/[.08] bg-white/[.025] p-5 sm:p-6"><div className="flex items-center gap-3"><UsersRound className="h-5 w-5 text-sky-300" /><div><h2 className="text-xl font-bold text-white">Pessoas no seu escopo</h2><p className="text-xs text-slate-500">Estruturas paralelas e outras empresas ficam ocultas.</p></div></div><div className="mt-6 space-y-3">{ordered.map((profile) => { const role = profileRole(profile); const leader = data.profiles.find((item) => item.id === profile.reports_to); const manageable = data.viewer.allowedNewRoles.includes(role) && profile.id !== data.viewer.id; return <article key={profile.id} className={`flex flex-wrap items-center justify-between gap-4 rounded-2xl border p-4 ${profile.active ? "border-white/[.07] bg-white/[.025]" : "border-white/[.04] bg-black/20 opacity-60"}`}><div className="flex min-w-0 items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-sky-400/20 to-violet-400/20 text-sm font-black text-white">{(profile.full_name || "AT").slice(0, 2).toUpperCase()}</div><div className="min-w-0"><h3 className="truncate text-sm font-bold text-white">{profile.full_name || "Perfil sem nome"}</h3><p className="mt-1 flex flex-wrap items-center gap-1 text-xs text-slate-500"><span>{labels[role]}</span>{leader ? <><ChevronRight className="h-3 w-3" /><span>{leader.full_name}</span></> : null}{profile.creci ? <span>· CRECI {profile.creci}</span> : null}</p></div></div>{manageable ? <button type="button" disabled={saving} onClick={() => void toggle(profile)} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-300 hover:border-sky-400/30 disabled:opacity-40">{profile.active ? "Desativar" : "Reativar"}</button> : <span className="inline-flex items-center gap-1 text-[11px] text-slate-600"><CheckCircle2 className="h-3.5 w-3.5" />{profile.active ? "Ativo" : "Inativo"}</span>}</article>; })}</div></section>
      <form onSubmit={invite} className="h-fit rounded-3xl border border-sky-400/15 bg-sky-400/[.045] p-5 sm:p-6"><div className="flex items-center gap-3"><MailPlus className="h-5 w-5 text-sky-300" /><div><h2 className="text-xl font-bold text-white">Convidar profissional</h2><p className="text-xs text-slate-500">O acesso começa após confirmar o e-mail.</p></div></div><div className="mt-6 grid gap-4"><label className="text-xs font-semibold text-slate-400">Nome completo<input required maxLength={120} className={`${field} mt-2`} value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label><label className="text-xs font-semibold text-slate-400">E-mail profissional<input required type="email" className={`${field} mt-2`} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label className="text-xs font-semibold text-slate-400">Função<select required className={`${field} mt-2`} value={form.commercialRole} onChange={(event) => chooseRole(event.target.value as Role)}><option value="">Selecione</option>{data.viewer.allowedNewRoles.map((role) => <option key={role} value={role}>{labels[role]}</option>)}</select></label>{form.commercialRole ? <label className="text-xs font-semibold text-slate-400">Responsável direto<select required className={`${field} mt-2`} value={form.reportsTo} onChange={(event) => setForm({ ...form, reportsTo: event.target.value })}><option value="">Selecione</option>{supervisors.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name} · {labels[profileRole(profile)]}</option>)}</select></label> : null}</div><button disabled={saving || !form.commercialRole} className="mt-6 w-full rounded-xl bg-sky-400 px-5 py-3 text-sm font-black text-slate-950 transition hover:bg-sky-300 disabled:opacity-40">{saving ? "Processando..." : "Enviar convite seguro"}</button><p className="mt-3 text-center text-[10px] leading-4 text-slate-600">Função, superior e empresa são validados novamente pela API e pelo banco.</p></form>
    </div>
  </div>;
}
