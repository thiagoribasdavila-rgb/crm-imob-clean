import "server-only";
import { resilientFetch } from "@/lib/http/resilient-fetch";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { assessAIComplexity } from "@/lib/ai/complexity";

export type AITask = "fast" | "commercial" | "reasoning" | "research";
type GenerateInput = {
  task: AITask;
  system: string;
  prompt: string;
  containsPersonalData?: boolean;
  timeoutMs?: number;
  organizationId: string;
  userId?: string;
  feature: string;
};
export type AIProviderResult = {
  text: string;
  provider: "openai" | "perplexity" | "deepseek" | "qwen" | "kimi" | "glm" | "local";
  model: string;
  latencyMs: number;
  citations: string[];
  providerRequestId?: string;
  usage: { inputTokens: number; outputTokens: number; totalTokens: number };
  cost?: {
    inputUsd: number;
    outputUsd: number;
    estimatedUsd: number;
    pricingConfigured: boolean;
  };
};

type EconomyProvider = "deepseek" | "qwen" | "kimi" | "glm";
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

function pricingFor(task: AITask) {
  const prefix =
    task === "fast"
      ? "FAST"
      : task === "commercial"
        ? "COMMERCIAL"
        : task === "research"
          ? "RESEARCH"
          : "REASONING";
  const inputPerMillion = Number(
    process.env[`ATLAS_AI_${prefix}_INPUT_USD_PER_MILLION`] || 0,
  );
  const outputPerMillion = Number(
    process.env[`ATLAS_AI_${prefix}_OUTPUT_USD_PER_MILLION`] || 0,
  );
  return {
    inputPerMillion,
    outputPerMillion,
    configured:
      Number.isFinite(inputPerMillion) &&
      inputPerMillion > 0 &&
      Number.isFinite(outputPerMillion) &&
      outputPerMillion > 0,
  };
}

export function aiPricingReadiness() {
  return { fast: pricingFor("fast").configured, commercial: pricingFor("commercial").configured, reasoning: pricingFor("reasoning").configured, research: pricingFor("research").configured };
}

function usageCost(task: AITask, usage: AIProviderResult["usage"]) {
  const pricing = pricingFor(task);
  const inputUsd = pricing.configured
    ? (usage.inputTokens * pricing.inputPerMillion) / 1_000_000
    : 0;
  const outputUsd = pricing.configured
    ? (usage.outputTokens * pricing.outputPerMillion) / 1_000_000
    : 0;
  return {
    inputUsd,
    outputUsd,
    estimatedUsd: inputUsd + outputUsd,
    pricingConfigured: pricing.configured,
  };
}

async function recordUsage(input: GenerateInput, result: AIProviderResult) {
  const cost = usageCost(input.task, result.usage);
  try {
    await getSupabaseAdmin()
      .from("ai_usage_events")
      .insert({
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
      });
  } catch {
    // Telemetria nunca deve impedir a resposta comercial.
  }
  return { ...result, cost };
}

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
  const models = aiModelProfiles();
  const profile =
    input.task === "fast"
      ? {
          model: models.fast,
          effort: "none",
          verbosity: "low",
          maxOutputTokens: 600,
        }
      : input.task === "commercial"
        ? {
            model: models.commercial,
            effort: "low",
            verbosity: "low",
            maxOutputTokens: 1200,
          }
        : {
            model: models.reasoning,
            effort: "medium",
            verbosity: "medium",
            maxOutputTokens: 2400,
          };
  const model = profile.model;
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
  }, { timeoutMs: input.timeoutMs ?? 30_000, retries: 1, retryUnsafe: true, operation: "OpenAI" });
  const body = (await response.json()) as {
    id?: string;
    error?: { message?: string };
    output?: unknown[];
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
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
  const response = await resilientFetch("https://api.perplexity.ai/v1/sonar", {
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
  if (input.task === "research") {
    try { result = await generatePerplexity(input); } catch { result = localFallback(input); }
    return recordUsage(input, result);
  }
  const defaults: Record<Exclude<AITask, "research">, Array<"openai" | EconomyProvider>> = {
    fast: ["qwen", "deepseek", "openai"],
    commercial: ["openai", "qwen", "kimi"],
    reasoning: ["openai", "deepseek", "glm", "kimi"],
  };
  const configuredOrder = String(process.env[`ATLAS_AI_${input.task.toUpperCase()}_PROVIDER_ORDER`] || "")
    .split(",").map((value) => value.trim().toLowerCase()).filter((value): value is "openai" | EconomyProvider => value === "openai" || value in economyProviders);
  const order = input.containsPersonalData ? ["openai" as const] : configuredOrder.length ? configuredOrder : defaults[input.task];
  result = localFallback(input);
  for (const provider of order) {
    try {
      result = provider === "openai" ? await generateOpenAI(input) : await generateEconomyProvider(input, provider);
      break;
    } catch (error) {
      logger.warn("ai.provider_failover", {
        provider,
        task: input.task,
        feature: input.feature,
        containsPersonalData: Boolean(input.containsPersonalData),
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return recordUsage(input, result);
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
