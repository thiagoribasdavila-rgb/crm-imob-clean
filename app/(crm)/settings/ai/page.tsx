"use client";

import Link from "next/link";

import { useEffect, useState, type CSSProperties } from "react";
import { AtlasSkeleton } from "@/components/ui/AtlasUI";
import { PageHeader } from "@/components/atlas/page-header";
import { StatusBadge } from "@/components/atlas/status-badge";
import { TiltShell } from "@/components/atlas/tilt-shell";
import { supabase } from "@/lib/supabase";

type AIStatus = {
  status: "ready" | "degraded";
  gatewayConfigured: boolean;
  fallbackAvailable: boolean;
  model: string;
  models: { fast: string; commercial: string; reasoning: string; research: string };
  pricing: { fast: boolean; commercial: boolean; reasoning: boolean; research: boolean };
  domain: string;
  calibrationVerifiedAt: string;
  marketSources: Array<{
    id: string;
    title: string;
    publisher: string;
    url: string;
    verifiedAt: string;
  }>;
  controls: Record<string, boolean>;
  providers: {
    openai: boolean;
    perplexity: boolean;
    deepseek: boolean;
    qwen: boolean;
    kimi: boolean;
    glm: boolean;
    localFallback: boolean;
    host: "hostinger";
  };
  providerHealth: Array<{ name: string; configured: boolean; validated: boolean; status: "not_configured" | "awaiting_live_test" | "operational"; model: string | null; lastSuccessfulAt: string | null; latencyMs: number | null }>;
  agents: Array<{ id: string; name: string; status: "supervised" | "prepared" | "deterministic"; functions: string[] }>;
  operatingSystem: {
    mode: "operational" | "prepared_offline" | "local_only";
    brain: { status: "active"; description: string };
    engine: { status: "online" | "awaiting_capacity" | "not_configured"; automaticRecovery: boolean; localContinuity: boolean };
    memory: { status: "active"; records: number; rawConversationStored: false; exclusiveLeadOwnership: true };
    knowledge: { status: "grounded" | "prepared"; documents: number; researchOperational: boolean };
    learningLoop: { mode: "supervised"; events: number; comparesSuggestionDecisionOutcome: true };
  };
  activationPolicy: { mode: "supervised"; autonomousExternalActions: false; humanApprovalRequired: true; memoryOperational: boolean; rawPromptsStored: false; personalDataRestrictedToTrustedProvider: true };
  usage: {
    calls: number;
    tokens: number;
    estimatedCostUsd: number;
    averageLatencyMs: number;
    openaiCalls: number;
    perplexityCalls: number;
    economyCalls: number;
    localCalls: number;
    periodDays: number;
  };
};
type CostRoutingResult = {
  status: "passed";
  containsPersonalData: false;
  routes: Array<{
    task: "fast" | "commercial" | "reasoning";
    provider: string;
    model: string;
    latencyMs: number;
    tokens: { inputTokens: number; outputTokens: number; totalTokens: number };
    estimatedCostUsd: number;
    providerRequestId: string;
  }>;
  totalEstimatedCostUsd: number;
  testedAt: string;
};
type ProviderTestResult = {
  model: string;
  providerRequestId: string | null;
  latencyMs: number;
  usage: { totalTokens: number };
  testedAt: string;
};

/* CC-6 · governança legível: cada guardrail tem nome forte + uma linha do
   efeito real. O estado vive só no badge — nunca repetido em texto. */
