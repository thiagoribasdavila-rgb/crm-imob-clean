import { getAtlasTool } from "./registry";
import type { AtlasToolContext } from "./registry";

export async function executeAtlasTool(
  toolName: string,
  context: AtlasToolContext,
  input?: unknown,
) {
  const tool = getAtlasTool(toolName);

  if (!tool) {
    throw new Error(`Atlas AI tool not found: ${toolName}`);
  }

  return tool.execute(context, input);
}
