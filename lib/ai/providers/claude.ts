export type AtlasAIProvider = {
  name: string;
  purpose: string;
  capabilities: string[];
};

export const claudeProvider: AtlasAIProvider = {
  name: "claude",
  purpose: "Analise documental, contexto longo e conhecimento imobiliário.",
  capabilities: [
    "document_analysis",
    "long_context_reasoning",
    "knowledge_extraction",
  ],
};

export function getClaudeProvider() {
  return claudeProvider;
}
