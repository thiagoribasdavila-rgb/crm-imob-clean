"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";

/*
 * CC-6 · Saúde operacional das integrações.
 * Consolidações do redesign (mesmos dados, zero fetch novo):
 * - os cards "Filas e falhas" e "Ambiente" repetiam dimensões do resumo em
 *   caixas separadas (e claras, fora do tema) — tudo virou uma régua única de
 *   sinais vitais mono tabular-nums, com o runtime como rodapé de uma linha;
 * - "Ambiente ok · cadastro pendente · teste pendente" era prosa repetida por
 *   provedor — virou tokens mono compactos por etapa (✓/—, título por token);
 * - a linha de bloqueios duplicava exatamente o que os tokens, a evidência e
 *   as falhas já mostram — o detalhe vive agora no title da linha e do
 *   contador de falhas (rose quando > 0);
 * - "Produção PRONTA/BLOQUEADA" era um card de resumo — virou chip único no
 *   cabeçalho dos sinais vitais;
 * - snapshots já vinham no payload e nunca eram exibidos — o último
 *   diagnóstico agora aparece no rodapé do painel;
 * - o <main> próprio aninhava um segundo landmark dentro do AppShell — a
 *   página passa a usar o container padrão do CC-6.
 */

type Provider = {
  provider: string;
  state: string;
  healthy: boolean;
  freshnessHours: number | null;
  pending: number;
  failed: number;
  blockers: string[];
  environmentReady: boolean;
  registered: boolean;
  verified: boolean;
};
type Payload = {
  current: {
    summary: {
      healthy: number;
      degraded: number;
      readyToTest: number;
      notReady: number;
      total: number;
      productionReady: boolean;
    };
    providers: Provider[];
    queues: {
      pending: number;
      failed: number;
      unresolvedDeadLetters: number;
      tokenUnhealthy?: {
        measured: boolean;
        count?: number;
        oldestAt?: string | null;
        reason?: string;
      };
    };
    runtime: {
      hostingProvider: string;
      publicHttps: boolean;
      environment: string;
      aiCostUsd30d: number;
    };
  };
  snapshots: Array<{ id: string; created_at: string }>;
};

const PROVIDER_NAMES: Record<string, string> = {
  meta: "Meta Lead Ads + CAPI",
  meta_marketing: "Meta Marketing API (verba)",
  whatsapp: "WhatsApp",
  google_ads: "Google Ads",
  youtube: "YouTube Ads",
  tiktok_ads: "TikTok Ads",
  openai: "OpenAI",
  perplexity: "Perplexity",
  storage: "Storage Supabase",
  hostinger: "Hostinger",
};

// Estados reais do avaliador (operational-health) → chip único por linha.
const STATE_META: Record<string, { tone: "success" | "danger" | "warning" | "neutral"; label: string }> = {
  healthy: { tone: "success", label: "Saudável" },
  degraded: { tone: "danger", label: "Degradada" },
  stale: { tone: "warning", label: "Evidência antiga" },
  ready_to_test: { tone: "warning", label: "Pronta p/ teste" },
  environment_only: { tone: "warning", label: "Sem cadastro" },
  registered_only: { tone: "warning", label: "Sem credenciais" },
  not_configured: { tone: "neutral", label: "Não configurada" },
};

const BLOCKER_LABELS: Record<string, string> = {
  environment_missing: "credenciais ausentes no servidor",
  registration_missing: "sem cadastro no CRM",
  verified_test_missing: "teste real pendente",
  sync_evidence_missing: "sem evidência de sincronização",
  sync_stale: "evidência com mais de 24h",
  failed_queue_items: "itens falhos na fila",
  token_expired: "fila parada por credencial expirada — renove o token",
  last_error_present: "último erro registrado",
};

const SNAPSHOT_FORMAT = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
});

function StepToken({ label, done, hint }: { label: string; done: boolean; hint: string }) {
  return (
    <span title={hint}>
      {label} {done ? <span className="cc6-ok">✓</span> : <span aria-label="pendente">—</span>}
    </span>
  );
}

