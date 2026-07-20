"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AtlasEmpty, AtlasSkeleton } from "@/components/ui/AtlasUI";
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

// Chip único e honesto: status real da conexão > ambiente detectado > nada.
function providerState(item: Catalog, connection?: Connection) {
  if (connection?.status === "connected") {
    return { tone: "success" as const, label: "Conectada", hint: "Teste real comprovado" };
  }
  if (connection?.status === "error") {
    return { tone: "danger" as const, label: "Falha", hint: "Último teste real falhou" };
  }
  if (connection?.status === "degraded") {
    return { tone: "warning" as const, label: "Degradada", hint: "Conexão cadastrada com sinais degradados" };
  }
  if (item.environmentReady && connection) {
    return { tone: "warning" as const, label: "Configurar", hint: "Ambiente e cadastro prontos · falta o teste real" };
  }
  if (item.environmentReady) {
    return { tone: "warning" as const, label: "Configurar", hint: "Credenciais detectadas no servidor · falta cadastro no CRM" };
  }
  if (connection) {
    return { tone: "warning" as const, label: "Configurar", hint: "Cadastro existe no CRM · faltam credenciais no servidor" };
  }
  return { tone: "neutral" as const, label: "Indisponível", hint: "Sem credenciais no servidor e sem cadastro no CRM" };
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

      {error ? (
        <p
          role="alert"
          className="cc6-panel-quiet cc6-reveal border-[rgba(251,113,133,0.30)]! px-4 py-3 text-sm text-[#fb7185]"
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
              className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]"
            >
              APIs, anúncios e portais
            </h2>
          </div>
          <p className="cc6-num text-[11px] text-[#6b7890]">
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
                  <h3 className="cc6-eyebrow text-[#aab6ca]!">
                    {GROUP_LABELS[group.key] ?? group.key}
                  </h3>
                  <span className="cc6-hairline min-w-4 flex-1 self-center" aria-hidden="true" />
                  <span className="cc6-num text-[10px] text-[#6b7890]">
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
                          <p className="text-sm font-medium leading-6 text-[#e8eef8]">
                            {item.name}
                          </p>
                          <p className="cc6-num mt-0.5 truncate text-[10px] tracking-wide text-[#6b7890]">
                            {item.capabilities.join(" · ").replaceAll("_", " ")}
                          </p>
                          {connection?.last_error ? (
                            <p
                              className="cc6-crit mt-1 truncate text-[11px] leading-4"
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
                            className="cc6-num shrink-0 text-[11px] text-[#6b7890]"
                          >
                            {SYNC_FORMAT.format(new Date(connection.last_sync_at))}
                          </time>
                        ) : null}
                        <span className="shrink-0" title={state.hint}>
                          <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
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
              className="cc6-num inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-[#6b7890]"
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
