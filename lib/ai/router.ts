import { atlasToolContracts } from "./tools/contracts";
import { executeAtlasTool } from "./executor";
import type { AtlasToolContext } from "./registry";

export function getAtlasAIToolContracts() {
  return atlasToolContracts;
}

export async function routeAtlasToolCall(
  toolName: string,
  context: AtlasToolContext,
  input?: unknown,
) {
  return executeAtlasTool(toolName, context, input);
}
