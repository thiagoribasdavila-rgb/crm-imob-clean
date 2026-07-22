import "server-only";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { assessAIComplexity } from "@/lib/ai/complexity";
import { planCommercialAI, type AIExecutionPlan, type RoutedProvider } from "@/lib/ai/commercial-orchestrator";
import { AI_GUARD_SYSTEM_POLICY, assessAIInput, inspectAndSanitizeAIOutput } from "@/lib/ai/instruction-output-guard";

export type AITask = "fast" | "commercial" | "reasoning" | "research";
export type GenerateInput = {
  task: AITask;
  system: string;
  prompt: string;
  containsPersonalData?: boolean;
  timeoutMs?: number;
  organizationId: string;
  userId?: string;
  feature: string;
  signal?: AbortSignal;
};
export type AIProviderResult = {
  text: string;
  provider: "openai" | "anthropic" | "perplexity" | "deepseek" | "qwen" | "kimi" | "glm" | "local";
  model: string;
  latencyMs: number;
  citations: string[];
  providerRequestId?: string;
  // cachedInputTokens/cacheWriteTokens: sem capturá-los, todo token de entrada é
  // precificado à tarifa cheia e nenhuma economia de cache de prompt é verificável.
  usage: { inputTokens: number; outputTokens: number; totalTokens: number; cachedInputTokens?: number; cacheWriteTokens?: number };
  cost?: {
    inputUsd: number | null;
    outputUsd: number | null;
    estimatedUsd: number | null;
    pricingConfigured: boolean;
    pricingSource: string;
  };
  guardrail?: { risk: "low" | "medium" | "high"; blocked: boolean; humanReviewRequired: boolean; findingCodes: string[] };
};

