export type AtlasToolContext = {
  organizationId: string;
  userId: string;
};

export type AtlasToolResult = {
  data: unknown;
  source: string;
};

export type AtlasTool = {
  name: string;
  description: string;
  execute: (context: AtlasToolContext, input?: unknown) => Promise<AtlasToolResult>;
};

const tools = new Map<string, AtlasTool>();

export function registerAtlasTool(tool: AtlasTool) {
  tools.set(tool.name, tool);
}

export function getAtlasTool(name: string) {
  return tools.get(name);
}

export function listAtlasTools() {
  return Array.from(tools.values()).map((tool) => ({
    name: tool.name,
    description: tool.description,
  }));
}
