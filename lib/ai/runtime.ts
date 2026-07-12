import { runAtlasToolLoop } from "./tool-loop";
import { createAtlasResponse } from "./orchestrator";
import type { AtlasToolContext } from "./registry";

export type AtlasAgentInput = {
  message: string;
  toolCalls?: Array<{
    name: string;
    arguments?: unknown;
  }>;
};

export async function runAtlasAgent(
  input: AtlasAgentInput,
  context: AtlasToolContext,
) {
  const startedAt = Date.now();

  const toolResults = input.toolCalls?.length
    ? await runAtlasToolLoop(input.toolCalls, context)
    : [];

  return createAtlasResponse(
    toolResults.length
      ? "Análise concluída usando ferramentas Atlas."
      : "Atlas Copilot pronto para analisar sua operação.",
    {
      latencyMs: Date.now() - startedAt,
      model: process.env.ATLAS_AI_MODEL,
    },
  );
}
