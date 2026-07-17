"use client";

import { useEffect, useState } from "react";
import { AtlasBadge, AtlasSkeleton } from "@/components/ui/AtlasUI";
import { AtlasCard, AtlasCardHeader, AtlasMetric } from "@/components/ui/AtlasCard";
import { supabase } from "@/lib/supabase";

type AIStatus = {
  status: "ready" | "degraded";
  gatewayConfigured: boolean;
  fallbackAvailable: boolean;
  model: string;
  domain: string;
  calibrationVerifiedAt: string;
  marketSources: Array<{ id: string; title: string; publisher: string; url: string; verifiedAt: string }>;
  controls: Record<string, boolean>;
  providers: { openai: boolean; perplexity: boolean; localFallback: boolean; host: "hostinger" };
  usage: { calls: number; tokens: number; averageLatencyMs: number; openaiCalls: number; perplexityCalls: number; localCalls: number; periodDays: number };
};

const controlLabels: Record<string, string> = {
  operationalContext: "Contexto operacional do CRM",
  hierarchyAware: "Respeito à hierarquia comercial",
  personalDataProtection: "Proteção de dados pessoais",
  promptInjectionGuard: "Defesa contra instruções maliciosas",
  financialDisclaimer: "Limites para crédito e investimento",
  localFallback: "Motor local de contingência",
};

