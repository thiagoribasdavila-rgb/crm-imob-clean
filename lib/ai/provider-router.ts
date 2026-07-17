import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

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
  provider: "openai" | "perplexity" | "local";
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

function withTimeout(timeoutMs: number) {
  return AbortSignal.timeout(Math.min(60_000, Math.max(1_000, timeoutMs)));
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
  const profile =
    input.task === "fast"
      ? {
          model: process.env.ATLAS_AI_FAST_MODEL || "gpt-5.6-luna",
          effort: "none",
          verbosity: "low",
          maxOutputTokens: 600,
        }
      : input.task === "commercial"
        ? {
            model: process.env.ATLAS_AI_COMMERCIAL_MODEL || "gpt-5.6-terra",
            effort: "low",
            verbosity: "low",
            maxOutputTokens: 1200,
          }
        : {
            model:
              process.env.ATLAS_AI_REASONING_MODEL ||
              process.env.ATLAS_AI_MODEL ||
              "gpt-5.6-sol",
            effort: "medium",
            verbosity: "medium",
            maxOutputTokens: 2400,
          };
  const model = profile.model;
  const startedAt = Date.now();
  const response = await fetch("https://api.openai.com/v1/responses", {
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
    signal: withTimeout(input.timeoutMs ?? 30_000),
  });
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
  const model = process.env.ATLAS_RESEARCH_MODEL || "sonar";
  const startedAt = Date.now();
  const response = await fetch("https://api.perplexity.ai/v1/sonar", {
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
    signal: withTimeout(input.timeoutMs ?? 30_000),
  });
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

export function aiProviderReadiness() {
  return {
    openai: Boolean(process.env.OPENAI_API_KEY),
    perplexity: Boolean(process.env.PERPLEXITY_API_KEY),
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
  try {
    result =
      input.task === "research"
        ? await generatePerplexity(input)
        : await generateOpenAI(input);
  } catch (error) {
    result = localFallback(input);
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
