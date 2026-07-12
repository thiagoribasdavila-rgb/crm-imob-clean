export type AtlasConversationContext = {
  organizationId: string;
  userId: string;
};

export type AtlasMemoryMessage = {
  id?: string;
  conversationId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt?: string;
};

export type AtlasToolExecutionLog = {
  toolName: string;
  success: boolean;
  latencyMs?: number;
};