export type EconomyProvider = "deepseek" | "qwen" | "kimi" | "glm";
const economyProviders: Record<EconomyProvider, { key: string; model: string; baseUrl: string }> = {
  deepseek: { key: "DEEPSEEK_API_KEY", model: "ATLAS_DEEPSEEK_MODEL", baseUrl: "https://api.deepseek.com/chat/completions" },
  qwen: { key: "QWEN_API_KEY", model: "ATLAS_QWEN_MODEL", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions" },
  kimi: { key: "KIMI_API_KEY", model: "ATLAS_KIMI_MODEL", baseUrl: "https://api.moonshot.ai/v1/chat/completions" },
  glm: { key: "GLM_API_KEY", model: "ATLAS_GLM_MODEL", baseUrl: "https://open.bigmodel.cn/api/paas/v4/chat/completions" },
};

export function aiModelProfiles() {
  return {
    fast: process.env.ATLAS_AI_FAST_MODEL || "gpt-5-mini",
    commercial: process.env.ATLAS_AI_COMMERCIAL_MODEL || process.env.ATLAS_AI_MODEL || "gpt-5.2",
    reasoning: process.env.ATLAS_AI_REASONING_MODEL || process.env.ATLAS_AI_MODEL || "gpt-5.2",
    research: process.env.ATLAS_RESEARCH_MODEL || "sonar",
  } as const;
}

export function selectCopilotTask(prompt: string): Exclude<AITask, "research"> {
  return assessAIComplexity(prompt).task;
}

type TierPrefix = "FAST" | "COMMERCIAL" | "REASONING" | "RESEARCH";
function tierPrefix(task: AITask): TierPrefix {
  return task === "fast" ? "FAST" : task === "commercial" ? "COMMERCIAL" : task === "research" ? "RESEARCH" : "REASONING";
}

export type ModelFamily = "openai" | "anthropic" | "perplexity" | "economy" | "desconhecida";

/**
 * Família do modelo deduzida do nome. Enviar modelo de uma família para a API de
 * outra falha em 100% das chamadas — e a falha fica INVISÍVEL, porque o roteador
 * cai no fallback determinístico, ainda queima o retry e registra "completed".
 * Família desconhecida nunca bloqueia: só famílias comprovadamente incompatíveis.
 */
export function modelFamily(model: string): ModelFamily {
  const value = String(model || "").trim().toLowerCase();
  if (!value) return "desconhecida";
  if (/^(ft:)?(gpt|chatgpt|o[1-9])/.test(value)) return "openai";
  if (/^(claude|anthropic)/.test(value)) return "anthropic";
  if (/^(sonar|pplx)/.test(value)) return "perplexity";
  if (/^(deepseek|qwen|kimi|moonshot|glm|zhipu)/.test(value)) return "economy";
  return "desconhecida";
}

const openAIDefaultModel = (task: AITask) => (task === "fast" ? "gpt-5-mini" : "gpt-5.2");

export type ResolvedModel = { model: string; source: string; problem: string | null };

/**
 * O modelo é função do par (tier, provedor), não do tier: o mesmo tier pode ser
 * servido por OpenAI ou Anthropic conforme a ordem configurada, e o caminho de
 * dado pessoal força OpenAI ignorando a ordem. Uma única variável por tier é o
 * que fazia um nome de modelo Anthropic ser enviado à API da OpenAI.
 */
export function resolveProviderModel(task: AITask, provider: "openai" | "anthropic"): ResolvedModel {
  const prefix = tierPrefix(task);
  if (provider === "anthropic") {
    const candidates: Array<[string, string | undefined]> = [
      [`ATLAS_AI_${prefix}_MODEL_ANTHROPIC`, process.env[`ATLAS_AI_${prefix}_MODEL_ANTHROPIC`]],
      ["ATLAS_ANTHROPIC_MODEL", process.env.ATLAS_ANTHROPIC_MODEL],
      ["ATLAS_CLAUDE_MODEL", process.env.ATLAS_CLAUDE_MODEL],
    ];
    const chosen = candidates.find(([, value]) => Boolean(value && value.trim()));
    // Sem default implícito: o tier mais caro jamais deve ser servido pelo modelo
    // mais caro por omissão de variável.
    if (!chosen) return { model: "", source: "ausente", problem: `Tier ${task}: nenhum modelo Anthropic configurado — defina ATLAS_ANTHROPIC_MODEL.` };
    const model = String(chosen[1]).trim();
    const family = modelFamily(model);
    if (family !== "anthropic" && family !== "desconhecida") return { model: "", source: chosen[0], problem: `Tier ${task}: ${chosen[0]}="${model}" é da família ${family} e não pode ser enviado à API da Anthropic.` };
    return { model, source: chosen[0], problem: null };
  }
  const explicit = process.env[`ATLAS_AI_${prefix}_MODEL_OPENAI`]?.trim();
  if (explicit) {
    const explicitFamily = modelFamily(explicit);
    if (explicitFamily === "openai" || explicitFamily === "desconhecida") return { model: explicit, source: `ATLAS_AI_${prefix}_MODEL_OPENAI`, problem: null };
    return { model: openAIDefaultModel(task), source: "padrao_openai", problem: `Tier ${task}: ATLAS_AI_${prefix}_MODEL_OPENAI="${explicit}" é da família ${explicitFamily}; servindo ${openAIDefaultModel(task)} para não derrubar o tier.` };
  }
  // O tier research é servido pela Perplexity; quando o caminho de dado pessoal
  // força OpenAI, o modelo correto é o de raciocínio — nunca "sonar".
  const baseTask: AITask = task === "research" ? "reasoning" : task;
  const basePrefix = tierPrefix(baseTask);
  const tierModel = String(aiModelProfiles()[baseTask] || "").trim();
  if (!tierModel) return { model: openAIDefaultModel(baseTask), source: "padrao_openai", problem: null };
  const family = modelFamily(tierModel);
  if (family === "openai" || family === "desconhecida") return { model: tierModel, source: `ATLAS_AI_${basePrefix}_MODEL`, problem: null };
  return { model: openAIDefaultModel(baseTask), source: "padrao_openai", problem: `Tier ${task}: ATLAS_AI_${basePrefix}_MODEL="${tierModel}" é da família ${family} e estava sendo enviado à API da OpenAI. Defina ATLAS_AI_${basePrefix}_MODEL_OPENAI ou corrija a variável — declaração duplicada no .env vence pela última ocorrência.` };
}

export type AITariff = { inputPerMillion: number; outputPerMillion: number; cachedInputPerMillion?: number; cacheWritePerMillion?: number };

let priceTableCache: { raw: string; table: Record<string, AITariff> } | null = null;

/**
 * Tarifa por (provedor, modelo) em ATLAS_AI_PRICE_TABLE (JSON).
 * Precificar por TIER produz número plausível e errado: o mesmo tier é servido
 * por modelos com ordens de grandeza de diferença de preço.
 * Formato: {"openai/gpt-5.2":{"input":1.25,"output":10,"cachedInput":0.125}}
 * Chave "provedor/*" vale como tarifa padrão daquele provedor.
 */
function priceTable(): Record<string, AITariff> {
  const raw = process.env.ATLAS_AI_PRICE_TABLE || "";
  if (priceTableCache && priceTableCache.raw === raw) return priceTableCache.table;
  const table: Record<string, AITariff> = {};
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as Record<string, Record<string, unknown>>;
      for (const [key, value] of Object.entries(parsed || {})) {
        const positive = (candidate: unknown) => { const parsedNumber = Number(candidate); return Number.isFinite(parsedNumber) && parsedNumber > 0 ? parsedNumber : null; };
        const inputPerMillion = positive(value?.inputUsdPerMillion ?? value?.input);
        const outputPerMillion = positive(value?.outputUsdPerMillion ?? value?.output);
        if (inputPerMillion === null || outputPerMillion === null) continue;
        table[key.trim().toLowerCase()] = {
          inputPerMillion,
          outputPerMillion,
          cachedInputPerMillion: positive(value?.cachedInputUsdPerMillion ?? value?.cachedInput) ?? undefined,
          cacheWritePerMillion: positive(value?.cacheWriteUsdPerMillion ?? value?.cacheWrite) ?? undefined,
        };
      }
    } catch {
      // Tabela inválida = sem tarifa. Preço nunca é inferido: sem lastro, sem número.
    }
  }
  priceTableCache = { raw, table };
  return table;
}

