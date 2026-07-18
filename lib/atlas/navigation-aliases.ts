export const atlasNavigationAliases = [
  { concept: "automacoes", alias: "/automation", canonical: "/automations" },
  { concept: "pipeline-kanban", alias: "/kanban", canonical: "/pipeline" },
  { concept: "inteligencia-de-criativos", alias: "/creatives", canonical: "/marketing/creatives" },
  { concept: "agentes-especializados", alias: "/agents", canonical: "/atlas-v3/agents" },
  { concept: "inteligencia-operacional", alias: "/ai-insights", canonical: "/intelligence" },
  { concept: "analytics-relatorios", alias: "/analytics", canonical: "/reports" },
  { concept: "conversas", alias: "/chat", canonical: "/conversations" },
] as const;

export type AtlasNavigationAlias = (typeof atlasNavigationAliases)[number]["alias"];

export function resolveAtlasNavigationAlias(alias: AtlasNavigationAlias) {
  const entry = atlasNavigationAliases.find((candidate) => candidate.alias === alias);

  if (!entry) {
    throw new Error(`Alias de navegação não governado: ${alias}`);
  }

  return entry.canonical;
}
