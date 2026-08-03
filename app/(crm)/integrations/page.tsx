"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { CapacidadeNoEscuroPanel } from "@/components/atlas/CapacidadeNoEscuroPanel";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { supabase } from "@/lib/supabase";

/*
 * CC-6 · Integrações — hub governado.
 * Consolidações do redesign (mesmos dados, zero fetch novo):
 * - hero, descrição do catálogo e o card "Política operacional" repetiam a
 *   mesma tese (configurado ≠ conectado; segredos fora do navegador) em três
 *   blocos de prosa — virou uma linha no header + a política real do payload
 *   (policy.*) como rodapé compacto, no lugar de quatro cartões estáticos;
 * - o eyebrow de grupo repetia em cada um dos 13 cards — o catálogo agora é
 *   lista agrupada, com um cabeçalho por grupo e contagem mono;
 * - "Ainda sem teste real registrado" duplicava o estado do badge — a linha
 *   de sincronização só existe quando houve teste real (mono, detalhe no title);
 * - a métrica "Catálogo" duplicava o tamanho da própria grade — o total migrou
 *   para o cabeçalho da lista e o pulso passou a contar os três estados reais
 *   (ambiente pronto · cadastradas · comprovadas), todos já no payload.
 * Estado por provedor é um chip único derivado dos dados carregados:
 * conectada (emerald) · falha/degradada (rose/amber, vindas do status) ·
 * configurar (amber) · indisponível (neutro). Uma ação por linha, somente
 * quando existe painel real (/integrations/meta, /integrations/webhooks).
 */

type Catalog = { provider: string; name: string; group: string; capabilities: string[]; environmentReady: boolean };
type Connection = { id: string; provider: string; name: string; status: "disconnected" | "connected" | "degraded" | "error"; external_account_id: string | null; last_sync_at: string | null; last_error: string | null };
type Payload = { catalog: Catalog[]; connections: Connection[]; canManage: boolean; policy: { secretsInDatabase: boolean; connectedRequiresVerifiedTest: boolean; humanApprovalForExternalActions: boolean } };

const GROUP_LABELS: Record<string, string> = {
  ads: "Anúncios",
  portals: "Portais imobiliários",
  owned: "Canais próprios",
  automation: "Automação",
};

// Painéis dedicados que existem hoje; linhas sem destino real não ganham ação.
const PROVIDER_PANELS: Record<string, { href: string; label: string }> = {
  meta: { href: "/integrations/meta", label: "Abrir painel" },
  webhook: { href: "/integrations/webhooks", label: "Abrir webhooks" },
};

const SYNC_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

/* Chip único e honesto: status real da conexão > ambiente detectado > nada.
 *
 * ── POR QUE ENTRA EMOJI NO ESTADO ──────────────────────────────────────────
 *
 * Três dos sete desfechos abaixo saem com a MESMA palavra ("Configurar") e o
 * MESMO tom (warning) — e mandam fazer coisas opostas: instalar credencial no
 * servidor, cadastrar no CRM, ou rodar o teste real. Quem varre as 13 linhas do
 * catálogo lê a mesma pastilha três vezes e só descobre a diferença passando o
 * mouse. A distinção existia no payload (`hint`) e morria no `title`.
 *
 * O glifo passa a carregar essa distinção — 🔑 credencial, 📋 cadastro, 🧪
 * teste — e a mesma gramática vale em /integrations/health, para o leitor não
 * ter de aprender dois vocabulários.
 *
 * Como aqui o glifo diz algo que o texto visível NÃO diz, ele não pode ser só
 * `aria-hidden`: a linha ganha o `hint` em `sr-only`, e o leitor de tela passa
 * a ouvir a mesma distinção que o olho recebe. "Indisponível" fica sem glifo —
 * é a ausência de estado, e não pede ação de ninguém. */