function tariffFor(provider: string, model: string): { tariff: AITariff | null; source: string } {
  const table = priceTable();
  const exact = table[`${provider}/${model}`.trim().toLowerCase()];
  if (exact) return { tariff: exact, source: `tabela:${provider}/${model}` };
  const byProvider = table[`${provider}/*`];
  if (byProvider) return { tariff: byProvider, source: `tabela:${provider}/*` };
  return { tariff: null, source: `sem_tarifa:${provider}/${model || "modelo_desconhecido"}` };
}

// Herança: tarifa por tier. Mantida apenas para AVISAR que foi ignorada — o
// operador que preencheu ATLAS_AI_<TIER>_INPUT_USD_PER_MILLION precisa saber que
// o preço passou a ser por par (provedor, modelo).
function legacyTierPricingDeclared(task: AITask) {
  const prefix = tierPrefix(task);
  return Boolean(String(process.env[`ATLAS_AI_${prefix}_INPUT_USD_PER_MILLION`] || "").trim() || String(process.env[`ATLAS_AI_${prefix}_OUTPUT_USD_PER_MILLION`] || "").trim());
}

export function usageCost(provider: AIProviderResult["provider"], model: string, usage: AIProviderResult["usage"]) {
  if (provider === "local") return { inputUsd: 0, outputUsd: 0, estimatedUsd: 0, pricingConfigured: true, pricingSource: "fallback_local_sem_custo" };
  const { tariff, source } = tariffFor(provider, model);
  // Sem tarifa cadastrada o custo é DESCONHECIDO, não zero. Gravar 0 transforma
  // ausência de dado em "de graça" e o Command Center exibe isso como medido.
  if (!tariff) return { inputUsd: null, outputUsd: null, estimatedUsd: null, pricingConfigured: false, pricingSource: source };
  const cached = Math.max(0, usage.cachedInputTokens ?? 0);
  const written = Math.max(0, usage.cacheWriteTokens ?? 0);
  const fresh = Math.max(0, usage.inputTokens - cached - written);
  // Sem tarifa de cache declarada, cobra-se a cheia: erra para cima, nunca para baixo.
  const inputUsd = (fresh * tariff.inputPerMillion + cached * (tariff.cachedInputPerMillion ?? tariff.inputPerMillion) + written * (tariff.cacheWritePerMillion ?? tariff.inputPerMillion)) / 1_000_000;
  const outputUsd = (usage.outputTokens * tariff.outputPerMillion) / 1_000_000;
  return { inputUsd, outputUsd, estimatedUsd: inputUsd + outputUsd, pricingConfigured: true, pricingSource: source };
}

function isRoutedProvider(value: string): value is RoutedProvider {
  return value === "openai" || value === "anthropic" || value === "perplexity" || value === "local" || value in economyProviders;
}

