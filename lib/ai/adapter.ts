import { runAtlasAgent } from "./runtime";
import { sanitizeAIInput } from "./provider";
import type { AtlasToolContext } from "./registry";

export async function runAtlasCopilotAdapter(
  message: string,
  context: AtlasToolContext,
) {
  const safeMessage = sanitizeAIInput(message);

  return runAtlasAgent(
    {
      message: safeMessage,
    },
    context,
  );
}
