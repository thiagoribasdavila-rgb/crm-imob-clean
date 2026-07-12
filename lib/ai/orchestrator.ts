import { ATLAS_COPILOT_SYSTEM_PROMPT } from "./prompts";
import type { AtlasCopilotResponse } from "./schemas";
import { listAtlasTools } from "./registry";

export type AtlasAIContext = {
  organizationId: string;
  userId: string;
};

export async function buildAtlasCopilotContext(context: AtlasAIContext) {
  return {
    system: ATLAS_COPILOT_SYSTEM_PROMPT,
    context,
    availableTools: listAtlasTools(),
  };
}

export function createAtlasResponse(
  answer: string,
  meta?: AtlasCopilotResponse["meta"],
): AtlasCopilotResponse {
  return {
    answer,
    insights: [],
    toolsUsed: [],
    sources: [],
    meta,
  };
}
