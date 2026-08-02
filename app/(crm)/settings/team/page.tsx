"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

type Role = "director" | "superintendent" | "manager" | "broker";
type Profile = { id: string; full_name: string | null; commercial_role: Role | null; role: string; reports_to: string | null; active: boolean; creci: string | null };
type TeamData = { viewer: { id: string; role: Role; allowedNewRoles: Role[] }; profiles: Profile[] };

const labels: Record<Role, string> = { director: "Diretor", superintendent: "Superintendente", manager: "Gerente", broker: "Corretor" };
const expected: Partial<Record<Role, Role>> = { superintendent: "director", manager: "superintendent", broker: "manager" };
const ORDEM: Role[] = ["director", "superintendent", "manager", "broker"];

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

/**
 * ── AS CLASSES DE CAMPO QUE NUNCA PINTARAM ─────────────────────────────────
 *
 * O formulário usava `bg-slate-950/70` + `text-white`. A leitura fácil seria
 * "fundo escuro cravado, texto que vira com o tema" — e ela está ERRADA. Medido
 * dentro de `.atlas-app-shell`, que é onde estas telas de fato vivem:
 *
 *     :root[data-theme="light"] .atlas-app-shell input → background: var(--atlas-surface)
 *     .atlas-app-shell input                           → background: rgba(5,10,20,.7)
 *
 * As duas regras são UNLAYERED e ganham de `@layer utilities`: nenhum
 * `bg-*` do Tailwind chegava a pintar um `input` deste produto. Medido antes e
 * depois, o campo dá 18,72:1 no claro e 17,05:1 no escuro — passava, e continua
 * passando. Não havia defeito de contraste aqui.
 *
 * (Vale registrar o erro de instrumento, porque ele é a armadilha: medindo o
 * mesmo HTML FORA do `.atlas-app-shell` o campo aparece em 1,56:1. Esse
 * ambiente não existe para esta página — a medição estava certa sobre uma tela
 * que ninguém abre.)
 *
 * O que a troca resolve é outra coisa: as classes eram MORTAS e mentiam sobre
 * quem manda no campo, e cada tela da área escrevia a sua. A receita abaixo é
 * literalmente a mesma string de `/settings` e `/settings/profile` — um campo
 * só, com alvo de 44px e foco visível declarados onde dá para conferir.
 */
const fieldClass =
  `min-h-11 w-full rounded-xl border border-[rgba(148,163,184,0.14)] bg-white/[0.03] px-4 text-sm text-[var(--atlas-texto-forte)] transition-colors placeholder:text-[var(--atlas-texto-fraco)] focus:border-[color:var(--atlas-accent)] ${focusRing}`;

