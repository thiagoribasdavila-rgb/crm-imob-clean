import type { AtlasConversationContext, AtlasMemoryMessage, AtlasToolExecutionLog } from "./types";

export async function createConversation(context: AtlasConversationContext, title?: string) {
  return {
    organizationId: context.organizationId,
    userId: context.userId,
    title: title ?? "Nova análise Atlas",
  };
}

export async function saveMessage(message: AtlasMemoryMessage) {
  return message;
}

export async function saveToolCall(log: AtlasToolExecutionLog) {
  return log;
}

export async function trackAIUsage(input: {
  organizationId: string;
  userId: string;
  model?: string;
  latencyMs?: number;
}) {
  return input;
}