function parseProviderOrder(task: AITask) {
  const raw = String(process.env[`ATLAS_AI_${tierPrefix(task)}_PROVIDER_ORDER`] || "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return { order: raw.filter(isRoutedProvider), discarded: raw.filter((value) => !isRoutedProvider(value)) };
}

function providerModelFor(task: AITask, provider: RoutedProvider): ResolvedModel {
  if (provider === "openai" || provider === "anthropic") return resolveProviderModel(task, provider);
  if (provider === "perplexity") return { model: aiModelProfiles().research, source: "ATLAS_RESEARCH_MODEL", problem: null };
  if (provider === "local") return { model: "deterministic-safe-fallback", source: "local", problem: null };
  const variable = economyProviders[provider].model;
  const configured = String(process.env[variable] || "").trim();
  return configured ? { model: configured, source: variable, problem: null } : { model: "", source: variable, problem: `Tier ${task}: ${provider} está na ordem de provedores mas ${variable} não está definida.` };
}

export type AIRoutingDiagnostic = {
  tier: AITask;
  providerOrder: RoutedProvider[];
  discardedOrderTokens: string[];
  models: Array<{ provider: RoutedProvider; model: string | null; source: string; tariffConfigured: boolean }>;
  problems: string[];
  pricingNotes: string[];
  ready: boolean;
  pricingConfigured: boolean;
};

/**
 * Validação de arranque do roteamento: falha ALTO (log estruturado + readiness
 * false do tier) quando o modelo não casa com a família do provedor da vez ou
 * quando um token da ordem de provedores é descartado pelo filtro — hoje o token
 * inválido some em silêncio e ninguém percebe que o tier caiu de pé no chão.
 * Nunca derruba o processo: diagnóstico é observabilidade, não gate de boot.
 */
export function aiRoutingDiagnostics(): AIRoutingDiagnostic[] {
  const readiness = aiProviderReadiness();
  return (["fast", "commercial", "reasoning", "research"] as AITask[]).map((tier) => {
    const { order, discarded } = parseProviderOrder(tier);
    const plan = planCommercialAI({ task: tier, feature: "routing-diagnostics", configuredOrder: order, available: readiness });
    // OpenAI entra sempre na verificação: o caminho de dado pessoal força
    // providerOrder ["openai","local"] e ignora a ordem configurada do tier.
    const checked = [...new Set<RoutedProvider>([...plan.providerOrder, "openai"])];
    const problems: string[] = [];
    const pricingNotes: string[] = [];
    if (discarded.length) problems.push(`Tier ${tier}: token inválido descartado da ordem de provedores: ${discarded.join(", ")}.`);
    const models = checked.map((provider) => {
      const resolved = providerModelFor(tier, provider);
      if (resolved.problem) problems.push(resolved.problem);
      const tariffConfigured = provider === "local" ? true : Boolean(tariffFor(provider, resolved.model).tariff);
      if (!tariffConfigured) pricingNotes.push(`Sem tarifa cadastrada para ${provider}/${resolved.model || "modelo_desconhecido"} em ATLAS_AI_PRICE_TABLE.`);
      return { provider, model: resolved.model || null, source: resolved.source, tariffConfigured };
    });
    if (legacyTierPricingDeclared(tier)) pricingNotes.push(`Tier ${tier}: ATLAS_AI_${tierPrefix(tier)}_INPUT_USD_PER_MILLION / _OUTPUT_USD_PER_MILLION foram ignoradas — a tarifa agora é por par (provedor, modelo).`);
    return { tier, providerOrder: plan.providerOrder, discardedOrderTokens: discarded, models, problems, pricingNotes, ready: problems.length === 0, pricingConfigured: models.every((item) => item.tariffConfigured) };
  });
}

export function aiRoutingReadiness() {
  const diagnostics = aiRoutingDiagnostics();
  const ready = (task: AITask) => diagnostics.find((item) => item.tier === task)?.ready ?? false;
  return { fast: ready("fast"), commercial: ready("commercial"), reasoning: ready("reasoning"), research: ready("research"), diagnostics };
}

export function aiPricingReadiness() {
  const diagnostics = aiRoutingDiagnostics();
  const priced = (task: AITask) => diagnostics.find((item) => item.tier === task)?.pricingConfigured ?? false;
  return { fast: priced("fast"), commercial: priced("commercial"), reasoning: priced("reasoning"), research: priced("research") };
}

let routingDiagnosticsLogged = false;
export function logAIRoutingDiagnosticsOnce() {
  if (routingDiagnosticsLogged) return;
  routingDiagnosticsLogged = true;
  try {
    for (const diagnostic of aiRoutingDiagnostics()) {
      if (diagnostic.problems.length) logger.error("ai.routing_misconfigured", { tier: diagnostic.tier, providerOrder: diagnostic.providerOrder, discardedOrderTokens: diagnostic.discardedOrderTokens, problems: diagnostic.problems });
      if (diagnostic.pricingNotes.length) logger.warn("ai.pricing_unconfigured", { tier: diagnostic.tier, pricingNotes: diagnostic.pricingNotes });
    }
  } catch {
    // Diagnóstico jamais impede o atendimento comercial.
  }
}

// Enquanto a migration de cache/procedência não é aplicada, o insert estendido
// falha uma vez, é avisado uma vez e as chamadas seguintes já vão diretas ao
// payload base — telemetria preservada sem round-trip desperdiçado por chamada.
let usageCacheColumnsMissing = false;

async function recordUsage(input: GenerateInput, result: AIProviderResult) {
  const cost = usageCost(result.provider, result.model, result.usage);
  try {
    const base = {
      organization_id: input.organizationId,
      user_id: input.userId || null,
      feature: input.feature,
      task: input.task,
      provider: result.provider,
      model: result.model,
      provider_request_id: result.providerRequestId || null,
      input_tokens: result.usage.inputTokens,
      output_tokens: result.usage.outputTokens,
      total_tokens: result.usage.totalTokens,
      latency_ms: result.latencyMs,
      input_cost_usd: cost.inputUsd,
      output_cost_usd: cost.outputUsd,
      estimated_cost_usd: cost.estimatedUsd,
    };
    if (usageCacheColumnsMissing) {
      await getSupabaseAdmin().from("ai_usage_events").insert(base);
      return { ...result, cost };
    }
    const { error } = await getSupabaseAdmin()
      .from("ai_usage_events")
      .insert({ ...base, cached_input_tokens: result.usage.cachedInputTokens ?? 0, cache_write_tokens: result.usage.cacheWriteTokens ?? 0, pricing_source: cost.pricingSource });
    if (error) {
      // Só desliga a captura estendida quando o erro é de schema; falha
      // transitória não pode aposentar a telemetria de cache até o próximo deploy.
      if (/column|schema cache|PGRST204/i.test(`${error.code || ""} ${error.message || ""}`)) usageCacheColumnsMissing = true;
      logger.warn("ai.usage_cache_columns_missing", { reason: error.message });
      await getSupabaseAdmin().from("ai_usage_events").insert(base);
    }
  } catch {
    // Telemetria nunca deve impedir a resposta comercial.
  }
  return { ...result, cost };
}

async function recordOrchestration(input:GenerateInput,plan:AIExecutionPlan,result:AIProviderResult){try{await getSupabaseAdmin().from("ai_orchestration_decisions").insert({organization_id:input.organizationId,user_id:input.userId||null,feature:input.feature,requested_task:plan.requestedTask,resolved_task:plan.resolvedTask,data_class:plan.dataClass,risk_level:plan.riskLevel,provider_order:plan.providerOrder,selected_provider:result.provider,selected_model:result.model,token_budget:plan.tokenBudget,routing_reasons:plan.routingReasons,human_review_required:plan.humanReviewRequired,fallback_used:result.provider==="local",status:result.provider==="local"?"fallback":"completed",latency_ms:result.latencyMs,total_tokens:result.usage.totalTokens,estimated_cost_usd:usageCost(result.provider,result.model,result.usage).estimatedUsd,completed_at:new Date().toISOString()})}catch{/* Auditoria indisponível não derruba o atendimento. */}}

function openAIText(output: unknown) {
  if (!output || typeof output !== "object") return "";
  const items =
    (
      output as {
        output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
      }
    ).output ?? [];
  return items
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text || "")
    .join("")
    .trim();
}

