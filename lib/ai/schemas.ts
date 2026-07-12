export type AtlasCopilotResponse = {
  answer: string;
  insights?: Array<{
    type: string;
    message: string;
  }>;
  toolsUsed?: string[];
  sources?: string[];
  meta?: {
    latencyMs?: number;
    model?: string;
  };
};
