"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

type Organization = { id: string; name: string; slug: string | null; plan: string; active: boolean };

/* Índice do hub: uma linha por área — o destino explica o resto. */
const areas: Array<[string, string, string]> = [
  ["/settings/profile", "Perfil e segurança", "identidade, senha e sessões"],
  ["/settings/team", "Equipe", "pessoas, papéis e disponibilidade"],
  ["/settings/ai", "Inteligência artificial", "modelos, custo e governança"],
  ["/settings/ai-context", "Memória e contexto", "o que a IA sabe da operação"],
  ["/settings/ai-guardrails", "Guardrails", "política de segurança da IA"],
  ["/settings/ai-orchestration", "Orquestração", "rotas e provedores por tarefa"],
  ["/settings/ai-playbooks", "Playbooks", "conhecimento comercial aplicado"],
];

const approvalScopes = [
  "Publicação de campanhas",
  "Disparos em massa",
  "Alterações financeiras",
  "Exclusão de dados",
  "Ações autônomas de agentes",
];

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";
const fieldClass =
  `min-h-11 w-full rounded-xl border border-[rgba(148,163,184,0.14)] bg-white/[0.03] px-4 text-sm text-[#e8eef8] transition-colors placeholder:text-[#6b7890] focus:border-[color:var(--atlas-accent)] ${focusRing}`;

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
    <div className="space-y-4 pb-10" data-settings-layout="cc6-hub">
      <PageHeader
        eyebrow="Atlas Governance"
        title="Configurações da operação"
        description="Identidade da empresa, áreas de gestão e política de aprovação humana."
      />

      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr] xl:items-start">
        {/* Identidade da organização (única superfície com 3D): nome + slug
            editáveis, plano e status como chips — sem cards dedicados. */}
        <section aria-labelledby="settings-org-title">
          <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="cc6-eyebrow">Organização</p>
                <h2 id="settings-org-title" className="mt-1 truncate text-lg font-semibold tracking-tight text-[#e8eef8]">
                  {organization?.name || "Identidade da empresa"}
                </h2>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="cc6-chip">plano {organization?.plan || "—"}</span>
                <StatusBadge tone={organization ? (organization.active ? "success" : "danger") : "neutral"}>
                  {organization ? (organization.active ? "Ativa" : "Indisponível") : "Carregando…"}
                </StatusBadge>
              </div>
            </div>
            <div className="cc6-hairline mt-4 grid gap-3 pt-4 sm:grid-cols-2">
              <label className="block text-xs font-medium text-[#aab6ca]">Nome da empresa
                <input value={name} onChange={(e) => setName(e.target.value)} className={`${fieldClass} mt-1.5`} />
              </label>
              <label className="block text-xs font-medium text-[#aab6ca]">Slug
                <input value={slug} onChange={(e) => setSlug(e.target.value)} className={`${fieldClass} mt-1.5`} />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={save} disabled={saving || !organization} className="atlas-button-primary disabled:opacity-50">
                {saving ? "Salvando…" : "Salvar alterações"}
              </button>
              {message ? <p role="status" className="text-sm text-[#aab6ca]">{message}</p> : null}
            </div>
          </TiltShell>
        </section>

        {/* Política de aprovação humana: um badge para a política inteira,
            escopos em lista simples — sem cinco badges idênticos. */}
        <section
          aria-labelledby="settings-approval-title"
          className="cc6-sev-band cc6-panel cc6-reveal p-5"
          style={{ "--cc6-sev": "#34d399", animationDelay: "100ms" } as CSSProperties}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="cc6-eyebrow">Aprovação humana</p>
              <h2 id="settings-approval-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">
                Obrigatória por política
              </h2>
            </div>
            <StatusBadge tone="success">Sempre ativa</StatusBadge>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-[#aab6ca]">
            {approvalScopes.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="cc6-ok">✓</span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-4 text-[#6b7890]">Nenhuma dessas ações executa sem uma pessoa aprovar.</p>
        </section>
      </section>

      <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "140ms" }} aria-labelledby="settings-areas-title">
        <header className="px-5 pb-3 pt-5">
          <p className="cc6-eyebrow">Índice</p>
          <h2 id="settings-areas-title" className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]">Áreas de gestão</h2>
        </header>
        <div>
          {areas.map(([href, label, detail], index) => (
            <Link
              key={href}
              href={href}
              className={`cc6-hairline cc6-reveal group flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-[rgba(75,141,248,0.04)] ${focusRing}`}
              style={{ animationDelay: `${160 + index * 30}ms` }}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[#e8eef8]">
                {label}
                <span className="ml-2 hidden text-[12px] font-normal text-[#6b7890] sm:inline">{detail}</span>
              </span>
              <span aria-hidden="true" className="text-[#6b7890] transition-colors group-hover:text-[color:var(--atlas-accent-hover)]">→</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