function profileRole(profile: Profile): Role {
  return profile.commercial_role || (profile.role === "admin" ? "director" : profile.role as Role);
}

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

  const supervisorRole = form.commercialRole ? expected[form.commercialRole] : undefined;
  const supervisors = useMemo(() => {
    if (!data || !supervisorRole) return [];
    return data.profiles.filter((profile) => profile.active && profileRole(profile) === supervisorRole);
  }, [data, supervisorRole]);

  const ordered = useMemo(() => [...(data?.profiles ?? [])].sort((a, b) => (
    ORDEM.indexOf(profileRole(a)) - ORDEM.indexOf(profileRole(b)) || (a.full_name || "").localeCompare(b.full_name || "")
  )), [data]);

  const counts = useMemo(
    () => Object.fromEntries(ORDEM.map((role) => [role, ordered.filter((profile) => profileRole(profile) === role && profile.active).length])) as Record<Role, number>,
    [ordered],
  );
  /* Quem está no escopo e NÃO entra: o número que explica por que a soma dos
     quatro contadores não bate com o tamanho da lista. */
  const inativos = useMemo(() => ordered.filter((profile) => !profile.active).length, [ordered]);

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

  if (loading) {
    return <div className="cc6-panel-quiet animate-pulse p-6 text-sm text-[var(--atlas-texto-fraco)]">Carregando hierarquia comercial...</div>;
  }
  if (!data) {
    return (
      <div
        role="alert"
        className="cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-sm leading-6 text-[var(--atlas-estado-perigo)]"
        style={{ "--cc6-sev": "var(--atlas-danger)" } as CSSProperties}
      >
        {notice?.text || "Gestão de equipe indisponível para este perfil."}
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-12" data-team-layout="cc6-hierarquia">
      <PageHeader
        eyebrow="Estrutura comercial"
        title="Equipe com visão por nível"
        description="Cada profissional enxerga somente sua estrutura: diretoria completa, superintendência abaixo dela, gerência no próprio time e corretor na carteira individual."
      />

      {/* Contadores por nível — única superfície 3D da tela. */}
      <section aria-label="Composição da estrutura">
        <TiltShell className="cc6-panel cc6-reveal p-5 sm:p-6" delayMs={40}>
          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-4">
            {ORDEM.map((role) => (
              <div key={role}>
                <p className="cc6-metric-value text-xl leading-none">{counts[role]}</p>
                <p className="cc6-metric-label mt-1.5">{labels[role]}{counts[role] === 1 ? "" : "s"} ativos</p>
              </div>
            ))}
            {/*
              EMOJI RECUSADO AQUI, de propósito. O ⛔ marca o estado "não entra"
              nas LINHAS da lista, onde há varredura e a forma resolve. Este é
              um chip único, lido uma vez: a palavra já basta, e repetir o
              símbolo o transformaria em decoração.
              Recusada também a borda de atenção: quem está sem acesso pode ter
              sido desligado de propósito. O número é fato, não alarme — e
              alarme inventado é métrica inventada.
            */}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {inativos ? <span className="cc6-chip">{inativos} sem acesso</span> : null}
              <span className="cc6-chip">RLS e hierarquia ativas</span>
            </div>
          </div>
        </TiltShell>
      </section>

      <div aria-live="polite" className="empty:hidden">
        {notice ? (
          <div
            role="status"
            className={`cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-sm leading-6 ${notice.ok ? "text-[var(--atlas-estado-sucesso)]" : "text-[var(--atlas-estado-perigo)]"}`}
            style={{ "--cc6-sev": notice.ok ? "var(--atlas-success)" : "var(--atlas-danger)" } as CSSProperties}
          >
            {notice.text}
          </div>
        ) : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_.8fr] xl:items-start">
        <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "80ms" }} aria-labelledby="team-scope-title">
          <header className="px-5 pb-3 pt-5">
            <p className="cc6-eyebrow">Escopo</p>
            <h2 id="team-scope-title" className="mt-1 text-xl font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Pessoas no seu escopo</h2>
            <p className="mt-1 text-sm leading-6 text-[var(--atlas-texto-fraco)]">Estruturas paralelas e outras empresas ficam ocultas.</p>
          </header>
          <div>
            {ordered.map((profile) => {
              const role = profileRole(profile);
              const leader = data.profiles.find((item) => item.id === profile.reports_to);
              const manageable = data.viewer.allowedNewRoles.includes(role) && profile.id !== data.viewer.id;
              return (
                <article
                  key={profile.id}
                  className="cc6-hairline flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-semibold text-[var(--atlas-texto-forte)]">{profile.full_name || "Perfil sem nome"}</h3>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">
                      <span>{labels[role]}</span>
                      {leader ? <><ChevronRight aria-hidden="true" className="h-3 w-3" /><span>{leader.full_name}</span></> : null}
                      {profile.creci ? <span>· CRECI {profile.creci}</span> : null}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {/*
                      O ícone daqui era um `CheckCircle2` FIXO: a mesma marca de
                      "confirmado" aparecia ao lado de "Ativo" e ao lado de
                      "Inativo". Num perfil desligado, o desenho dizia o
                      contrário do texto.
                      O emoji entra só na EXCEÇÃO — quem não entra no sistema —,
                      e é a única marca da linha que sobrevive em escala de
                      cinza. `aria-hidden` porque a palavra ao lado já diz o
                      estado; o leitor de tela não deve ouvir "proibido inativo".
                    */}
                    {profile.active
                      ? <StatusBadge tone="success">Ativo</StatusBadge>
                      : <StatusBadge tone="neutral"><span aria-hidden="true">⛔</span> Inativo</StatusBadge>}
                    {manageable ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => void toggle(profile)}
                        aria-label={`${profile.active ? "Desativar" : "Reativar"} acesso de ${profile.full_name || "perfil sem nome"}`}
                        className={`cc6-ghost-btn min-h-11 disabled:opacity-40 ${focusRing}`}
                      >
                        {profile.active ? "Desativar" : "Reativar"}
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <form onSubmit={invite} className="cc6-panel cc6-reveal h-fit p-5 sm:p-6" style={{ animationDelay: "120ms" }} aria-labelledby="team-invite-title">
          <p className="cc6-eyebrow">Novo acesso</p>
          <h2 id="team-invite-title" className="mt-1 text-xl font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Convidar profissional</h2>
          <p className="mt-1 text-sm leading-6 text-[var(--atlas-texto-fraco)]">O acesso começa após confirmar o e-mail.</p>

          <div className="cc6-hairline mt-4 grid gap-3 pt-4">
            <label className="block text-rotulo font-medium leading-4 text-[var(--atlas-texto-medio)]">Nome completo
              <input required maxLength={120} className={`${fieldClass} mt-1.5`} value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} />
            </label>
            <label className="block text-rotulo font-medium leading-4 text-[var(--atlas-texto-medio)]">E-mail profissional
              <input required type="email" className={`${fieldClass} mt-1.5`} value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </label>
            <label className="block text-rotulo font-medium leading-4 text-[var(--atlas-texto-medio)]">Função
              <select required className={`${fieldClass} mt-1.5`} value={form.commercialRole} onChange={(event) => chooseRole(event.target.value as Role)}>
                <option value="">Selecione</option>
                {data.viewer.allowedNewRoles.map((role) => <option key={role} value={role}>{labels[role]}</option>)}
              </select>
            </label>
            {form.commercialRole ? (
              <label className="block text-rotulo font-medium leading-4 text-[var(--atlas-texto-medio)]">Responsável direto
                <select required className={`${fieldClass} mt-1.5`} value={form.reportsTo} onChange={(event) => setForm({ ...form, reportsTo: event.target.value })}>
                  <option value="">Selecione</option>
                  {supervisors.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name} · {labels[profileRole(profile)]}</option>)}
                </select>
              </label>
            ) : null}
          </div>

          {/*
            LISTA VAZIA NÃO PODE PARECER LISTA CARREGADA. Sem nenhum supervisor
            ativo do nível certo, o `select` abria com "Selecione" e mais nada, o
            `required` bloqueava o envio e a tela não dizia por quê. Agora a
            ausência é escrita, e diz qual nível precisa existir antes.
          */}
          {form.commercialRole && supervisorRole && supervisors.length === 0 ? (
            <p
              role="status"
              className="cc6-sev-band cc6-panel-quiet mt-3 py-2.5 pl-4 pr-3 text-sm leading-6 text-[var(--atlas-texto-medio)]"
              style={{ "--cc6-sev": "var(--atlas-warning)" } as CSSProperties}
            >
              Nenhum {labels[supervisorRole].toLowerCase()} ativo no seu escopo para receber este profissional. Ative um antes de enviar o convite.
            </p>
          ) : null}

          {/*
            O DEFEITO QUE ESTA FRASE FECHA: o acesso criado depois do primeiro da
            empresa nasce DESLIGADO (`active = primeiro_perfil`), e ligar não é
            só marcar uma caixa — a hierarquia comercial exige função e
            responsável direto na cadeia certa, senão o banco recusa. Sem isso
            escrito, quem convida vê a pessoa aparecer como "Inativo" logo depois
            de um convite bem-sucedido e conclui que a tela quebrou.
          */}
          <p className="mt-4 text-sm leading-6 text-[var(--atlas-texto-medio)]">
            <span className="font-semibold text-[var(--atlas-texto-forte)]">Convite enviado não é acesso liberado.</span>{" "}
            A pessoa entra na lista desligada e só passa a trabalhar depois de confirmar o e-mail. Função e
            responsável direto não são cadastro: são o que a hierarquia exige para que a ativação possa
            acontecer — sem os dois na cadeia certa, o banco recusa.
          </p>

          <button
            type="submit"
            disabled={saving || !form.commercialRole}
            className={`atlas-button-primary mt-4 min-h-11 w-full disabled:opacity-40 ${focusRing}`}
          >
            {saving ? "Processando..." : "Enviar convite seguro"}
          </button>
          <p className="mt-3 text-center text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">Função, superior e empresa são validados novamente pela API e pelo banco.</p>
        </form>
      </div>
    </div>
  );
}
