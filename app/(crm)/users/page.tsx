"use client";

import Link from "next/link";
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

const TH_CLASS = "px-4 py-2.5 text-left font-mono text-micro font-medium uppercase tracking-[0.14em] text-[var(--atlas-texto-fraco)]";
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
  const [errorAoAtivar, setErrorAoAtivar] = useState(false);
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

  /**
   * ── POR QUE A FALHA DE ATIVAÇÃO GANHA UM SEGUNDO PARÁGRAFO ────────────────
   *
   * Ativar não é `update active = true`. O gatilho de hierarquia comercial
   * exige função de acesso E função comercial juntas, com o responsável direto
   * da cadeia certa; quando ele recusa, a rota devolve o genérico "Não foi
   * possível atualizar o acesso." — verdadeiro e inútil. O administrador lia
   * isso e concluía que a tela estava quebrada.
   *
   * A mensagem da API continua na tela EXATAMENTE como veio (ela é o fato). O
   * que entra é a causa mais provável e o lugar onde ela se resolve — e entra
   * declarada como probabilidade, não como diagnóstico: numa falha de rede a
   * frase continua honesta, porque não afirma o motivo.
   */
  async function toggleActive(profile: Profile) {
    const next = !profile.active;
    setError(null);
    setErrorAoAtivar(false);
    setProfiles(current => current.map(item => item.id === profile.id ? { ...item, active: next } : item));
    const response = await fetch("/api/v1/admin/users", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profile.id, active: next }) });
    try {
      await readApiResponse(response);
    } catch (cause) {
      setProfiles(current => current.map(item => item.id === profile.id ? profile : item));
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar este acesso.");
      setErrorAoAtivar(next);
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
          <p className="max-w-[62ch] text-sm leading-6 text-[var(--atlas-texto-medio)]">
            <span className="font-semibold text-[var(--atlas-texto-forte)]">Aqui não se cria acesso — aqui se governa o que já existe.</span>{" "}
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
        <div className="cc6-sev-band cc6-panel-quiet py-3 pl-4 pr-3" role="alert" style={{ "--cc6-sev": "var(--atlas-danger)" } as CSSProperties}>
          <p className="text-sm leading-6 text-[var(--atlas-estado-perigo)]">{error}</p>
          {errorAoAtivar ? (
            <p className="mt-1 max-w-[70ch] text-sm leading-6 text-[var(--atlas-texto-medio)]">
              A recusa mais comum ao ligar um acesso é a hierarquia comercial: o banco só aceita a ativação
              com função comercial e responsável direto definidos na cadeia certa. Ajuste os dois em{" "}
              <Link href="/settings/team" className={`font-semibold text-[color:var(--atlas-accent-hover)] underline underline-offset-2 ${focusRing}`}>Configurações · Equipe</Link>
              {" "}e tente de novo.
            </p>
          ) : null}
        </div>
      ) : null}

      <section className="cc6-panel cc6-reveal overflow-hidden" style={{ animationDelay: "60ms" }} aria-labelledby="users-table-title">
        <header className="px-5 pb-3 pt-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="users-table-title" className="text-sm font-semibold tracking-tight text-[var(--atlas-texto-forte)]">Acessos oficiais</h2>
            {!loading ? <span className="cc6-chip">{profiles.length} perfis</span> : null}
          </div>
          {/*
            O DEFEITO QUE ESTA FRASE FECHA — e ele é de leitura, não de código.
            Só o PRIMEIRO usuário de uma organização nasce ativo; todos os
            outros nascem `active = false` por trava de segurança, que é a
            decisão certa (ninguém entra sozinho numa empresa e começa a
            trabalhar). Só que a trava era invisível: o administrador via
            "Inativo" numa pessoa que ele acabou de convidar e concluía que o
            convite falhou, ou que a tela quebrou. A regra estava no gatilho do
            banco e em lugar nenhum da interface.
          */}
          <p className="mt-2 max-w-[70ch] text-sm leading-6 text-[var(--atlas-texto-fraco)]">
            Acesso novo nasce desligado — só o primeiro usuário da empresa nasce ativo. &ldquo;Inativo&rdquo; aqui é o
            estado inicial, não uma falha. Ligar exige função comercial e responsável direto na cadeia
            certa, definidos em{" "}
            <Link href="/settings/team" className={`font-medium text-[var(--atlas-texto-medio)] underline underline-offset-2 hover:text-[color:var(--atlas-accent-hover)] ${focusRing}`}>Configurações · Equipe</Link>.
          </p>
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
                  <tr><td colSpan={5} className="px-4 py-6 text-xs leading-5 text-[var(--atlas-texto-fraco)]">Nenhum perfil encontrado — os acessos oficiais da organização aparecem aqui.</td></tr>
                ) : null}
                {profiles.map(profile => (
                  <tr key={profile.id} className="border-t border-[rgba(148,163,184,0.12)] transition-colors first:border-t-0 hover:bg-white/[0.015]">
                    <td className="px-4 py-3.5 font-semibold text-[var(--atlas-texto-forte)]">{profile.full_name || "Usuário sem nome"}</td>
                    {/*
                      O TELEFONE SAÍA ÂMBAR NO TEMA CLARO. `.cc6-num` só deveria
                      trazer numeral tabular, mas uma regra global de tema claro
                      — escrita para o chip de estado "parado há Nd" — crava
                      um âmbar escuro cravado em TODO `.cc6-num`, vencendo o token que
                      esta célula declara. Resultado medido: 4,98:1 e a leitura
                      errada de "este contato tem alguma coisa". Sem a classe,
                      com `tabular-nums` no lugar: 10,27:1, cinza neutro, mesmo
                      alinhamento de dígitos. No tema escuro nada muda (9,77).
                    */}
                    <td className="px-4 py-3.5 text-[var(--atlas-texto-medio)] [font-variant-numeric:tabular-nums]">{profile.phone || "—"}</td>
                    <td className="px-4 py-3.5 text-[var(--atlas-texto-medio)]">{roleLabel[profile.access_role] || profile.access_role}</td>
                    {/*
                      EMOJI SÓ NA EXCEÇÃO. A coluna tem dois valores e, hoje,
                      dois canais que dizem a mesma coisa: a palavra e o tom do
                      badge. O tom de "Inativo" é o NEUTRO — ou seja, a única
                      linha que exige ação é justamente a que a cor apaga.
                      O ⛔ não repete a cor: ele dá forma ao estado que bloqueia
                      a pessoa, sobrevive em escala de cinza e aparece em uma
                      minoria das linhas — quem tem acesso não ganha marca
                      nenhuma, senão nenhuma marca informaria.
                      `aria-hidden` porque "Inativo" está escrito ao lado.
                    */}
                    <td className="px-4 py-3.5">
                      {profile.active
                        ? <StatusBadge tone="success">Ativo</StatusBadge>
                        : <StatusBadge tone="neutral"><span aria-hidden="true">⛔</span> Inativo</StatusBadge>}
                    </td>
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
