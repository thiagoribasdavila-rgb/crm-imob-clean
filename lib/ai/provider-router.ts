import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type AITask = "fast" | "commercial" | "reasoning" | "research";
type GenerateInput = { task: AITask; system: string; prompt: string; containsPersonalData?: boolean; timeoutMs?: number; organizationId: string; userId?: string; feature: string };
export type AIProviderResult = { text: string; provider: "openai" | "perplexity"; model: string; latencyMs: number; citations: string[]; usage: { inputTokens: number; outputTokens: number; totalTokens: number } };

async function recordUsage(input: GenerateInput, result: AIProviderResult) {
  try {
    await getSupabaseAdmin().from("ai_usage_events").insert({ organization_id: input.organizationId, user_id: input.userId || null, feature: input.feature, task: input.task, provider: result.provider, model: result.model, input_tokens: result.usage.inputTokens, output_tokens: result.usage.outputTokens, total_tokens: result.usage.totalTokens, latency_ms: result.latencyMs });
  } catch {
    // Telemetria nunca deve impedir a resposta comercial.
  }
  return result;
}

function withTimeout(timeoutMs: number) {
  return AbortSignal.timeout(Math.min(60_000, Math.max(1_000, timeoutMs)));
}

function openAIText(output: unknown) {
  if (!output || typeof output !== "object") return "";
  const items = (output as { output?: Array<{ content?: Array<{ type?: string; text?: string }> }> }).output ?? [];
  return items.flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text").map((item) => item.text || "").join("").trim();
}

async function generateOpenAI(input: GenerateInput): Promise<AIProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY não configurada.");
  const model = input.task === "fast" ? process.env.ATLAS_AI_FAST_MODEL || "gpt-5-mini" : process.env.ATLAS_AI_MODEL || "gpt-5.2";
  const startedAt = Date.now();
  const response = await fetch("https://api.openai.com/v1/responses", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, store: false, instructions: input.system, input: input.prompt }), signal: withTimeout(input.timeoutMs ?? 30_000) });
  const body = await response.json() as { error?: { message?: string }; output?: unknown[]; usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number } };
  if (!response.ok) throw new Error(body.error?.message || `OpenAI HTTP ${response.status}`);
  const text = openAIText(body);
  if (!text) throw new Error("OpenAI retornou resposta vazia.");
  const usage = { inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0, totalTokens: body.usage?.total_tokens ?? 0 };
  return { text, provider: "openai", model, latencyMs: Date.now() - startedAt, citations: [], usage };
}

async function generatePerplexity(input: GenerateInput): Promise<AIProviderResult> {
  if (input.containsPersonalData) throw new Error("Pesquisa externa bloqueada para contexto com dados pessoais.");
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY não configurada.");
  const model = process.env.ATLAS_RESEARCH_MODEL || "sonar";
  const startedAt = Date.now();
  const response = await fetch("https://api.perplexity.ai/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "system", content: input.system }, { role: "user", content: input.prompt }], search_context_size: "low" }), signal: withTimeout(input.timeoutMs ?? 30_000) });
  const body = await response.json() as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }>; citations?: string[]; usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } };
  if (!response.ok) throw new Error(body.error?.message || `Perplexity HTTP ${response.status}`);
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Perplexity retornou resposta vazia.");
  const usage = { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0, totalTokens: body.usage?.total_tokens ?? 0 };
  return { text, provider: "perplexity", model, latencyMs: Date.now() - startedAt, citations: body.citations ?? [], usage };
}

export function aiProviderReadiness() {
  return { openai: Boolean(process.env.OPENAI_API_KEY), perplexity: Boolean(process.env.PERPLEXITY_API_KEY), localFallback: true, host: "hostinger" as const };
}

export async function generateAIText(input: GenerateInput): Promise<AIProviderResult> {
  const result = input.task === "research" ? await generatePerplexity(input) : await generateOpenAI(input);
  return recordUsage(input, result);
}
