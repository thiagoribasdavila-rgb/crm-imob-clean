export type AtlasConversation = {
  id: string;
  organizationId: string;
  userId: string;
  title?: string;
  createdAt: string;
  updatedAt: string;
};

export type AtlasMessage = {
  id: string;
  conversationId: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: string;
};

export type AtlasToolCallLog = {
  id: string;
  conversationId: string;
  toolName: string;
  createdAt: string;
};
