import "server-only";

export type AITask = "fast" | "commercial" | "reasoning" | "research";
type GenerateInput = { task: AITask; system: string; prompt: string; containsPersonalData?: boolean; timeoutMs?: number };
export type AIProviderResult = { text: string; provider: "openai" | "perplexity"; model: string; latencyMs: number; citations: string[] };

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
  const body = await response.json() as { error?: { message?: string }; output?: unknown[] };
  if (!response.ok) throw new Error(body.error?.message || `OpenAI HTTP ${response.status}`);
  const text = openAIText(body);
  if (!text) throw new Error("OpenAI retornou resposta vazia.");
  return { text, provider: "openai", model, latencyMs: Date.now() - startedAt, citations: [] };
}

async function generatePerplexity(input: GenerateInput): Promise<AIProviderResult> {
  if (input.containsPersonalData) throw new Error("Pesquisa externa bloqueada para contexto com dados pessoais.");
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY não configurada.");
  const model = process.env.ATLAS_RESEARCH_MODEL || "sonar";
  const startedAt = Date.now();
  const response = await fetch("https://api.perplexity.ai/chat/completions", { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "system", content: input.system }, { role: "user", content: input.prompt }], search_context_size: "low" }), signal: withTimeout(input.timeoutMs ?? 30_000) });
  const body = await response.json() as { error?: { message?: string }; choices?: Array<{ message?: { content?: string } }>; citations?: string[] };
  if (!response.ok) throw new Error(body.error?.message || `Perplexity HTTP ${response.status}`);
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Perplexity retornou resposta vazia.");
  return { text, provider: "perplexity", model, latencyMs: Date.now() - startedAt, citations: body.citations ?? [] };
}

export function aiProviderReadiness() {
  return { openai: Boolean(process.env.OPENAI_API_KEY), perplexity: Boolean(process.env.PERPLEXITY_API_KEY), localFallback: true, host: "hostinger" as const };
}

export async function generateAIText(input: GenerateInput): Promise<AIProviderResult> {
  if (input.task === "research") return generatePerplexity(input);
  return generateOpenAI(input);
}