async function generateOpenAI(input: GenerateInput): Promise<AIProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");
  const profile =
    input.task === "fast"
      ? {
          effort: "none",
          verbosity: "low",
          maxOutputTokens: 600,
        }
      : input.task === "commercial"
        ? {
            effort: "low",
            verbosity: "low",
            maxOutputTokens: 1200,
          }
        : {
            effort: "medium",
            verbosity: "medium",
            maxOutputTokens: 2400,
          };
  const resolved = resolveProviderModel(input.task, "openai");
  if (resolved.problem) logger.error("ai.model_family_mismatch", { provider: "openai", task: input.task, feature: input.feature, problem: resolved.problem, effectiveModel: resolved.model });
  const model = resolved.model;
  const startedAt = Date.now();
  const response = await resilientFetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      store: false,
      instructions: input.system,
      input: input.prompt,
      reasoning: { effort: profile.effort },
      text: { verbosity: profile.verbosity },
      max_output_tokens: profile.maxOutputTokens,
      prompt_cache_key: `atlas:${input.feature}:${input.task}:v1`,
    }),
    signal: input.signal,
  }, { timeoutMs: input.timeoutMs ?? 30_000, retries: 1, retryUnsafe: true, operation: "OpenAI" });
  const body = (await response.json()) as {
    id?: string;
    error?: { message?: string };
    output?: unknown[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      input_tokens_details?: { cached_tokens?: number };
    };
  };
  if (!response.ok)
    throw new Error(body.error?.message || `OpenAI HTTP ${response.status}`);
  const text = openAIText(body);
  if (!text) throw new Error("OpenAI retornou resposta vazia.");
  const usage = {
    inputTokens: body.usage?.input_tokens ?? 0,
    outputTokens: body.usage?.output_tokens ?? 0,
    totalTokens: body.usage?.total_tokens ?? 0,
    // input_tokens já inclui os cacheados; guardá-los à parte é o que torna a
    // economia de cache de prefixo mensurável em vez de artigo de fé.
    cachedInputTokens: body.usage?.input_tokens_details?.cached_tokens ?? 0,
    cacheWriteTokens: 0,
  };
  return {
    text,
    provider: "openai",
    model,
    latencyMs: Date.now() - startedAt,
    citations: [],
    providerRequestId:
      body.id || response.headers.get("x-request-id") || undefined,
    usage,
  };
}

