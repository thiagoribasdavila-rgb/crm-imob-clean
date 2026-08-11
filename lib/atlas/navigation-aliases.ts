import atlasRouteAliases from "../../config/atlas-route-aliases.json";

export const atlasNavigationAliases = atlasRouteAliases.map(
  ({ concept, source, destination }) => ({
    concept,
    alias: source,
    canonical: destination,
  }),
);

export type AtlasNavigationAlias = (typeof atlasNavigationAliases)[number]["alias"];

export function resolveAtlasNavigationAlias(alias: AtlasNavigationAlias) {
  const entry = atlasNavigationAliases.find((candidate) => candidate.alias === alias);

  if (!entry) {
    throw new Error(`Alias de navegação não governado: ${alias}`);
  }

  return entry.canonical;
}
