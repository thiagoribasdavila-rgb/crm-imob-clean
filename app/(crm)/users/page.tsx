"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { AtlasActionLink } from "@/components/atlas/action-link";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";
import { lerIntencaoDaJanela, pedeCriar } from "@/lib/atlas/intencao-da-url";

type Profile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  access_role: "admin" | "director_decisor" | "director" | "broker";
  commercial_role: string | null;
  active: boolean;
  organization_id: string | null;
  created_at: string;
};

const roleLabel: Record<string, string> = {
  admin: "Administrador",
  director_decisor: "Diretor decisor",
  director: "Diretor comercial",
  broker: "Corretor",
};

const TH_CLASS = "px-4 py-2.5 text-left font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-[#6b7890]";
const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

async function readApiResponse(response: Response) {
  const payload = await response.json().catch(() => null) as { data?: { profiles?: Profile[] }; error?: { message?: string } } | null;
  if (!response.ok) throw new Error(payload?.error?.message || "Não foi possível concluir esta operação.");
  return payload;
}

export default function UsersPage() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chegouParaCriar, setChegouParaCriar] = useState(false);

  /**
   * Quem clica em "Novo usuário" chega em `/users?create=1` — o catálogo
   * (`lib/atlas/navigation.ts`) promete que "o formulário de criação abre
   * sozinho". Esta tela não tem formulário nenhum: ela lista acessos que JÁ
   * existem e liga/desliga cada um. `/api/v1/admin/users` expõe só GET e PATCH,
   * não há POST. A promessa era decorativa no pior formato possível: a pessoa
   * apertava o botão, caía numa tabela somente-leitura e nada na tela dizia por
   * que ela estava ali nem para onde ir.
   *
   * Criar acesso no Atlas é convidar por e-mail, e isso mora em
   * `/settings/team`, junto da validação de hierarquia (quais funções o ator
   * pode criar, quem é o responsável direto) que só existe lá. Reproduzir
   * aquele formulário aqui seria um segundo caminho para a mesma coisa — a
   * classe de defeito que este repositório mais pagou. Então a tela não finge
   * criar: ela assume que não cria e entrega o caminho verdadeiro.
   *
   * Lemos `window.location.search` no efeito de montagem em vez de
   * `useSearchParams` porque o hook exigiria fronteira <Suspense> nesta página
   * cliente, e a semântica desejada é exatamente a do efeito: a URL define o
   * estado da chegada e a pessoa assume a partir dali. Intenção ausente,
   * parâmetro desconhecido ou `create` com outro valor devolvem `null` do leitor
   * compartilhado e não mudam nada — a tela abre igual à de sempre.
   */
  useEffect(() => {
    if (pedeCriar(lerIntencaoDaJanela())) setChegouParaCriar(true);
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      const response = await fetch("/api/v1/admin/users", { cache: "no-store" });
      const payload = await readApiResponse(response).catch((cause: unknown) => {
        if (active) setError(cause instanceof Error ? cause.message : "Não foi possível carregar os acessos.");
        return null;
      });
      if (!active) return;
      setProfiles(payload?.data?.profiles ?? []);
      setLoading(false);
    }
    load();
    return () => { active = false; };
  }, []);

  async function toggleActive(profile: Profile) {
    const next = !profile.active;
    setProfiles(current => current.map(item => item.id === profile.id ? { ...item, active: next } : item));
    const response = await fetch("/api/v1/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profile.id, active: next }) });
    try {
      await readApiResponse(response);
    } catch (cause) {
      setProfiles(current => current.map(item => item.id === profile.id ? profile : item));
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar este acesso.");
    }
  }

  const decisive = [
    { label: "usuários", value: profiles.length, ink: "" },
    { label: "ativos", value: profiles.filter(p => p.active).length, ink: "cc6-ok" },
    { label: "liderança", value: profiles.filter(p => p.access_role !== "broker").length, ink: "" },
  ];

  return (
    <div className="space-y-4 pb-8">
      <PageHeader
        eyebrow="Governança · Acessos"
        title="Usuários e permissões"
        description="Controle administrativo dos acessos oficiais. A hierarquia comercial é administrada na área de Equipe."
        action={{ href: "/brokers", label: "Abrir equipe", priority: "secondary" }}
      />

      {/* Chegada com intenção precisa ser VISÍVEL. Sem esta faixa a pessoa que
          apertou "Novo usuário" olha uma tabela de leitura e conclui que o botão
          não funcionou — ou pior, que o acesso já foi criado. */}
      {chegouParaCriar ? (
        <div
          className="cc6-sev-band cc6-panel-quiet flex flex-wrap items-center justify-between gap-3 py-3 pl-4 pr-3"
          role="status"
        >
          <p className="max-w-[62ch] text-sm leading-6 text-[#aab6ca]">
            <span className="font-semibold text-[#e8eef8]">Aqui não se cria acesso — aqui se governa o que já existe.</span>{" "}
            Um acesso novo começa por convite: o e-mail, a função comercial e o responsável direto são
            definidos e validados em Configurações · Equipe, e a pessoa só passa a aparecer nesta lista
            depois de confirmar o convite.
          </p>
          <AtlasActionLink
            href="/settings/team"
            label="Convidar profissional"
            priority="primary"
            showArrow
          />
        </div>
      ) : null}

      {/* Papel e estado por pessoa começam pelos números — única superfície 3D. */}
      <section aria-label="Resumo dos acessos">
        <TiltShell className="cc6-panel cc6-reveal p-5 sm:p-6">
          <div className="flex flex-wrap gap-x-10 gap-y-4" aria-busy={loading}>
            {decisive.map((metric) => (
              <div key={metric.label}>
                <p className={`cc6-metric-value text-2xl leading-none sm:text-3xl ${loading ? "" : metric.ink}`}>{loading ? "—" : metric.value}</p>
                <p className="cc6-metric-label mt-1.5">{metric.label}</p>
              </div>
            ))}
          </div>
        </TiltShell>
      </section>

      {error ? (
        <div className="cc6-sev-band cc6-panel-quiet py-3 pl-4 pr-3 text-sm leading-6 text-[#fb7185]" role="alert" style={{ "--cc6-sev": "#fb7185" } as CSSProperties}>{error}</div>
      ) : null}

      <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "60ms" }} aria-labelledby="users-table-title">
        <header className="flex flex-wrap items-center justify-between gap-2 px-5 pb-3 pt-5">
          <h2 id="users-table-title" className="text-sm font-semibold tracking-tight text-[#e8eef8]">Acessos oficiais</h2>
          {!loading ? <span className="cc6-chip">{profiles.length} perfis</span> : null}
        </header>
        {loading ? (
          <div className="cc6-hairline space-y-2 p-5">
            {[1, 2, 3, 4].map((row) => <AtlasSkeleton key={row} className="h-12" />)}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-b-[rgba(148,163,184,0.12)]">
                  {["Usuário", "Telefone", "Papel", "Status", "Ação"].map(h => <th key={h} scope="col" className={TH_CLASS}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {profiles.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-6 text-xs leading-5 text-[#6b7890]">Nenhum perfil encontrado — os acessos oficiais da organização aparecem aqui.</td></tr>
                ) : null}
                {profiles.map(profile => (
                  <tr key={profile.id} className="border-t border-[rgba(148,163,184,0.12)] transition-colors first:border-t-0 hover:bg-white/[0.015]">
                    <td className="px-4 py-3.5 font-semibold text-[#e8eef8]">{profile.full_name || "Usuário sem nome"}</td>
                    <td className="cc6-num px-4 py-3.5 text-[#aab6ca]">{profile.phone || "—"}</td>
                    <td className="px-4 py-3.5 text-[#aab6ca]">{roleLabel[profile.access_role] || profile.access_role}</td>
                    <td className="px-4 py-3.5"><StatusBadge tone={profile.active ? "success" : "neutral"}>{profile.active ? "Ativo" : "Inativo"}</StatusBadge></td>
                    <td className="px-4 py-3.5">
                      <button
                        type="button"
                        onClick={() => toggleActive(profile)}
                        aria-label={`${profile.active ? "Desativar" : "Ativar"} acesso de ${profile.full_name || "usuário sem nome"}`}
                        className={`cc6-ghost-btn min-h-11 ${focusRing}`}
                      >
                        {profile.active ? "Desativar" : "Ativar"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
