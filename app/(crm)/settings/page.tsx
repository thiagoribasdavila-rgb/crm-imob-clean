"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { supabase } from "@/lib/supabase";
import { AtlasActionLink } from "@/components/atlas/action-link";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { alvoDaIntencao, lerIntencaoDaJanela } from "@/lib/atlas/intencao-da-url";

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
  `min-h-11 w-full rounded-xl border border-[rgba(148,163,184,0.14)] bg-white/[0.03] px-4 text-sm text-[var(--atlas-texto-forte)] transition-colors placeholder:text-[var(--atlas-texto-fraco)] focus:border-[color:var(--atlas-accent)] ${focusRing}`;

export default function SettingsPage() {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [chegouParaRevisarAmbiente, setChegouParaRevisarAmbiente] = useState(false);

  /**
   * A chegada com intenção precisa ser VISÍVEL — e honesta.
   *
   * O catálogo (`lib/atlas/navigation.ts`) promete, na ação primária "Revisar
   * ambiente", `/settings?view=environment` com o resultado "Confirmar que
   * parâmetros críticos estão coerentes". Até 2026-07-29 esta tela não lia
   * parâmetro nenhum: quem apertava o botão caía neste hub — identidade da
   * empresa, política de aprovação e índice de áreas — sem uma linha sobre
   * ambiente e sem nada explicando por que estava ali. Promessa decorativa, e
   * invisível em teste, porque a tela ABRIA.
   *
   * E este hub continua NÃO sendo a tela do ambiente: variável obrigatória,
   * segredo e dependência do servidor são conferidos no inventário sanitizado
   * de /atlas-v3/governance — é para lá que o próprio roteiro de homologação
   * manda a diretoria no item "Segredos do ambiente"
   * (`lib/atlas/homologation-checklist.ts`) — e a coerência das dependências em
   * /atlas-v3/developer/health. Repetir aqui um resumo daquele payload criaria
   * uma segunda superfície para o mesmo dado, que é a classe de defeito que
   * este repositório mais pagou; e faria pior, porque /settings abre para
   * superintendente e gerente enquanto a auditoria de segredos é exclusiva da
   * diretoria — o "resumo" nasceria como um 403 vermelho no meio das
   * configurações. Então a tela não finge revisar ambiente: ela assume que não
   * revisa e entrega o caminho verdadeiro.
   *
   * `window.location.search` no efeito de montagem em vez de `useSearchParams`
   * porque o hook exigiria fronteira <Suspense> nesta página cliente, e a
   * semântica desejada é exatamente a do efeito: a URL define o estado da
   * chegada e a pessoa assume a partir dali. Intenção ausente, `view` com outro
   * alvo ou parâmetro inventado não passam pelo leitor compartilhado e não
   * mudam nada — a tela abre igual à de sempre.
   */
  useEffect(() => {
    if (alvoDaIntencao(lerIntencaoDaJanela(), "visao") === "environment") setChegouParaRevisarAmbiente(true);
  }, []);

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

      {/* Sem esta faixa, quem apertou "Revisar ambiente" varre o hub atrás de
          uma seção que não existe e conclui que o ambiente está sem problema —
          exatamente a leitura oposta da que o botão deveria provocar. */}
      {chegouParaRevisarAmbiente ? (
        <div
          className="cc6-sev-band cc6-panel-quiet flex flex-wrap items-center justify-between gap-3 py-3 pl-4 pr-3"
          role="status"
          style={{ "--cc6-sev": "var(--atlas-warning)" } as CSSProperties}
        >
          <p className="max-w-[62ch] text-sm leading-6 text-[var(--atlas-texto-medio)]">
            <span className="font-semibold text-[var(--atlas-texto-forte)]">O ambiente não se confere aqui — aqui se governa a organização.</span>{" "}
            Esta tela trata da identidade da empresa, da política de aprovação humana e das áreas de
            gestão. Variáveis obrigatórias, segredos e dependências do servidor têm um inventário
            próprio, que mostra o que está configurado sem nunca revelar valor.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <AtlasActionLink
              href="/atlas-v3/governance"
              label="Revisar variáveis do ambiente"
              priority="primary"
              showArrow
            />
            <AtlasActionLink
              href="/atlas-v3/developer/health"
              label="Saúde das dependências"
              priority="secondary"
            />
          </div>
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[1.1fr_.9fr] xl:items-start">
        {/* Identidade da organização (única superfície com 3D): nome + slug
            editáveis, plano e status como chips — sem cards dedicados. */}
        <section aria-labelledby="settings-org-title">
          <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="cc6-eyebrow">Organização</p>
                <h2 id="settings-org-title" className="mt-1 truncate text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
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
              <label className="block text-xs font-medium text-[var(--atlas-texto-medio)]">Nome da empresa
                <input value={name} onChange={(e) => setName(e.target.value)} className={`${fieldClass} mt-1.5`} />
              </label>
              <label className="block text-xs font-medium text-[var(--atlas-texto-medio)]">Slug
                <input value={slug} onChange={(e) => setSlug(e.target.value)} className={`${fieldClass} mt-1.5`} />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={save} disabled={saving || !organization} className="atlas-button-primary min-h-11 disabled:opacity-50">
                {saving ? "Salvando…" : "Salvar alterações"}
              </button>
              {message ? <p role="status" className="text-sm text-[var(--atlas-texto-medio)]">{message}</p> : null}
            </div>
          </TiltShell>
        </section>

        {/* Política de aprovação humana: um badge para a política inteira,
            escopos em lista simples — sem cinco badges idênticos. */}
        <section
          aria-labelledby="settings-approval-title"
          className="cc6-sev-band cc6-panel cc6-reveal p-5"
          style={{ "--cc6-sev": "var(--atlas-success)", animationDelay: "100ms" } as CSSProperties}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="cc6-eyebrow">Aprovação humana</p>
              <h2 id="settings-approval-title" className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">
                Obrigatória por política
              </h2>
            </div>
            <StatusBadge tone="success">Sempre ativa</StatusBadge>
          </div>
          <ul className="mt-3 space-y-1.5 text-sm text-[var(--atlas-texto-medio)]">
            {approvalScopes.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="cc6-ok">✓</span>
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-rotulo leading-4 text-[var(--atlas-texto-fraco)]">Nenhuma dessas ações executa sem uma pessoa aprovar.</p>
        </section>
      </section>

      <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "140ms" }} aria-labelledby="settings-areas-title">
        <header className="px-5 pb-3 pt-5">
          <p className="cc6-eyebrow">Índice</p>
          <h2 id="settings-areas-title" className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Áreas de gestão</h2>
        </header>
        <div>
          {areas.map(([href, label, detail], index) => (
            <Link
              key={href}
              href={href}
              className={`cc6-hairline cc6-reveal group flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-[rgba(75,141,248,0.04)] ${focusRing}`}
              style={{ animationDelay: `${160 + index * 30}ms` }}
            >
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-[var(--atlas-texto-forte)]">
                {label}
                <span className="ml-2 hidden text-[12px] font-normal text-[var(--atlas-texto-fraco)] sm:inline">{detail}</span>
              </span>
              <span aria-hidden="true" className="text-[var(--atlas-texto-fraco)] transition-colors group-hover:text-[color:var(--atlas-accent-hover)]">→</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
