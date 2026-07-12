import { routeAtlasToolCall } from "./router";
import type { AtlasToolContext } from "./registry";

export type AtlasToolCall = {
  name: string;
  arguments?: unknown;
};

export async function runAtlasToolLoop(
  calls: AtlasToolCall[],
  context: AtlasToolContext,
) {
  const results = [];

  for (const call of calls) {
    const result = await routeAtlasToolCall(
      call.name,
      context,
      call.arguments,
    );

    results.push({
      tool: call.name,
      result,
    });
  }

  return results;
}