async function generatePerplexity(
  input: GenerateInput,
): Promise<AIProviderResult> {
  if (input.containsPersonalData)
    throw new Error(
      "Pesquisa externa bloqueada para contexto com dados pessoais.",
    );
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY não configurada.");
  const model = aiModelProfiles().research;
  const startedAt = Date.now();
  const response = await resilientFetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: input.system },
        { role: "user", content: input.prompt },
      ],
      search_context_size: "low",
    }),
    signal: input.signal,
  }, { timeoutMs: input.timeoutMs ?? 30_000, retries: 1, retryUnsafe: true, operation: "Perplexity" });
  const body = (await response.json()) as {
    id?: string;
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
    citations?: string[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  if (!response.ok)
    throw new Error(
      body.error?.message || `Perplexity HTTP ${response.status}`,
    );
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Perplexity retornou resposta vazia.");
  const usage = {
    inputTokens: body.usage?.prompt_tokens ?? 0,
    outputTokens: body.usage?.completion_tokens ?? 0,
    totalTokens: body.usage?.total_tokens ?? 0,
  };
  return {
    text,
    provider: "perplexity",
    model,
    latencyMs: Date.now() - startedAt,
    citations: body.citations ?? [],
    providerRequestId:
      body.id || response.headers.get("x-request-id") || undefined,
    usage,
  };
}

// Claude / Anthropic — Messages API (/v1/messages, header x-api-key + anthropic-version).
// Não é compatível com o formato OpenAI: system é campo próprio, resposta em content[].
// Bloqueado para dados pessoais (governança PII → somente OpenAI).
async function generateAnthropic(input: GenerateInput): Promise<AIProviderResult> {
  if (input.containsPersonalData) throw new Error("anthropic bloqueado para dados pessoais.");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY não configurada.");
  const resolved = resolveProviderModel(input.task, "anthropic");
  // Sem modelo válido a chamada falha aqui e o failover segue para o próximo
  // provedor — melhor que servir o modelo mais caro por default implícito.
  if (!resolved.model) throw new Error(resolved.problem || "Modelo Anthropic não configurado.");
  const model = resolved.model;
  const maxTokens = input.task === "fast" ? 600 : input.task === "commercial" ? 1200 : 2400;
  const startedAt = Date.now();
  // Cache de prompt da Anthropic exige breakpoint explícito: sem cache_control não
  // existe cache algum, por mais estável que seja o prefixo do system.
  const system = input.system.trim() ? [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }] : undefined;
  const response = await resilientFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: input.prompt }],
    }),
    signal: input.signal,
  }, { timeoutMs: input.timeoutMs ?? 30_000, retries: 1, retryUnsafe: true, operation: "Anthropic" });
  const body = await response.json() as {
    id?: string; error?: { message?: string };
    content?: Array<{ type?: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
  };
  if (!response.ok) throw new Error(body.error?.message || `Anthropic HTTP ${response.status}`);
  const text = (body.content ?? []).filter((block) => block.type === "text").map((block) => block.text || "").join("").trim();
  if (!text) throw new Error("Anthropic retornou resposta vazia.");
  const cachedInputTokens = body.usage?.cache_read_input_tokens ?? 0;
  const cacheWriteTokens = body.usage?.cache_creation_input_tokens ?? 0;
  // Na Anthropic input_tokens EXCLUI os tokens de cache; somamos para que
  // inputTokens signifique sempre "tokens de entrada processados".
  const inputTokens = (body.usage?.input_tokens ?? 0) + cachedInputTokens + cacheWriteTokens;
  const outputTokens = body.usage?.output_tokens ?? 0;
  return {
    text, provider: "anthropic", model, latencyMs: Date.now() - startedAt, citations: [],
    providerRequestId: body.id || response.headers.get("request-id") || undefined,
    usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens, cachedInputTokens, cacheWriteTokens },
  };
}