function providerState(item: Catalog, connection?: Connection) {
  if (connection?.status === "connected") {
    return { tone: "success" as const, label: "Conectada", glyph: "✅", hint: "Teste real comprovado" };
  }
  if (connection?.status === "error") {
    // ⛔ (e não 🛑) pelo mesmo motivo de /integrations/health: em escala de
    // cinza o octógono vira disco uniforme — um ponto colorido com outro nome.
    return { tone: "danger" as const, label: "Falha", glyph: "⛔", hint: "Último teste real falhou" };
  }
  if (connection?.status === "degraded") {
    return { tone: "warning" as const, label: "Degradada", glyph: "⚠️", hint: "Conexão cadastrada com sinais degradados" };
  }
  if (item.environmentReady && connection) {
    return { tone: "warning" as const, label: "Configurar", glyph: "🧪", hint: "Ambiente e cadastro prontos · falta o teste real" };
  }
  if (item.environmentReady) {
    return { tone: "warning" as const, label: "Configurar", glyph: "📋", hint: "Credenciais detectadas no servidor · falta cadastro no CRM" };
  }
  if (connection) {
    return { tone: "warning" as const, label: "Configurar", glyph: "🔑", hint: "Cadastro existe no CRM · faltam credenciais no servidor" };
  }
  return { tone: "neutral" as const, label: "Indisponível", glyph: null, hint: "Sem credenciais no servidor e sem cadastro no CRM" };
}

