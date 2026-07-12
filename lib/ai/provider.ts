import { ATLAS_COPILOT_SYSTEM_PROMPT } from "./prompts";
import { getAtlasAIToolContracts } from "./router";

export function getAtlasAIProviderConfig() {
  return {
    model: process.env.ATLAS_AI_MODEL ?? "openai/gpt-5.5",
    systemPrompt: ATLAS_COPILOT_SYSTEM_PROMPT,
    tools: getAtlasAIToolContracts(),
    maxOutputTokens: 2000,
    timeoutMs: 30000,
  };
}

export function sanitizeAIInput(input: string) {
  return input
    .slice(0, 12000)
    .replace(/\b(sk|api|token|secret)\b/gi, "[protected]");
}