async function generateEconomyProvider(input: GenerateInput, provider: EconomyProvider): Promise<AIProviderResult> {
  if (input.containsPersonalData) throw new Error(`${provider} bloqueado para dados pessoais.`);
  const config = economyProviders[provider];
  const apiKey = process.env[config.key];
  const model = process.env[config.model];
  if (!apiKey || !model) throw new Error(`${provider} não configurado.`);
  const startedAt = Date.now();
  const response = await resilientFetch(process.env[`ATLAS_${provider.toUpperCase()}_BASE_URL`] || config.baseUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: input.system }, { role: "user", content: input.prompt }],
      temperature: input.task === "fast" ? 0.1 : 0.2,
      max_tokens: input.task === "fast" ? 600 : input.task === "commercial" ? 1200 : 2400,
      stream: false,
    }),
    signal: input.signal,
  }, { timeoutMs: input.timeoutMs ?? 30_000, retries: 1, retryUnsafe: true, operation: provider });
  const body = await response.json() as {
    id?: string; error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };
  if (!response.ok) throw new Error(body.error?.message || `${provider} HTTP ${response.status}`);
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error(`${provider} retornou resposta vazia.`);
  return {
    text, provider, model, latencyMs: Date.now() - startedAt, citations: [],
    providerRequestId: body.id || response.headers.get("x-request-id") || undefined,
    usage: { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0, totalTokens: body.usage?.total_tokens ?? 0 },
  };
}

function configuredEconomyProvider(provider: EconomyProvider) {
  const config = economyProviders[provider];
  return Boolean(process.env[config.key] && process.env[config.model]);
}