export default function IntegrationsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const response = await fetch("/api/v1/integrations", {
          headers: { Authorization: `Bearer ${session.session?.access_token}` },
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error);
        setData(body);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Falha ao carregar integrações.");
      }
    })();
  }, []);

  const connected = data?.connections.filter((item) => item.status === "connected").length ?? 0;
  const configured = data?.catalog.filter((item) => item.environmentReady).length ?? 0;
  const registered = data?.connections.length ?? 0;

  // Grupos na ordem do catálogo + offset acumulado p/ revelação escalonada.
  let revealOffset = 0;
  const groups = (data?.catalog ?? [])
    .reduce<Array<{ key: string; items: Catalog[] }>>((result, item) => {
      const bucket = result.find((group) => group.key === item.group);
      if (bucket) bucket.items.push(item);
      else result.push({ key: item.group, items: [item] });
      return result;
    }, [])
    .map((group) => {
      const offset = revealOffset;
      revealOffset += group.items.length + 1;
      return { ...group, offset };
    });

  const policyItems = data
    ? ([
        [!data.policy.secretsInDatabase, "Segredos fora do banco"],
        [data.policy.connectedRequiresVerifiedTest, "Conectado exige teste real"],
        [data.policy.humanApprovalForExternalActions, "Ações externas com aprovação humana"],
      ] as const)
    : [];

  return (
    <div className="space-y-4 pb-10" data-integrations-layout="cc6-governed-hub">
      <PageHeader
        eyebrow="Integrações · Fase 4 · Governança"
        title="Conectado só quando foi comprovado"
        description="Credencial no servidor, cadastro no CRM e teste real são estados diferentes — segredos nunca passam pelo navegador."
        action={{
          href: "/integrations/health",
          label: "Ver saúde operacional",
          priority: "secondary",
        }}
      />

      {/* Esta página responde "a credencial está boa?". O painel abaixo responde
          a pergunta seguinte, que ninguém fazia: "o recurso está PRODUZINDO?".
          Medido em 03/08/2026, 67 tabelas com código que as lê estavam vazias —
          nenhuma quebrada, todas esperando um cadastro que ninguém sabia que
          faltava. Fica logo abaixo do cabeçalho porque é a fila de ação da
          página, não um rodapé. */}
      <CapacidadeNoEscuroPanel />

      {error ? (
        <p
          role="alert"
 className="cc6-panel-quiet cc6-alerta cc6-reveal px-4 py-3 text-sm text-[var(--atlas-estado-perigo)]"
        >
          {error}
        </p>
      ) : null}

      <section aria-label="Pulso das integrações">
        <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="cc6-eyebrow">Pulso do catálogo</p>
            {data && !data.canManage ? (
              <StatusBadge tone="neutral">Somente leitura</StatusBadge>
            ) : null}
          </div>
          <div
            className="cc6-hairline mt-4 flex flex-wrap gap-x-10 gap-y-4 pt-4"
            aria-label="Estados reais do catálogo"
            aria-busy={!data && !error}
          >
            <div>
              <p className="cc6-metric-value text-3xl leading-none">
                {data ? configured : "—"}
              </p>
              <p className="cc6-metric-label mt-1.5">Ambiente pronto no servidor</p>
            </div>
            <div>
              <p className="cc6-metric-value text-3xl leading-none">
                {data ? registered : "—"}
              </p>
              <p className="cc6-metric-label mt-1.5">Cadastradas no CRM</p>
            </div>
            <div>
              <p className={`cc6-metric-value text-3xl leading-none ${connected ? "cc6-ok" : ""}`}>
                {data ? connected : "—"}
              </p>
              <p className="cc6-metric-label mt-1.5">Conectadas com teste real</p>
            </div>
          </div>
        </TiltShell>
      </section>

      <section
        className="cc6-panel cc6-reveal overflow-hidden"
        style={{ animationDelay: "120ms" }}
        aria-labelledby="integrations-catalog-title"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <p className="cc6-eyebrow">Catálogo governado</p>
            <h2
              id="integrations-catalog-title"
              className="mt-1 text-lg font-semibold tracking-tight text-[var(--atlas-texto-forte)]"
            >
              APIs, anúncios e portais
            </h2>
          </div>
          {/* ── O `!` NÃO É ENFEITE: MEDIDO NESTA PÁGINA ────────────────────
              `:root[data-theme="light"] .cc6-num:not(...)` (globals.css:10352)
              crava a tinta âmbar SEM camada, e regra sem camada vence
              `@layer utilities` do Tailwind. Resultado medido no navegador,
              tema claro: os 21 elementos `.cc6-num` desta tela — inclusive
              "listings · leads · inventory" e as contagens — saíam em
              rgb(180,83,9), que é a tinta de ATENÇÃO, exatamente a mesma
              família da pastilha "Configurar". O alerta desaparecia dentro do
              texto inerte. Com `!` o valor computado passa a ser o pretendido,
              rgb(90,101,119), e o contraste sobre o painel sobe de 5,02 para
              5,89. `background` e `color` são um par; aqui o par certo é
              texto fraco sobre painel, não âmbar sobre painel. */}
          <p className="cc6-num text-rotulo text-[var(--atlas-texto-fraco)]!">
            {data ? `${data.catalog.length} provedores` : "—"}
          </p>
        </header>

        <div className="mt-2 pb-2" aria-busy={!data && !error}>
          {!data ? (
            error ? null : (
              <div className="space-y-2 px-5 py-3">
                {[1, 2, 3].map((item) => (
                  <AtlasSkeleton key={item} className="h-14" />
                ))}
              </div>
            )
          ) : !data.catalog.length ? (
            <div className="px-5 py-3">
              <AtlasEmpty title="Catálogo vazio" description="Nenhum provedor foi configurado." />
            </div>
          ) : (
            groups.map((group) => (
              <section key={group.key} aria-label={GROUP_LABELS[group.key] ?? group.key}>
                <header className="flex items-center gap-3 px-5 pb-1.5 pt-3">
                  <h3 className="cc6-eyebrow text-[var(--atlas-texto-medio)]!">
                    {GROUP_LABELS[group.key] ?? group.key}
                  </h3>
                  <span className="cc6-hairline min-w-4 flex-1 self-center" aria-hidden="true" />
                  <span className="cc6-num text-micro text-[var(--atlas-texto-fraco)]!">
                    {group.items.length}
                  </span>
                </header>
                <div>
                  {group.items.map((item, index) => {
                    const connection = data.connections.find(
                      (candidate) => candidate.provider === item.provider,
                    );
                    const state = providerState(item, connection);
                    const panel = PROVIDER_PANELS[item.provider];
                    return (
                      <article
                        key={item.provider}
                        className={`cc6-reveal flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 transition-colors hover:bg-[rgba(75,141,248,0.04)] ${index ? "cc6-hairline" : ""}`}
                        style={{
                          animationDelay: `${Math.min(group.offset + index + 1, 12) * 35}ms`,
                        }}
                      >
                        <div className="min-w-0 flex-1 basis-56">
                          <p className="text-sm font-medium leading-6 text-[var(--atlas-texto-forte)]">
                            {item.name}
                          </p>
                          {/* Meta de linha é degrau de RÓTULO (11px), não de
                              carimbo (10px): esta é a linha mais longa de cada
                              provedor e a que mais se lê em varredura. */}
                          <p className="cc6-num mt-0.5 truncate text-rotulo tracking-wide text-[var(--atlas-texto-fraco)]!">
                            {item.capabilities.join(" · ").replaceAll("_", " ")}
                          </p>
                          {connection?.last_error ? (
                            <p
                              className="cc6-crit mt-1 truncate text-rotulo leading-4"
                              title={connection.last_error}
                            >
                              {connection.last_error}
                            </p>
                          ) : null}
                        </div>
                        {connection?.last_sync_at ? (
                          <time
                            dateTime={connection.last_sync_at}
                            title={`Último teste real: ${new Date(connection.last_sync_at).toLocaleString("pt-BR")}`}
                            className="cc6-num shrink-0 text-rotulo text-[var(--atlas-texto-fraco)]!"
                          >
                            {SYNC_FORMAT.format(new Date(connection.last_sync_at))}
                          </time>
                        ) : null}
                        <span className="shrink-0" title={state.hint}>
                          <StatusBadge tone={state.tone}>
                            {/* O glifo precisa da própria altura: a pastilha é
                                `text-micro!` (10px) e um emoji a 10px vira
                                mancha. `font-size` declarado no FILHO vence a
                                herança do pai mesmo com `!important` no pai —
                                `!` só decide disputa dentro do mesmo elemento. */}
                            {state.glyph ? (
                              <span aria-hidden="true" className="text-corpo leading-none">
                                {state.glyph}
                              </span>
                            ) : null}
                            {state.label}
                            {/* O que o glifo diz e a palavra não: sem isto,
                                "Configurar" chega ao leitor de tela como três
                                estados idênticos que pedem ações opostas. */}
                            <span className="sr-only"> · {state.hint}</span>
                          </StatusBadge>
                        </span>
                        {panel ? (
                          <Link
                            href={panel.href}
                            className={`cc6-ghost-btn shrink-0 ${focusRing}`}
                            aria-label={`${panel.label} · ${item.name}`}
                          >
                            {panel.label} <span aria-hidden="true">→</span>
                          </Link>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>

        <footer className="cc6-hairline flex flex-wrap items-center gap-x-5 gap-y-2 px-5 py-3">
          {policyItems.map(([enforced, label]) => (
            <span
              key={label}
              className="cc6-num inline-flex items-center gap-1.5 text-rotulo uppercase tracking-[0.12em] text-[var(--atlas-texto-fraco)]!"
            >
              <span aria-hidden="true" className={enforced ? "cc6-ok" : "cc6-warn"}>
                {enforced ? "✓" : "!"}
              </span>
              <span className="sr-only">{enforced ? "Política ativa:" : "Política inativa:"}</span>
              {label}
            </span>
          ))}
          <Link
            href="/atlas-v3/homologation"
            className={`cc6-ghost-btn ml-auto ${focusRing}`}
          >
            Fase 4 da homologação
          </Link>
        </footer>
      </section>
    </div>
  );
}