const controlCatalog: Record<string, { name: string; effect: string }> = {
  operationalContext: {
    name: "Contexto operacional do CRM",
    effect: "Respostas partem do funil, da carteira e da agenda reais.",
  },
  hierarchyAware: {
    name: "Respeito à hierarquia comercial",
    effect: "Cada resposta enxerga apenas o escopo do papel de quem pergunta.",
  },
  personalDataProtection: {
    name: "Proteção de dados pessoais",
    effect: "PII fica fora das rotas econômicas de terceiros.",
  },
  promptInjectionGuard: {
    name: "Defesa contra instruções maliciosas",
    effect: "Instrução embutida em texto externo é tratada como dado, não como ordem.",
  },
  financialDisclaimer: {
    name: "Limites para crédito e investimento",
    effect: "Temas financeiros saem com ressalva, nunca como recomendação.",
  },
  localFallback: {
    name: "Motor local de contingência",
    effect: "Sem provedor externo, o motor determinístico mantém a operação.",
  },
  adaptiveComplexityRouting: {
    name: "Roteamento adaptativo por complexidade",
    effect: "Cada tarefa segue pela menor rota capaz de executá-la.",
  },
  humanReviewEscalation: {
    name: "Escalonamento para revisão humana",
    effect: "Casos sensíveis param e aguardam decisão de uma pessoa.",
  },
};

/* Papel de cada provedor — antes espalhado em dois cards distintos
   (Health Center + Orquestração V3), agora uma única superfície. */
const providerCatalog: Record<string, { name: string; role: string }> = {
  openai: { name: "OpenAI", role: "Rota principal — a única que recebe dados pessoais" },
  perplexity: { name: "Perplexity", role: "Pesquisa web com fontes obrigatórias, sem PII" },
  deepseek: { name: "DeepSeek", role: "Raciocínio econômico e fallback" },
  qwen: { name: "Qwen", role: "Resumos e tarefas rápidas" },
  kimi: { name: "Kimi", role: "Documentos e contexto extenso" },
  glm: { name: "GLM", role: "Agentes e segunda opinião" },
};

/* Anel de foco padrão CC-6 para interativos que não são cc6-ghost-btn. */
const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--atlas-accent)]";

const rowHoverClass =
  "cc6-hairline flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-[rgba(75,141,248,0.04)]";