export default function Page() {
  const [data, setData] = useState<Payload | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await fetch("/api/v1/governance/integration-health", {
        cache: "no-store",
      }),
      j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || "Indisponível");
    setData(j.data);
  }, []);
  useEffect(() => {
    load().catch((e) => setNotice(e.message));
  }, [load]);
  async function snapshot() {
    setBusy(true);
    try {
      const r = await fetch("/api/v1/governance/integration-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "snapshot" }),
      }),
        j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || "Falha");
      setNotice("Diagnóstico seguro registrado, sem armazenar segredos.");
      await load();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Falha");
    } finally {
      setBusy(false);
    }
  }
  const c = data?.current;
  const lastSnapshotAt = data?.snapshots[0]?.created_at;
  const tokenStuck = c?.queues.tokenUnhealthy;

  const vitals = [
    { label: "Saudáveis", value: c?.summary.healthy, accent: c?.summary.healthy ? "cc6-ok" : "", hint: "Provedores com teste real e evidência fresca" },
    { label: "Degradadas", value: c?.summary.degraded, accent: c?.summary.degraded ? "cc6-crit" : "", hint: "Provedores com falhas ou erro registrado" },
    { label: "Prontas p/ teste", value: c?.summary.readyToTest, accent: c?.summary.readyToTest ? "cc6-warn" : "", hint: "Ambiente e cadastro prontos, sem teste real" },
    { label: "Pendentes", value: c?.summary.notReady, accent: "", hint: "Sem ambiente ou sem cadastro" },
    { label: "Fila", value: c?.queues.pending, accent: "", hint: "Eventos pendentes ou em processamento (30d)" },
    { label: "Falhas", value: c?.queues.failed, accent: c?.queues.failed ? "cc6-crit" : "", hint: "Eventos falhos ou em dead letter (30d)" },
    { label: "DLQ", value: c?.queues.unresolvedDeadLetters, accent: c?.queues.unresolvedDeadLetters ? "cc6-crit" : "", hint: "Dead letters sem resolução" },
    // Presos por credencial não aparecem em DLQ (o worker os mantém retryable
    // de propósito): sem esta coluna, o incidente de token não tem número.
    {
      label: "Token",
      value: tokenStuck?.measured ? tokenStuck.count ?? 0 : "—",
      accent: tokenStuck?.measured && tokenStuck.count ? "cc6-crit" : "",
      hint: !tokenStuck
        ? "Fila parada por credencial expirada"
        : tokenStuck.measured
          ? `Eventos parados por credencial expirada${tokenStuck.oldestAt ? ` · mais antigo ${SNAPSHOT_FORMAT.format(new Date(tokenStuck.oldestAt))}` : ""}`
          : `Não medido — ${tokenStuck.reason ?? "leitura indisponível"}`,
    },
  ];

  return (
    <div
      data-phase="97-integration-operational-health"
      data-health-layout="cc6-vitals"
      className="space-y-4 pb-10"
    >
      <PageHeader
        eyebrow="Integrações · Hostinger · APIs · Filas"
        title="Saúde operacional"
        description="Configurado, testado e saudável são estados diferentes — teste real obrigatório e segredos sempre mascarados."
        action={{
          href: "/integrations",
          label: "Voltar às integrações",
          priority: "secondary",
        }}
      />

      {notice ? (
        <p
          role="status"
          className="cc6-panel-quiet cc6-reveal px-4 py-3 text-sm text-[#aab6ca]"
        >
          {notice}
        </p>
      ) : null}

      <section aria-label="Sinais vitais das integrações">
        <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="cc6-eyebrow">Sinais vitais</p>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {c ? (
                <StatusBadge tone={c.summary.productionReady ? "success" : "warning"}>
                  {c.summary.productionReady ? "Produção pronta" : "Produção bloqueada"}
                </StatusBadge>
              ) : null}
              <button
                type="button"
                disabled={busy}
                onClick={snapshot}
                className="cc6-ghost-btn disabled:opacity-50"
              >
                {busy ? "Registrando…" : "Registrar diagnóstico"}
              </button>
            </div>
          </div>
          <div
            className="cc6-hairline mt-4 flex flex-wrap gap-x-10 gap-y-4 pt-4"
            aria-label="Resumo dos provedores e das filas"
            aria-busy={!c}
          >
            {vitals.map((vital) => (
              <div key={vital.label} title={vital.hint}>
                <p className={`cc6-metric-value text-3xl leading-none ${vital.accent}`}>
                  {c ? vital.value ?? 0 : "—"}
                </p>
                <p className="cc6-metric-label mt-1.5">{vital.label}</p>
              </div>
            ))}
          </div>
          <p className="cc6-hairline cc6-num mt-4 pt-3 text-[11px] leading-5 text-[#6b7890]">
            {c ? (
              <>
                {c.runtime.hostingProvider} · HTTPS{" "}
                <span className={c.runtime.publicHttps ? "cc6-ok" : "cc6-warn"}>
                  {c.runtime.publicHttps ? "válido" : "pendente"}
                </span>
                {" · "}
                {c.runtime.environment} · IA 30d US$ {c.runtime.aiCostUsd30d || 0} · segredos
                mascarados
                {lastSnapshotAt
                  ? ` · último diagnóstico ${SNAPSHOT_FORMAT.format(new Date(lastSnapshotAt))}`
                  : " · nenhum diagnóstico registrado"}
              </>
            ) : (
              "Aguardando leitura do runtime…"
            )}
          </p>
        </TiltShell>
      </section>

      <section
        className="cc6-panel cc6-reveal overflow-hidden"
        style={{ animationDelay: "120ms" }}
        aria-labelledby="health-providers-title"
      >
        <header className="flex flex-wrap items-baseline justify-between gap-3 px-5 pt-5">
          <div className="min-w-0">
            <p className="cc6-eyebrow">Estado por provedor</p>
            <h2
              id="health-providers-title"
              className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]"
            >
              Credencial, cadastro e teste real
            </h2>
          </div>
          <p className="cc6-num text-[11px] text-[#6b7890]">
            {c ? `${c.summary.total} monitorados` : "—"}
          </p>
        </header>

        <div className="mt-2 pb-2" aria-busy={!c}>
          {!c ? (
            <div className="space-y-2 px-5 py-3">
              {[1, 2, 3].map((item) => (
                <AtlasSkeleton key={item} className="h-14" />
              ))}
            </div>
          ) : !c.providers.length ? (
            <p className="px-5 py-6 text-sm text-[#6b7890]">
              Nenhum provedor monitorado até agora.
            </p>
          ) : (
            c.providers.map((provider, index) => {
              const state = STATE_META[provider.state] ?? {
                tone: "warning" as const,
                label: provider.state.replaceAll("_", " "),
              };
              const blockers = provider.blockers
                .map((blocker) => BLOCKER_LABELS[blocker] ?? blocker.replaceAll("_", " "))
                .join(" · ");
              const degraded = provider.state === "degraded";
              return (
                <article
                  key={provider.provider}
                  title={blockers || undefined}
                  className={`cc6-reveal flex flex-wrap items-center gap-x-5 gap-y-1.5 px-5 py-3 transition-colors hover:bg-[rgba(75,141,248,0.04)] ${index ? "cc6-hairline" : ""} ${degraded ? "cc6-sev-band" : ""}`}
                  style={
                    {
                      animationDelay: `${Math.min(index + 1, 12) * 35}ms`,
                      ...(degraded ? { "--cc6-sev": "#fb7185" } : null),
                    } as CSSProperties
                  }
                >
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="text-sm font-medium leading-6 text-[#e8eef8]">
                      {PROVIDER_NAMES[provider.provider] ??
                        provider.provider.replaceAll("_", " ")}
                    </p>
                    <p className="cc6-num mt-0.5 text-[10px] tracking-wide text-[#6b7890]">
                      <StepToken
                        label="ambiente"
                        done={provider.environmentReady}
                        hint={
                          provider.environmentReady
                            ? "Credenciais detectadas no servidor"
                            : "Credenciais pendentes no servidor"
                        }
                      />
                      {" · "}
                      <StepToken
                        label="cadastro"
                        done={provider.registered}
                        hint={
                          provider.registered
                            ? "Cadastro presente no CRM"
                            : "Cadastro pendente no CRM"
                        }
                      />
                      {" · "}
                      <StepToken
                        label="teste"
                        done={provider.verified}
                        hint={
                          provider.verified
                            ? "Teste real comprovado"
                            : "Teste real pendente"
                        }
                      />
                    </p>
                  </div>
                  <p className="cc6-num shrink-0 text-[11px] text-[#aab6ca]">
                    <span
                      title="Idade da última evidência de sincronização"
                      className={
                        provider.freshnessHours == null
                          ? "text-[#6b7890]"
                          : provider.freshnessHours > 24
                            ? "cc6-warn"
                            : ""
                      }
                    >
                      evid{" "}
                      {provider.freshnessHours == null
                        ? "—"
                        : `${provider.freshnessHours}h`}
                    </span>
                    {" · "}
                    <span title="Eventos pendentes na fila deste provedor">
                      fila {provider.pending}
                    </span>
                    {" · "}
                    <span
                      className={provider.failed ? "cc6-crit" : ""}
                      title={
                        provider.failed
                          ? `Falhas na fila deste provedor — ${blockers || "ver diagnóstico"}`
                          : "Sem falhas na fila"
                      }
                    >
                      falhas {provider.failed}
                    </span>
                  </p>
                  <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                </article>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
