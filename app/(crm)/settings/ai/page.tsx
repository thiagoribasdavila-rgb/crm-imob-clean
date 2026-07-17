"use client";

import Link from "next/link";

import { useEffect, useState } from "react";
import { AtlasBadge, AtlasSkeleton } from "@/components/ui/AtlasUI";
import {
  AtlasCard,
  AtlasCardHeader,
  AtlasMetric,
} from "@/components/ui/AtlasCard";
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

const controlLabels: Record<string, string> = {
  operationalContext: "Contexto operacional do CRM",
  hierarchyAware: "Respeito à hierarquia comercial",
  personalDataProtection: "Proteção de dados pessoais",
  promptInjectionGuard: "Defesa contra instruções maliciosas",
  financialDisclaimer: "Limites para crédito e investimento",
  localFallback: "Motor local de contingência",
  adaptiveComplexityRouting: "Roteamento adaptativo por complexidade",
  humanReviewEscalation: "Escalonamento para revisão humana",
};

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

  return (
    <div className="space-y-6 pb-10">
      <section className="atlas-grid-glow overflow-hidden rounded-[30px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.1] via-blue-500/[.07] to-violet-500/[.12] p-6 sm:p-8">
        <div className="grid gap-7 xl:grid-cols-[1.35fr_.65fr] xl:items-end">
          <div>
            <div className="flex flex-wrap gap-2">
              <AtlasBadge tone="info">AI CONTROL</AtlasBadge>
              <AtlasBadge tone="violet">REAL ESTATE</AtlasBadge>
              <AtlasBadge
                tone={data?.status === "ready" ? "success" : "warning"}
              >
                {data?.status === "ready" ? "PRONTA" : "MODO SEGURO"}
              </AtlasBadge>
            </div>
            <h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">
              Inteligência imobiliária com contexto, limites e contingência.
            </h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">
              Diagnóstico do modelo, calibração de mercado, proteção de dados e
              capacidade de continuar operando quando o provedor generativo
              estiver indisponível.
            </p>
            <div className="mt-5 flex flex-wrap gap-3"><Link href="/settings/ai-orchestration" className="atlas-button-secondary inline-flex">Abrir orquestrador comercial →</Link><Link href="/settings/ai-context" className="atlas-button-secondary inline-flex">Auditar contexto enviado →</Link></div>
          </div>
          <div className="rounded-3xl border border-white/[0.08] bg-[#070d1b]/75 p-5">
            <p className="atlas-eyebrow">Roteamento eficiente</p>
            <div className="mt-3 space-y-2 text-xs">{data ? [["Rápida", data.models.fast], ["Comercial", data.models.commercial], ["Complexa", data.models.reasoning], ["Pesquisa", data.models.research]].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-3"><span className="text-slate-500">{label}</span><strong className="text-right text-slate-200">{value}</strong></div>) : <p className="text-slate-500">Carregando rotas...</p>}</div>
            <p className="mt-3 text-[10px] leading-4 text-slate-600">O Atlas escolhe a menor rota capaz de executar cada tarefa e registra latência, tokens e custo.</p>
          </div>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AtlasMetric
          label="Provedor generativo"
          value={!data ? "—" : data.gatewayConfigured ? "Ativo" : "Pendente"}
          detail={
            data?.gatewayConfigured
              ? "OpenAI direta no servidor"
              : "Credencial necessária em homologação"
          }
          trend={data?.gatewayConfigured ? "ONLINE" : "CONFIG"}
          tone={data?.gatewayConfigured ? "green" : "amber"}
        />
        <AtlasMetric
          label="Contingência local"
          value={!data ? "—" : data.fallbackAvailable ? "Ativa" : "Inativa"}
          detail="Resposta operacional mesmo sem provedor"
          trend="RESILIENTE"
          tone="blue"
        />
        <AtlasMetric
          label="Controles ativos"
          value={
            !data
              ? "—"
              : `${enabledControls}/${Object.keys(data.controls).length}`
          }
          detail="Privacidade, hierarquia e segurança"
          trend="GUARDRAILS"
          tone="violet"
        />
        <AtlasMetric
          label="Pesquisa atualizada"
          value={!data ? "—" : data.providers.perplexity ? "Ativa" : "Pendente"}
          detail="Perplexity sem envio de PII"
          trend="SONAR"
          tone={data?.providers.perplexity ? "green" : "amber"}
        />
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AtlasMetric
          label="Chamadas de IA · 30 dias"
          value={data?.usage.calls ?? "—"}
          detail={`${data?.usage.openaiCalls ?? 0} OpenAI · ${data?.usage.perplexityCalls ?? 0} pesquisa · ${data?.usage.economyCalls ?? 0} econômicas · ${data?.usage.localCalls ?? 0} fallback`}
          trend="USO"
          tone="blue"
        />
        <AtlasMetric
          label="Tokens processados"
          value={data?.usage.tokens?.toLocaleString("pt-BR") ?? "—"}
          detail="Base para apuração de custo"
          trend="CUSTO"
          tone="amber"
        />
        <AtlasMetric
          label="Latência média"
          value={data ? `${data.usage.averageLatencyMs} ms` : "—"}
          detail="Tempo dos provedores externos"
          trend="SLA"
          tone="green"
        />
        <AtlasMetric
          label="Custo estimado · 30 dias"
          value={data ? `US$ ${data.usage.estimatedCostUsd.toFixed(4)}` : "—"}
          detail="Tarifas configuradas na Hostinger"
          trend="FINOPS"
          tone="violet"
        />
      </section>

      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Orquestração final · V3"
          title="Cada IA no trabalho em que entrega mais valor"
          description="As rotas econômicas só ficam ativas com chave e modelo homologados na Hostinger. Dados pessoais permanecem exclusivamente na rota OpenAI."
        />
        <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 sm:p-6">
          {[
            ["Qwen", "Resumos e tarefas rápidas", data?.providers.qwen],
            ["DeepSeek", "Raciocínio econômico e fallback", data?.providers.deepseek],
            ["Kimi", "Documentos e contexto extenso", data?.providers.kimi],
            ["GLM", "Agentes e segunda opinião", data?.providers.glm],
          ].map(([name, role, ready]) => (
            <div key={String(name)} className="rounded-2xl border border-white/[.07] bg-white/[.025] p-4">
              <div className="flex items-center justify-between gap-2"><span className="font-medium text-white">{String(name)}</span><AtlasBadge tone={ready ? "success" : "neutral"}>{ready ? "PRONTA" : "OPCIONAL"}</AtlasBadge></div>
              <p className="mt-2 text-xs leading-5 text-slate-400">{String(role)}</p>
            </div>
          ))}
        </div>
      </AtlasCard>

      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Fase 22 · OpenAI real"
          title="Teste rastreável sem fallback"
          description="Executa uma chamada mínima na Responses API. Só aprova se a resposta vier da OpenAI, for íntegra e tiver consumo medido."
        />
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            {testResult ? (
              <>
                <div className="flex items-center gap-2">
                  <AtlasBadge tone="success">APROVADO</AtlasBadge>
                  <span className="text-sm text-white">
                    {testResult.model} · {testResult.latencyMs} ms ·{" "}
                    {testResult.usage.totalTokens} tokens
                  </span>
                </div>
                <p className="mt-2 break-all text-xs text-slate-500">
                  Rastreio OpenAI:{" "}
                  {testResult.providerRequestId ||
                    "identificador não retornado"}{" "}
                  · {new Date(testResult.testedAt).toLocaleString("pt-BR")}
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                Nenhuma chamada real foi comprovada nesta sessão.
              </p>
            )}
          </div>
          <button
            disabled={testing || !data?.gatewayConfigured}
            onClick={() => void testOpenAI()}
            className="atlas-button-primary"
          >
            {testing ? "Testando…" : "Testar OpenAI real"}
          </button>
        </div>
      </AtlasCard>

      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Fase 23 · Perplexity real"
          title="Pesquisa web com fontes obrigatórias"
          description="Executa uma consulta imobiliária sem PII. Só aprova quando a Sonar API retorna ao menos uma fonte HTTPS e o consumo é medido."
        />
        <div className="flex flex-col gap-4 p-5 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              {researchResult ? (
                <>
                  <div className="flex items-center gap-2">
                    <AtlasBadge tone="success">APROVADO</AtlasBadge>
                    <span className="text-sm text-white">
                      {researchResult.model} · {researchResult.latencyMs} ms ·{" "}
                      {researchResult.citationCount} fontes
                    </span>
                  </div>
                  <p className="mt-2 break-all text-xs text-slate-500">
                    Rastreio Perplexity:{" "}
                    {researchResult.providerRequestId ||
                      "identificador não retornado"}{" "}
                    ·{" "}
                    {new Date(researchResult.testedAt).toLocaleString("pt-BR")}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-400">
                  Nenhuma pesquisa real com fontes foi comprovada nesta sessão.
                </p>
              )}
            </div>
            <button
              disabled={researchTesting || !data?.providers.perplexity}
              onClick={() => void testPerplexity()}
              className="atlas-button-primary"
            >
              {researchTesting ? "Pesquisando…" : "Testar Perplexity real"}
            </button>
          </div>
          {researchResult ? (
            <div className="flex flex-wrap gap-2">
              {researchResult.citations.map((url, index) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="atlas-button-secondary"
                >
                  Fonte {index + 1}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      </AtlasCard>

      <AtlasCard>
        <AtlasCardHeader
          eyebrow="Fase 33 · Roteamento e custo"
          title="Comprovar rotas rápida, comercial e complexa"
          description="Executa três chamadas mínimas sem dados pessoais. Cada uma deve retornar da OpenAI com modelo, rastreio, tokens, latência e custo estimado pela tarifa configurada."
        />
        <div className="space-y-4 p-5 sm:p-6">
          <button
            disabled={routingTesting || !data?.gatewayConfigured}
            onClick={() => void testCostRouting()}
            className="atlas-button-primary w-full disabled:opacity-40"
          >
            {routingTesting ? "Testando três rotas..." : "Executar ensaio de custo"}
          </button>
          {routingResult ? (
            <div className="grid gap-3 lg:grid-cols-3">
              {routingResult.routes.map((route) => (
                <div key={route.task} className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[.07] p-4">
                  <div className="flex items-center justify-between gap-2"><strong className="capitalize text-white">{route.task === "fast" ? "Rápida" : route.task === "commercial" ? "Comercial" : "Complexa"}</strong><AtlasBadge tone="success">COMPROVADA</AtlasBadge></div>
                  <p className="mt-3 text-sm text-slate-300">{route.model}</p>
                  <p className="mt-2 text-xs text-slate-500">{route.tokens.totalTokens} tokens · {route.latencyMs} ms · US$ {route.estimatedCostUsd.toFixed(6)}</p>
                </div>
              ))}
              <p className="text-xs text-slate-500 lg:col-span-3">Custo total do ensaio: US$ {routingResult.totalEstimatedCostUsd.toFixed(6)} · sem dados pessoais · {new Date(routingResult.testedAt).toLocaleString("pt-BR")}</p>
            </div>
          ) : (
            <p className="text-xs text-slate-500">Configure as tarifas por milhão de tokens das três rotas antes do ensaio para evitar custos inventados ou desatualizados.</p>
          )}
        </div>
      </AtlasCard>

      <section className="grid gap-6 xl:grid-cols-2">
        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Guardrails"
            title="Controles da inteligência"
            description="Proteções aplicadas em toda consulta do Copilot."
          />
          <div className="space-y-3 p-5 sm:p-6">
            {!data
              ? [1, 2, 3, 4].map((item) => (
                  <AtlasSkeleton key={item} className="h-14 w-full" />
                ))
              : Object.entries(data.controls).map(([key, enabled]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3"
                  >
                    <span className="text-sm text-slate-300">
                      {controlLabels[key] || key}
                    </span>
                    <AtlasBadge tone={enabled ? "success" : "danger"}>
                      {enabled ? "ATIVO" : "INATIVO"}
                    </AtlasBadge>
                  </div>
                ))}
          </div>
        </AtlasCard>

        <AtlasCard>
          <AtlasCardHeader
            eyebrow="Market grounding"
            title="Fontes de calibração"
            description={`Base verificada em ${data ? new Date(`${data.calibrationVerifiedAt}T12:00:00`).toLocaleDateString("pt-BR") : "—"}.`}
          />
          <div className="space-y-3 p-5 sm:p-6">
            {!data
              ? [1, 2, 3].map((item) => (
                  <AtlasSkeleton key={item} className="h-16 w-full" />
                ))
              : data.marketSources.map((source) => (
                  <a
                    key={source.id}
                    href={source.url}
                    target="_blank"
                    rel="noreferrer"
                    className="block rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 transition hover:border-sky-400/20 hover:bg-sky-400/[0.04]"
                  >
                    <strong className="block text-sm text-white">
                      {source.publisher}
                    </strong>
                    <span className="mt-1 block text-xs text-slate-400">
                      {source.title}
                    </span>
                    <span className="mt-2 block text-[10px] uppercase tracking-[.14em] text-sky-300">
                      Verificado em{" "}
                      {new Date(
                        `${source.verifiedAt}T12:00:00`,
                      ).toLocaleDateString("pt-BR")}{" "}
                      →
                    </span>
                  </a>
                ))}
          </div>
        </AtlasCard>
      </section>
    </div>
  );
}