export default function AISettings() {
  const [data, setData] = useState<AIStatus | null>(null);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ model: string; providerRequestId: string | null; latencyMs: number; usage: { totalTokens: number }; testedAt: string } | null>(null);
  const [researchTesting, setResearchTesting] = useState(false);
  const [researchResult, setResearchResult] = useState<{ model: string; providerRequestId: string | null; latencyMs: number; citationCount: number; citations: string[]; testedAt: string } | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/ai/status").then(async (response) => {
      const payload = await response.json();
      if (!active) return;
      if (!response.ok) setError(payload?.error?.message || "Não foi possível diagnosticar a IA.");
      else setData(payload as AIStatus);
    }).catch((statusError) => {
      if (active) setError(statusError instanceof Error ? statusError.message : "Falha no diagnóstico da IA.");
    });
    return () => { active = false; };
  }, []);

  const enabledControls = data ? Object.values(data.controls).filter(Boolean).length : 0;

  async function testOpenAI() {
    setTesting(true); setError("");
    try { const { data: session } = await supabase.auth.getSession(); const response = await fetch("/api/ai/openai-test", { method: "POST", headers: { Authorization: `Bearer ${session.session?.access_token}` } }); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Teste OpenAI falhou."); setTestResult(body.data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Teste OpenAI falhou."); }
    finally { setTesting(false); }
  }

  async function testPerplexity() {
    setResearchTesting(true); setError("");
    try { const { data: session } = await supabase.auth.getSession(); const response = await fetch("/api/ai/perplexity-test", { method: "POST", headers: { Authorization: `Bearer ${session.session?.access_token}` } }); const body = await response.json(); if (!response.ok) throw new Error(body.error?.message || "Teste Perplexity falhou."); setResearchResult(body.data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Teste Perplexity falhou."); }
    finally { setResearchTesting(false); }
  }

  return (
    <div className="space-y-6 pb-10">
      <section className="atlas-grid-glow overflow-hidden rounded-[30px] border border-cyan-400/10 bg-gradient-to-br from-cyan-500/[.1] via-blue-500/[.07] to-violet-500/[.12] p-6 sm:p-8">
        <div className="grid gap-7 xl:grid-cols-[1.35fr_.65fr] xl:items-end">
          <div>
            <div className="flex flex-wrap gap-2"><AtlasBadge tone="info">AI CONTROL</AtlasBadge><AtlasBadge tone="violet">REAL ESTATE</AtlasBadge><AtlasBadge tone={data?.status === "ready" ? "success" : "warning"}>{data?.status === "ready" ? "PRONTA" : "MODO SEGURO"}</AtlasBadge></div>
            <h1 className="mt-5 max-w-4xl text-3xl font-semibold tracking-[-.04em] text-white sm:text-5xl">Inteligência imobiliária com contexto, limites e contingência.</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-300">Diagnóstico do modelo, calibração de mercado, proteção de dados e capacidade de continuar operando quando o provedor generativo estiver indisponível.</p>
          </div>
          <div className="rounded-3xl border border-white/[0.08] bg-[#070d1b]/75 p-5"><p className="atlas-eyebrow">Modelo preferencial</p><p className="mt-2 break-all text-lg font-semibold text-white">{data?.model || "Carregando..."}</p><p className="mt-2 text-xs text-slate-500">Configurável por ambiente, sem expor credenciais.</p></div>
        </div>
      </section>

      {error ? <div className="rounded-2xl border border-rose-400/20 bg-rose-400/10 p-4 text-sm text-rose-200">{error}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AtlasMetric label="Provedor generativo" value={!data ? "—" : data.gatewayConfigured ? "Ativo" : "Pendente"} detail={data?.gatewayConfigured ? "OpenAI direta no servidor" : "Credencial necessária em homologação"} trend={data?.gatewayConfigured ? "ONLINE" : "CONFIG"} tone={data?.gatewayConfigured ? "green" : "amber"} />
        <AtlasMetric label="Contingência local" value={!data ? "—" : data.fallbackAvailable ? "Ativa" : "Inativa"} detail="Resposta operacional mesmo sem provedor" trend="RESILIENTE" tone="blue" />
        <AtlasMetric label="Controles ativos" value={!data ? "—" : `${enabledControls}/${Object.keys(data.controls).length}`} detail="Privacidade, hierarquia e segurança" trend="GUARDRAILS" tone="violet" />
        <AtlasMetric label="Pesquisa atualizada" value={!data ? "—" : data.providers.perplexity ? "Ativa" : "Pendente"} detail="Perplexity sem envio de PII" trend="SONAR" tone={data?.providers.perplexity ? "green" : "amber"} />
      </section>
      <section className="grid gap-4 sm:grid-cols-3"><AtlasMetric label="Chamadas de IA · 30 dias" value={data?.usage.calls ?? "—"} detail={`${data?.usage.openaiCalls ?? 0} OpenAI · ${data?.usage.perplexityCalls ?? 0} Perplexity · ${data?.usage.localCalls ?? 0} fallback`} trend="USO" tone="blue" /><AtlasMetric label="Tokens processados" value={data?.usage.tokens?.toLocaleString("pt-BR") ?? "—"} detail="Base para apuração de custo" trend="CUSTO" tone="amber" /><AtlasMetric label="Latência média" value={data ? `${data.usage.averageLatencyMs} ms` : "—"} detail="Tempo dos provedores externos" trend="SLA" tone="green" /></section>

      <AtlasCard><AtlasCardHeader eyebrow="Fase 22 · OpenAI real" title="Teste rastreável sem fallback" description="Executa uma chamada mínima na Responses API. Só aprova se a resposta vier da OpenAI, for íntegra e tiver consumo medido." /><div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div>{testResult ? <><div className="flex items-center gap-2"><AtlasBadge tone="success">APROVADO</AtlasBadge><span className="text-sm text-white">{testResult.model} · {testResult.latencyMs} ms · {testResult.usage.totalTokens} tokens</span></div><p className="mt-2 break-all text-xs text-slate-500">Rastreio OpenAI: {testResult.providerRequestId || "identificador não retornado"} · {new Date(testResult.testedAt).toLocaleString("pt-BR")}</p></> : <p className="text-sm text-slate-400">Nenhuma chamada real foi comprovada nesta sessão.</p>}</div><button disabled={testing || !data?.gatewayConfigured} onClick={() => void testOpenAI()} className="atlas-button-primary">{testing ? "Testando…" : "Testar OpenAI real"}</button></div></AtlasCard>

      <AtlasCard><AtlasCardHeader eyebrow="Fase 23 · Perplexity real" title="Pesquisa web com fontes obrigatórias" description="Executa uma consulta imobiliária sem PII. Só aprova quando a Sonar API retorna ao menos uma fonte HTTPS e o consumo é medido." /><div className="flex flex-col gap-4 p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div>{researchResult ? <><div className="flex items-center gap-2"><AtlasBadge tone="success">APROVADO</AtlasBadge><span className="text-sm text-white">{researchResult.model} · {researchResult.latencyMs} ms · {researchResult.citationCount} fontes</span></div><p className="mt-2 break-all text-xs text-slate-500">Rastreio Perplexity: {researchResult.providerRequestId || "identificador não retornado"} · {new Date(researchResult.testedAt).toLocaleString("pt-BR")}</p></> : <p className="text-sm text-slate-400">Nenhuma pesquisa real com fontes foi comprovada nesta sessão.</p>}</div><button disabled={researchTesting || !data?.providers.perplexity} onClick={() => void testPerplexity()} className="atlas-button-primary">{researchTesting ? "Pesquisando…" : "Testar Perplexity real"}</button></div>{researchResult ? <div className="flex flex-wrap gap-2">{researchResult.citations.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" className="atlas-button-secondary">Fonte {index + 1}</a>)}</div> : null}</div></AtlasCard>

      <section className="grid gap-6 xl:grid-cols-2">
        <AtlasCard>
          <AtlasCardHeader eyebrow="Guardrails" title="Controles da inteligência" description="Proteções aplicadas em toda consulta do Copilot." />
          <div className="space-y-3 p-5 sm:p-6">
            {!data ? [1,2,3,4].map((item) => <AtlasSkeleton key={item} className="h-14 w-full" />) : Object.entries(data.controls).map(([key, enabled]) => <div key={key} className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3"><span className="text-sm text-slate-300">{controlLabels[key] || key}</span><AtlasBadge tone={enabled ? "success" : "danger"}>{enabled ? "ATIVO" : "INATIVO"}</AtlasBadge></div>)}
          </div>
        </AtlasCard>

        <AtlasCard>
          <AtlasCardHeader eyebrow="Market grounding" title="Fontes de calibração" description={`Base verificada em ${data ? new Date(`${data.calibrationVerifiedAt}T12:00:00`).toLocaleDateString("pt-BR") : "—"}.`} />
          <div className="space-y-3 p-5 sm:p-6">
            {!data ? [1,2,3].map((item) => <AtlasSkeleton key={item} className="h-16 w-full" />) : data.marketSources.map((source) => <a key={source.id} href={source.url} target="_blank" rel="noreferrer" className="block rounded-2xl border border-white/[0.06] bg-white/[0.025] p-4 transition hover:border-sky-400/20 hover:bg-sky-400/[0.04]"><strong className="block text-sm text-white">{source.publisher}</strong><span className="mt-1 block text-xs text-slate-400">{source.title}</span><span className="mt-2 block text-[10px] uppercase tracking-[.14em] text-sky-300">Verificado em {new Date(`${source.verifiedAt}T12:00:00`).toLocaleDateString("pt-BR")} →</span></a>)}
          </div>
        </AtlasCard>
      </section>
    </div>
  );
}
