import type { AtlasDataContext } from "./types";

export function assertAtlasDataContext(context: AtlasDataContext) {
  if (!context.organizationId) {
    throw new Error("Atlas AI requires organization context.");
  }

  if (!context.userId) {
    throw new Error("Atlas AI requires user context.");
  }
}
