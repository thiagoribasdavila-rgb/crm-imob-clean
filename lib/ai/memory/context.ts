import type { AtlasConversationContext } from "./types";

export function createAtlasMemoryContext(
  context: AtlasConversationContext,
) {
  return {
    organizationId: context.organizationId,
    userId: context.userId,
    isolated: true,
  };
}
