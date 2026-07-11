export type AtlasFeature =
  | "agents"
  | "autonomousActions"
  | "digitalTwin"
  | "marketplace"
  | "predictiveForecast"
  | "metaIntegration"
  | "whatsappIntegration";

const defaults: Record<AtlasFeature, boolean> = {
  agents: true,
  autonomousActions: false,
  digitalTwin: true,
  marketplace: true,
  predictiveForecast: true,
  metaIntegration: false,
  whatsappIntegration: false,
};

function envKey(feature: AtlasFeature): string {
  return `ATLAS_FEATURE_${feature.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`;
}

export function isFeatureEnabled(feature: AtlasFeature): boolean {
  const raw = process.env[envKey(feature)];
  if (raw === undefined) return defaults[feature];
  return ["1", "true", "on", "yes"].includes(raw.toLowerCase());
}

export function featureSnapshot(): Record<AtlasFeature, boolean> {
  return Object.fromEntries(
    (Object.keys(defaults) as AtlasFeature[]).map((feature) => [feature, isFeatureEnabled(feature)]),
  ) as Record<AtlasFeature, boolean>;
}
