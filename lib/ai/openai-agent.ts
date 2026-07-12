import { getAtlasAIProviderConfig } from "./provider";
import { runAtlasToolLoop } from "./tool-loop";
import type { AtlasToolContext } from "./registry";

export async function runAtlasOpenAIAgent(
  message: string,
  context: AtlasToolContext,
  toolCalls: Array<{ name: string; arguments?: unknown }> = [],
) {
  const config = getAtlasAIProviderConfig();

  const toolResults = toolCalls.length
    ? await runAtlasToolLoop(toolCalls, context)
    : [];

  return {
    message,
    toolResults,
    model: config.model,
    toolsAvailable: config.tools.map((tool) => tool.name),
  };
}