export function aiProviderReadiness() {
  return {
    openai: Boolean(process.env.OPENAI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    perplexity: Boolean(process.env.PERPLEXITY_API_KEY),
    deepseek: configuredEconomyProvider("deepseek"),
    qwen: configuredEconomyProvider("qwen"),
    kimi: configuredEconomyProvider("kimi"),
    glm: configuredEconomyProvider("glm"),
    localFallback: true,
    host: "hostinger" as const,
  };
}

function localFallback(input: GenerateInput): AIProviderResult {
  const text =
    input.task === "research"
      ? "Pesquisa atualizada indisponível neste momento. Não use esta resposta como evidência de mercado; tente novamente quando o provedor de pesquisa estiver disponível."
      : "A IA generativa está temporariamente indisponível. Preserve os indicadores determinísticos do CRM, não execute ações externas e encaminhe a decisão para revisão humana.";
  return {
    text,
    provider: "local",
    model: "deterministic-safe-fallback",
    latencyMs: 0,
    citations: [],
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  };
}

export async function generateAIText(
  input: GenerateInput,
): Promise<AIProviderResult> {
  let result: AIProviderResult;
  logAIRoutingDiagnosticsOnce();
  const inputGuard=assessAIInput(input.system,input.prompt);
  const guardedInput={...input,system:`${input.system}\n\n${AI_GUARD_SYSTEM_POLICY}`};
  const recordGuard=async(stage:"input"|"output",guard:typeof inputGuard,provider?:string,model?:string)=>{if(!guard.findings.length)return;try{await getSupabaseAdmin().from("ai_guardrail_events").insert({organization_id:input.organizationId,user_id:input.userId||null,feature:input.feature,stage,risk_level:guard.risk,blocked:guard.blocked,human_review_required:guard.humanReviewRequired,finding_codes:guard.findings.map(f=>f.code),provider:provider||null,model:model||null})}catch{/* Guardrail funciona mesmo antes da migration. */}};
  await recordGuard("input",inputGuard);
  if(inputGuard.blocked){result=localFallback(input);result.text="Solicitação bloqueada pela proteção da IA. Remova instruções para revelar configurações, segredos, executar comandos ou ignorar regras. Se a necessidade for legítima, encaminhe para revisão humana.";result.guardrail={risk:inputGuard.risk,blocked:true,humanReviewRequired:true,findingCodes:inputGuard.findings.map(f=>f.code)};return recordUsage(input,result)}
  // parseProviderOrder devolve também os tokens descartados, que antes sumiam em
  // silêncio: um typo na ordem ("anthropi") apagava o provedor sem nenhum sinal.
  const { order: configuredOrder } = parseProviderOrder(input.task);
  const readiness=aiProviderReadiness(),plan=planCommercialAI({task:input.task,containsPersonalData:input.containsPersonalData,feature:input.feature,configuredOrder,available:readiness});
  result = localFallback(input);
  for (const provider of plan.providerOrder) {
    if(provider==="local"){result=localFallback(input);break}
    try {
      result = provider === "openai" ? await generateOpenAI(guardedInput) : provider==="anthropic"?await generateAnthropic(guardedInput):provider==="perplexity"?await generatePerplexity(guardedInput):await generateEconomyProvider(guardedInput, provider);
      break;
    } catch (error) {
      if (input.signal?.aborted) {
        throw input.signal.reason instanceof Error
          ? input.signal.reason
          : new DOMException("Solicitação cancelada.", "AbortError");
      }
      logger.warn("ai.provider_failover", {
        provider,
        task: input.task,
        feature: input.feature,
        containsPersonalData: Boolean(input.containsPersonalData),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  const inspected=inspectAndSanitizeAIOutput(result.text);result.text=inspected.text;result.guardrail={risk:inspected.assessment.risk,blocked:inspected.assessment.blocked,humanReviewRequired:inputGuard.humanReviewRequired||inspected.assessment.humanReviewRequired,findingCodes:[...inputGuard.findings,...inspected.assessment.findings].map(f=>f.code)};await recordGuard("output",inspected.assessment,result.provider,result.model);await recordOrchestration(input,plan,result);return recordUsage(input, result);
}

export async function testOpenAIConnection(
  input: Pick<GenerateInput, "organizationId" | "userId">,
) {
  const request: GenerateInput = {
    ...input,
    task: "fast",
    feature: "openai-homologation",
    containsPersonalData: false,
    timeoutMs: 30_000,
    system:
      "Você é o teste técnico do Atlas. Não execute ações e não solicite dados pessoais.",
    prompt: "Responda somente ATLAS_OPENAI_OK para confirmar a conexão.",
  };
  return recordUsage(request, await generateOpenAI(request));
}

export async function testPerplexityConnection(
  input: Pick<GenerateInput, "organizationId" | "userId">,
) {
  const request: GenerateInput = {
    ...input,
    task: "research",
    feature: "perplexity-homologation",
    containsPersonalData: false,
    timeoutMs: 30_000,
    system:
      "Você testa pesquisa imobiliária do Atlas. Use apenas fontes públicas, cite URLs e não solicite dados pessoais.",
    prompt:
      "Indique dois indicadores públicos úteis para analisar o mercado imobiliário brasileiro e cite as fontes.",
  };
  return recordUsage(request, await generatePerplexity(request));
}

export async function testEconomyProviderConnection(
  provider: EconomyProvider,
  input: Pick<GenerateInput, "organizationId" | "userId">,
) {
  const expected = `ATLAS_${provider.toUpperCase()}_OK`;
  const request: GenerateInput = {
    ...input,
    task: provider === "kimi" ? "commercial" : "fast",
    feature: `${provider}-homologation`,
    containsPersonalData: false,
    timeoutMs: 30_000,
    system:
      "Você é um teste técnico de conectividade do Atlas. Não use ferramentas, não execute ações e não solicite dados pessoais.",
    prompt: `Responda somente ${expected} para confirmar a conexão.`,
  };
  const result = await generateEconomyProvider(request, provider);
  return recordUsage(request, result);
}

export async function testAICostRouting(
  input: Pick<GenerateInput, "organizationId" | "userId">,
) {
  const definitions: Array<{
    task: Exclude<AITask, "research">;
    feature: string;
    prompt: string;
  }> = [
    {
      task: "fast",
      feature: "cost-routing-fast",
      prompt: "Responda somente ROTA_RAPIDA_OK.",
    },
    {
      task: "commercial",
      feature: "cost-routing-commercial",
      prompt: "Responda somente ROTA_COMERCIAL_OK.",
    },
    {
      task: "reasoning",
      feature: "cost-routing-reasoning",
      prompt: "Responda somente ROTA_COMPLEXA_OK.",
    },
  ];
  return Promise.all(
    definitions.map(async (definition) => {
      const request: GenerateInput = {
        ...input,
        task: definition.task,
        feature: definition.feature,
        containsPersonalData: false,
        timeoutMs: 30_000,
        system:
          "Você testa o roteamento técnico do Atlas. Não execute ações, não use ferramentas e não solicite dados pessoais.",
        prompt: definition.prompt,
      };
      return {
        task: definition.task,
        ...(await recordUsage(request, await generateOpenAI(request))),
      };
    }),
  );
}