export default function AISettings() {
  const [data, setData] = useState<AIStatus | null>(null);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    model: string;
    providerRequestId: string | null;
    latencyMs: number;
    usage: { totalTokens: number };
    testedAt: string;
  } | null>(null);
  const [researchTesting, setResearchTesting] = useState(false);
  const [researchResult, setResearchResult] = useState<{
    model: string;
    providerRequestId: string | null;
    latencyMs: number;
    citationCount: number;
    citations: string[];
    testedAt: string;
  } | null>(null);
  const [routingTesting, setRoutingTesting] = useState(false);
  const [providerTesting, setProviderTesting] = useState<string | null>(null);
  const [providerResults, setProviderResults] = useState<Record<string, ProviderTestResult>>({});
  const [routingResult, setRoutingResult] = useState<CostRoutingResult | null>(
    null,
  );

  useEffect(() => {
    let active = true;
    void fetch("/api/ai/status")
      .then(async (response) => {
        const payload = await response.json();
        if (!active) return;
        if (!response.ok)
          setError(
            payload?.error?.message || "Não foi possível diagnosticar a IA.",
          );
        else setData(payload as AIStatus);
      })
      .catch((statusError) => {
        if (active)
          setError(
            statusError instanceof Error
              ? statusError.message
              : "Falha no diagnóstico da IA.",
          );
      });
    return () => {
      active = false;
    };
  }, []);

  const enabledControls = data
    ? Object.values(data.controls).filter(Boolean).length
    : 0;

  async function testOpenAI() {
    setTesting(true);
    setError("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch("/api/ai/openai-test", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message || "Teste OpenAI falhou.");
      setTestResult(body.data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Teste OpenAI falhou.");
    } finally {
      setTesting(false);
    }
  }

  async function testPerplexity() {
    setResearchTesting(true);
    setError("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch("/api/ai/perplexity-test", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message || "Teste Perplexity falhou.");
      setResearchResult(body.data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Teste Perplexity falhou.",
      );
    } finally {
      setResearchTesting(false);
    }
  }

  async function testCostRouting() {
    setRoutingTesting(true);
    setError("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch("/api/ai/cost-routing-test", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.session?.access_token}` },
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message || "Ensaio de roteamento falhou.");
      setRoutingResult(body.data);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Ensaio de roteamento falhou.",
      );
    } finally {
      setRoutingTesting(false);
    }
  }

  async function testEconomyProvider(provider: string) {
    setProviderTesting(provider);
    setError("");
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await fetch("/api/ai/provider-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session?.access_token}`,
        },
        body: JSON.stringify({ provider }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error?.message || `Teste ${provider} falhou.`);
      setProviderResults((current) => ({ ...current, [provider]: body.data }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : `Teste ${provider} falhou.`);
    } finally {
      setProviderTesting(null);
    }
  }

  const diagnosing = !data && !error;

  return (
    <div className="space-y-4 pb-10" data-ai-settings-layout="cc6-governance">
      <PageHeader
        eyebrow="Configurações · Inteligência artificial"
        title="Inteligência sob governança"
        description="Modelos são motores substituíveis: contexto, memória e aprendizado ficam no Atlas — e nenhuma ação externa sai sem aprovação humana."
        action={{
          href: "/settings/ai-orchestration",
          label: "Abrir orquestrador",
          priority: "secondary",
        }}
      />

      {error ? (
        <div
          role="alert"
          className="cc6-sev-band cc6-panel-quiet py-3 pl-5 pr-4 text-sm text-[#fb7185]"
          style={{ "--cc6-sev": "#fb7185" } as CSSProperties}
        >
          {error}
        </div>
      ) : null}

      <section aria-label="Pulso da inteligência">
        <TiltShell className="cc6-panel cc6-reveal p-5" delayMs={40}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="cc6-eyebrow">Pulso · uso real</p>
            <StatusBadge
              tone={
                data
                  ? data.status === "ready"
                    ? "success"
                    : "warning"
                  : error
                    ? "danger"
                    : "neutral"
              }
            >
              {data
                ? data.status === "ready"
                  ? "Operacional"
                  : "Modo seguro"
                : error
                  ? "Diagnóstico falhou"
                  : "Diagnosticando…"}
            </StatusBadge>
          </div>

          <div className="cc6-hairline mt-4 grid gap-5 pt-4 xl:grid-cols-[1.15fr_.85fr]">
            <div aria-label="Consumo do período" aria-busy={diagnosing}>
              <div className="flex flex-wrap gap-x-10 gap-y-4">
                <div>
                  <p className="cc6-metric-value text-3xl leading-none">
                    {data?.usage.calls ?? "—"}
                  </p>
                  <p className="cc6-metric-label mt-1.5">
                    Chamadas · {data?.usage.periodDays ?? 30} dias
                  </p>
                </div>
                <div>
                  <p className="cc6-metric-value text-3xl leading-none">
                    {data ? data.usage.tokens.toLocaleString("pt-BR") : "—"}
                  </p>
                  <p className="cc6-metric-label mt-1.5">Tokens processados</p>
                </div>
                <div>
                  <p className="cc6-metric-value text-3xl leading-none">
                    {data ? `${data.usage.averageLatencyMs} ms` : "—"}
                  </p>
                  <p className="cc6-metric-label mt-1.5">Latência média</p>
                </div>
                <div>
                  <p className="cc6-metric-value text-3xl leading-none">
                    {data ? `US$ ${data.usage.estimatedCostUsd.toFixed(4)}` : "—"}
                  </p>
                  <p className="cc6-metric-label mt-1.5">Custo estimado</p>
                </div>
              </div>
              {data ? (
                <p className="cc6-num mt-4 text-[11px] text-[#6b7890]">
                  {data.usage.openaiCalls} OpenAI · {data.usage.perplexityCalls}{" "}
                  pesquisa · {data.usage.economyCalls} econômicas ·{" "}
                  {data.usage.localCalls} motor local
                </p>
              ) : null}
            </div>

            <div className="cc6-panel-quiet p-4">
              <p className="cc6-metric-label">Rota por tarefa</p>
              <div className="mt-2 space-y-1.5 text-xs">
                {data ? (
                  (
                    [
                      ["Rápida", data.models.fast],
                      ["Comercial", data.models.commercial],
                      ["Complexa", data.models.reasoning],
                      ["Pesquisa", data.models.research],
                    ] as const
                  ).map(([label, model]) => (
                    <div
                      key={label}
                      className="flex items-baseline justify-between gap-3"
                    >
                      <span className="text-[#6b7890]">{label}</span>
                      <span className="cc6-num text-right text-[#e8eef8]">
                        {model}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-[#6b7890]">Carregando rotas…</p>
                )}
              </div>
              <p className="mt-3 text-[10px] leading-4 text-[#6b7890]">
                Latência, tokens e custo registrados por chamada.
              </p>
            </div>
          </div>

          <div className="cc6-hairline mt-4 flex flex-wrap gap-2 pt-4">
            <Link href="/settings/ai-context" className="cc6-ghost-btn">
              Memória e contexto
            </Link>
            <Link href="/settings/ai-guardrails" className="cc6-ghost-btn">
              Política de governança
            </Link>
            <Link href="/settings/ai-playbooks" className="cc6-ghost-btn">
              Conhecimento comercial
            </Link>
          </div>
        </TiltShell>
      </section>

      <section
        aria-labelledby="ai-safe-defaults-title"
        className="cc6-sev-band cc6-panel cc6-reveal p-5"
        style={{ "--cc6-sev": "#34d399", animationDelay: "100ms" } as CSSProperties}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="cc6-eyebrow">Governança</p>
            <h2
              id="ai-safe-defaults-title"
              className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]"
            >
              Seguro por padrão
            </h2>
          </div>
          <StatusBadge tone="success">Supervisionado</StatusBadge>
        </div>
        {data ? (
          <ul className="mt-4 grid gap-x-8 gap-y-2 text-sm text-[#aab6ca] sm:grid-cols-2 xl:grid-cols-3">
            <li className="flex gap-2">
              <span aria-hidden="true" className="cc6-ok">✓</span>
              Ação externa só com aprovação humana — nada é enviado sozinho.
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="cc6-ok">✓</span>
              Aprendizado compara sugestão, decisão e resultado — sem executar.
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="cc6-ok">✓</span>
              Prompts e conversas brutas ficam fora do armazenamento.
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="cc6-ok">✓</span>
              Dados pessoais restritos ao provedor confiável.
            </li>
            <li className="flex gap-2">
              <span aria-hidden="true" className="cc6-ok">✓</span>
              Cada lead tem dono exclusivo na memória.
            </li>
            <li className="flex gap-2">
              {data.activationPolicy.memoryOperational ? (
                <>
                  <span aria-hidden="true" className="cc6-ok">✓</span>
                  Memória estruturada com evidência de uso.
                </>
              ) : (
                <>
                  <span aria-hidden="true" className="cc6-warn">•</span>
                  Memória aguardando a primeira execução registrada.
                </>
              )}
            </li>
          </ul>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {[1, 2, 3].map((item) => (
              <AtlasSkeleton key={item} className="h-5 w-full" />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <section
          aria-labelledby="ai-guardrails-title"
          className="cc6-panel cc6-reveal overflow-hidden"
          style={{ animationDelay: "160ms" }}
        >
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
            <div className="min-w-0">
              <p className="cc6-eyebrow">Guardrails</p>
              <h2
                id="ai-guardrails-title"
                className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]"
              >
                Controles em toda consulta
              </h2>
            </div>
            <span className="cc6-chip">
              {data
                ? `${enabledControls}/${Object.keys(data.controls).length} ativos`
                : "diagnosticando"}
            </span>
          </header>
          <div aria-busy={diagnosing}>
            {!data ? (
              <div className="space-y-3 px-5 pb-5">
                {[1, 2, 3, 4].map((item) => (
                  <AtlasSkeleton key={item} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              Object.entries(data.controls).map(([key, enabled]) => {
                const meta = controlCatalog[key];
                return (
                  <div
                    key={key}
                    className={`${rowHoverClass} ${enabled ? "" : "cc6-sev-band"}`}
                    style={
                      enabled
                        ? undefined
                        : ({ "--cc6-sev": "#fb7185" } as CSSProperties)
                    }
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#e8eef8]">
                        {meta?.name ?? key}
                      </p>
                      {meta ? (
                        <p className="mt-0.5 text-xs leading-5 text-[#6b7890]">
                          {meta.effect}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge tone={enabled ? "success" : "danger"}>
                      {enabled ? "Ativo" : "Inativo"}
                    </StatusBadge>
                  </div>
                );
              })
            )}
          </div>
        </section>

        <section
          aria-labelledby="ai-core-title"
          className="cc6-panel cc6-reveal overflow-hidden"
          style={{ animationDelay: "200ms" }}
        >
          <header className="px-5 pb-4 pt-5">
            <p className="cc6-eyebrow">Núcleo operacional</p>
            <h2
              id="ai-core-title"
              className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]"
            >
              Motor, memória e aprendizado
            </h2>
          </header>
          <div aria-busy={diagnosing}>
            {!data ? (
              <div className="space-y-3 px-5 pb-5">
                {[1, 2, 3].map((item) => (
                  <AtlasSkeleton key={item} className="h-12 w-full" />
                ))}
              </div>
            ) : (
              <>
                <div className={rowHoverClass}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#e8eef8]">Sistema</p>
                    <p className="mt-0.5 text-xs leading-5 text-[#6b7890]">
                      Coleta contexto e prepara a próxima chamada mesmo sem
                      créditos.
                    </p>
                  </div>
                  <StatusBadge
                    tone={
                      data.operatingSystem.mode === "operational"
                        ? "success"
                        : "warning"
                    }
                  >
                    {data.operatingSystem.mode === "operational"
                      ? "Online"
                      : data.operatingSystem.mode === "prepared_offline"
                        ? "Preparado offline"
                        : "Motor local"}
                  </StatusBadge>
                </div>
                <div className={rowHoverClass}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#e8eef8]">
                      Motor generativo
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-[#6b7890]">
                      {data.gatewayConfigured
                        ? "OpenAI direta no servidor."
                        : "Credencial pendente em homologação."}
                    </p>
                  </div>
                  <StatusBadge
                    tone={
                      data.operatingSystem.engine.status === "online"
                        ? "success"
                        : data.operatingSystem.engine.status ===
                            "awaiting_capacity"
                          ? "warning"
                          : "neutral"
                    }
                  >
                    {data.operatingSystem.engine.status === "online"
                      ? "Respondendo"
                      : data.operatingSystem.engine.status ===
                          "awaiting_capacity"
                        ? "Aguardando crédito"
                        : "Não configurado"}
                  </StatusBadge>
                </div>
                <div className={rowHoverClass}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[#e8eef8]">
                      Contingência local
                    </p>
                    <p className="mt-0.5 text-xs leading-5 text-[#6b7890]">
                      Assume a resposta quando o provedor externo falha.
                    </p>
                  </div>
                  <StatusBadge tone={data.fallbackAvailable ? "success" : "neutral"}>
                    {data.fallbackAvailable ? "Ativa" : "Inativa"}
                  </StatusBadge>
                </div>
                <div
                  className="cc6-hairline flex flex-wrap gap-x-10 gap-y-4 px-5 py-4"
                  aria-label="Volumes do núcleo"
                >
                  <div>
                    <p className="cc6-metric-value text-2xl leading-none">
                      {data.operatingSystem.memory.records}
                    </p>
                    <p className="cc6-metric-label mt-1.5">
                      Registros de memória
                    </p>
                  </div>
                  <div>
                    <p className="cc6-metric-value text-2xl leading-none">
                      {data.operatingSystem.knowledge.documents}
                    </p>
                    <p className="cc6-metric-label mt-1.5">
                      Materiais de conhecimento
                    </p>
                  </div>
                  <div>
                    <p className="cc6-metric-value text-2xl leading-none">
                      {data.operatingSystem.learningLoop.events}
                    </p>
                    <p className="cc6-metric-label mt-1.5">
                      Decisões aprendidas
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </div>

      <section
        aria-labelledby="ai-providers-title"
        className="cc6-panel cc6-reveal p-5"
        style={{ animationDelay: "260ms" }}
      >
        <header className="min-w-0">
          <p className="cc6-eyebrow">Provedores</p>
          <h2
            id="ai-providers-title"
            className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]"
          >
            Conexão comprovada, não presumida
          </h2>
          <p className="mt-1 text-xs leading-5 text-[#6b7890]">
            Chave configurada só vira rota operacional depois de uma resposta
            real registrada. Nenhum segredo chega ao navegador.
          </p>
        </header>
        <div
          className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
          aria-busy={diagnosing}
        >
          {!data
            ? [1, 2, 3].map((item) => (
                <AtlasSkeleton key={item} className="h-28 w-full" />
              ))
            : data.providerHealth.map((provider) => {
                const canTestHere = ["deepseek", "qwen", "kimi", "glm"].includes(provider.name);
                const liveResult = providerResults[provider.name];
                const operational = provider.status === "operational" || Boolean(liveResult);
                const meta = providerCatalog[provider.name];
                return (
                  <article
                    key={provider.name}
                    className="cc6-panel-quiet p-4 transition-colors hover:border-[rgba(148,163,184,0.28)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3
                        className={`text-sm font-semibold text-[#e8eef8] ${meta ? "" : "capitalize"}`}
                      >
                        {meta?.name ?? provider.name}
                      </h3>
                      <StatusBadge
                        tone={
                          operational
                            ? "success"
                            : provider.configured
                              ? "warning"
                              : "neutral"
                        }
                      >
                        {operational
                          ? "Operacional"
                          : provider.configured
                            ? "Aguardando teste"
                            : "Sem credencial"}
                      </StatusBadge>
                    </div>
                    {meta ? (
                      <p className="mt-1.5 text-xs leading-5 text-[#6b7890]">
                        {meta.role}
                      </p>
                    ) : null}
                    {liveResult ? (
                      <p className="cc6-num mt-2 text-xs text-[#aab6ca]">
                        {liveResult.model} · {liveResult.latencyMs} ms · teste
                        desta sessão
                      </p>
                    ) : provider.status === "operational" ? (
                      <p className="cc6-num mt-2 text-xs text-[#aab6ca]">
                        {provider.model ?? "modelo validado"} ·{" "}
                        {provider.latencyMs ?? 0} ms
                      </p>
                    ) : provider.configured ? (
                      <p className="mt-2 text-xs text-[#aab6ca]">
                        Falta uma resposta real registrada.
                      </p>
                    ) : null}
                    {provider.lastSuccessfulAt ? (
                      <p className="cc6-num mt-1.5 text-[10px] text-[#6b7890]">
                        Último sucesso ·{" "}
                        {new Date(provider.lastSuccessfulAt).toLocaleString("pt-BR")}
                      </p>
                    ) : null}
                    {canTestHere ? (
                      <button
                        type="button"
                        disabled={!provider.configured || providerTesting !== null}
                        onClick={() => void testEconomyProvider(provider.name)}
                        aria-label={`Testar ${meta?.name ?? provider.name}`}
                        className="cc6-ghost-btn mt-3 w-full justify-center disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {providerTesting === provider.name
                          ? "Testando…"
                          : "Testar agora"}
                      </button>
                    ) : null}
                  </article>
                );
              })}
        </div>
      </section>

      <section
        aria-labelledby="ai-agents-title"
        className="cc6-panel cc6-reveal p-5"
        style={{ animationDelay: "320ms" }}
      >
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="cc6-eyebrow">Agentes comerciais</p>
            <h2
              id="ai-agents-title"
              className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]"
            >
              Analisam, sugerem e registram
            </h2>
          </div>
          {data ? (
            <span className="cc6-chip">{data.agents.length} agentes</span>
          ) : null}
        </header>
        <div
          className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5"
          aria-busy={diagnosing}
        >
          {!data
            ? [1, 2, 3, 4, 5].map((item) => (
                <AtlasSkeleton key={item} className="h-24 w-full" />
              ))
            : data.agents.map((agent) => (
                <article
                  key={agent.id}
                  className="cc6-panel-quiet p-4 transition-colors hover:border-[rgba(148,163,184,0.28)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold text-[#e8eef8]">
                      {agent.name}
                    </h3>
                    <StatusBadge
                      tone={
                        agent.status === "supervised"
                          ? "success"
                          : agent.status === "deterministic"
                            ? "info"
                            : "warning"
                      }
                    >
                      {agent.status === "supervised"
                        ? "Supervisionado"
                        : agent.status === "deterministic"
                          ? "Local"
                          : "Preparado"}
                    </StatusBadge>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#6b7890]">
                    {agent.functions.join(" · ")}
                  </p>
                </article>
              ))}
        </div>
      </section>

      <section
        aria-labelledby="ai-proofs-title"
        className="cc6-panel cc6-reveal overflow-hidden"
        style={{ animationDelay: "380ms" }}
      >
        <header className="px-5 pb-4 pt-5">
          <p className="cc6-eyebrow">Provas ao vivo</p>
          <h2
            id="ai-proofs-title"
            className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]"
          >
            Aprovação exige resposta medida
          </h2>
          <p className="mt-1 text-xs leading-5 text-[#6b7890]">
            Chamadas mínimas, sem dados pessoais, com modelo, rastreio, tokens e
            latência registrados.
          </p>
        </header>

        <div className="cc6-hairline px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-[#e8eef8]">
                Chamada OpenAI real
              </h3>
              <p className="mt-0.5 text-xs leading-5 text-[#6b7890]">
                Responses API sem fallback; só aprova resposta íntegra com
                consumo medido.
              </p>
              {testResult ? (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge tone="success">Aprovado</StatusBadge>
                    <span className="cc6-num text-xs text-[#aab6ca]">
                      {testResult.model} · {testResult.latencyMs} ms ·{" "}
                      {testResult.usage.totalTokens} tokens
                    </span>
                  </div>
                  <p className="cc6-num mt-1.5 break-all text-[11px] text-[#6b7890]">
                    Rastreio {testResult.providerRequestId || "não retornado"} ·{" "}
                    {new Date(testResult.testedAt).toLocaleString("pt-BR")}
                  </p>
                </>
              ) : (
                <span className="cc6-chip mt-2">sem prova nesta sessão</span>
              )}
            </div>
            <button
              type="button"
              disabled={testing || !data?.gatewayConfigured}
              onClick={() => void testOpenAI()}
              aria-label="Executar chamada OpenAI real"
              className="cc6-ghost-btn shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {testing ? "Testando…" : "Executar"}
            </button>
          </div>
        </div>

        <div className="cc6-hairline px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-[#e8eef8]">
                Pesquisa Perplexity com fontes
              </h3>
              <p className="mt-0.5 text-xs leading-5 text-[#6b7890]">
                Consulta imobiliária sem PII; exige ao menos uma fonte HTTPS na
                resposta.
              </p>
              {researchResult ? (
                <>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <StatusBadge tone="success">Aprovado</StatusBadge>
                    <span className="cc6-num text-xs text-[#aab6ca]">
                      {researchResult.model} · {researchResult.latencyMs} ms ·{" "}
                      {researchResult.citationCount} fontes
                    </span>
                  </div>
                  <p className="cc6-num mt-1.5 break-all text-[11px] text-[#6b7890]">
                    Rastreio{" "}
                    {researchResult.providerRequestId || "não retornado"} ·{" "}
                    {new Date(researchResult.testedAt).toLocaleString("pt-BR")}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {researchResult.citations.map((url, index) => (
                      <a
                        key={url}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className={`cc6-chip transition-colors hover:border-[color:var(--atlas-accent)] hover:text-[#e8eef8] ${focusRing}`}
                      >
                        fonte {index + 1}
                      </a>
                    ))}
                  </div>
                </>
              ) : (
                <span className="cc6-chip mt-2">sem prova nesta sessão</span>
              )}
            </div>
            <button
              type="button"
              disabled={researchTesting || !data?.providers.perplexity}
              onClick={() => void testPerplexity()}
              aria-label="Executar pesquisa Perplexity com fontes"
              className="cc6-ghost-btn shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {researchTesting ? "Pesquisando…" : "Executar"}
            </button>
          </div>
        </div>

        <div className="cc6-hairline px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h3 className="text-sm font-medium text-[#e8eef8]">
                Roteamento e custo em três rotas
              </h3>
              <p className="mt-0.5 text-xs leading-5 text-[#6b7890]">
                Rápida, comercial e complexa com custo estimado pela tarifa
                configurada — configure as tarifas por milhão de tokens antes do
                ensaio.
              </p>
              {routingResult ? null : (
                <span className="cc6-chip mt-2">sem prova nesta sessão</span>
              )}
            </div>
            <button
              type="button"
              disabled={routingTesting || !data?.gatewayConfigured}
              onClick={() => void testCostRouting()}
              aria-label="Executar ensaio de roteamento e custo"
              className="cc6-ghost-btn shrink-0 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {routingTesting ? "Testando rotas…" : "Executar"}
            </button>
          </div>
          {routingResult ? (
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {routingResult.routes.map((route) => (
                <div
                  key={route.task}
                  className="cc6-sev-band cc6-panel-quiet py-3 pl-4 pr-3"
                  style={{ "--cc6-sev": "#34d399" } as CSSProperties}
                >
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm text-[#e8eef8]">
                      {route.task === "fast"
                        ? "Rápida"
                        : route.task === "commercial"
                          ? "Comercial"
                          : "Complexa"}
                    </strong>
                    <StatusBadge tone="success">Comprovada</StatusBadge>
                  </div>
                  <p className="cc6-num mt-2 text-xs text-[#aab6ca]">
                    {route.model}
                  </p>
                  <p className="cc6-num mt-1 text-[11px] text-[#6b7890]">
                    {route.tokens.totalTokens} tokens · {route.latencyMs} ms ·
                    US$ {route.estimatedCostUsd.toFixed(6)}
                  </p>
                </div>
              ))}
              <p className="cc6-num text-[11px] text-[#6b7890] lg:col-span-3">
                Ensaio total US$ {routingResult.totalEstimatedCostUsd.toFixed(6)}{" "}
                · sem dados pessoais ·{" "}
                {new Date(routingResult.testedAt).toLocaleString("pt-BR")}
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section
        aria-labelledby="ai-sources-title"
        className="cc6-panel cc6-reveal overflow-hidden"
        style={{ animationDelay: "440ms" }}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
          <div className="min-w-0">
            <p className="cc6-eyebrow">Market grounding</p>
            <h2
              id="ai-sources-title"
              className="mt-1 text-lg font-semibold tracking-tight text-[#e8eef8]"
            >
              Fontes de calibração
            </h2>
          </div>
          {data ? (
            <span className="cc6-chip">
              verificada em{" "}
              {new Date(
                `${data.calibrationVerifiedAt}T12:00:00`,
              ).toLocaleDateString("pt-BR")}
            </span>
          ) : null}
        </header>
        <div aria-busy={diagnosing}>
          {!data ? (
            <div className="space-y-3 px-5 pb-5">
              {[1, 2, 3].map((item) => (
                <AtlasSkeleton key={item} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            data.marketSources.map((source) => (
              <a
                key={source.id}
                href={source.url}
                target="_blank"
                rel="noreferrer"
                className={`cc6-hairline group flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-[rgba(75,141,248,0.04)] ${focusRing}`}
              >
                <span className="min-w-0">
                  <strong className="block text-sm font-medium text-[#e8eef8]">
                    {source.publisher}
                  </strong>
                  <span className="mt-0.5 block text-xs leading-5 text-[#6b7890]">
                    {source.title}
                  </span>
                </span>
                <span className="cc6-num shrink-0 text-[11px] text-[#6b7890]">
                  {new Date(
                    `${source.verifiedAt}T12:00:00`,
                  ).toLocaleDateString("pt-BR")}
                  <span
                    aria-hidden="true"
                    className="ml-2 inline-block transition-transform group-hover:translate-x-0.5"
                  >
                    →
                  </span>
                </span>
              </a>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
