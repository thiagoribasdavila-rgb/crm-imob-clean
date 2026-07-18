import { execFileSync } from "node:child_process";
import fs from "node:fs";

const SOURCE_ROOTS = ["app/(crm)", "components/atlas", "lib/atlas"];

function runJsonScript(file) {
  return JSON.parse(execFileSync(process.execPath, [file], { encoding: "utf8" }));
}

function trackedSourceFiles() {
  return execFileSync("git", ["ls-files", "-z", ...SOURCE_ROOTS], { encoding: "utf8" })
    .split("\0")
    .filter((file) => /\.(?:ts|tsx)$/.test(file))
    .sort();
}

function normalizeTarget(target) {
  return target
    .split(/[?#]/, 1)[0]
    .replace(/\$\{[^}]+\}/g, "[dynamic]")
    .replace(/\/+$/, "") || "/";
}

function normalizeRoutePattern(route) {
  return route.replace(/\[[^\]]+\]/g, "[dynamic]");
}

function routeDepth(route) {
  return route.split("/").filter(Boolean).length;
}

function pageFileFromRoute(route) {
  return route === "/" ? "app/(crm)/page.tsx" : `app/(crm)${route}/page.tsx`;
}

function routeMatches(target, route) {
  return normalizeRoutePattern(normalizeTarget(target)) === normalizeRoutePattern(route);
}

function extractReferences(file, source) {
  const references = [];
  const patterns = [
    {
      kind: "href",
      expression: /\bhref\s*=\s*(?:\{\s*)?(["'`])(\/[^"'`]*?)\1/g,
      targetIndex: 2,
    },
    {
      kind: "router",
      expression: /\brouter\.(?:push|replace)\s*\(\s*(["'`])(\/[^"'`]*?)\1/g,
      targetIndex: 2,
    },
    {
      kind: "redirect",
      expression: /\bredirect\s*\(\s*(["'`])(\/[^"'`]*?)\1/g,
      targetIndex: 2,
    },
  ];

  for (const { kind, expression, targetIndex } of patterns) {
    for (const match of source.matchAll(expression)) {
      const rawTarget = match[targetIndex];
      references.push({
        file,
        kind,
        rawTarget,
        normalizedTarget: normalizeTarget(rawTarget),
        dynamicTemplate: rawTarget.includes("${"),
      });
    }
  }

  return references;
}

function countMatches(source, expression) {
  return [...source.matchAll(expression)].length;
}

const inventory = runJsonScript("scripts/inventory-navigation-architecture.mjs");
const outcomes = JSON.parse(
  fs.readFileSync("config/evolution-phase-022-navigation-commercial-outcomes.json", "utf8"),
);
const files = trackedSourceFiles();
const sources = new Map(files.map((file) => [file, fs.readFileSync(file, "utf8")]));
const references = files.flatMap((file) => extractReferences(file, sources.get(file)));
const allRoutes = [
  "/",
  ...inventory.canonicalDestinations,
  ...inventory.dynamicContextRoutes,
  ...inventory.deepSupportRoutes,
  ...inventory.topLevelNonCanonicalRoutes,
];
const uniqueRoutes = [...new Set(allRoutes)].sort();
const uniqueTargets = [...new Set(references.map((reference) => reference.normalizedTarget))].sort();
const staticTargets = [
  ...new Set(
    references
      .filter((reference) => !reference.dynamicTemplate)
      .map((reference) => reference.normalizedTarget),
  ),
].sort();
const canonicalSet = new Set(inventory.canonicalDestinations);
const canonicalExplicitInbound = inventory.canonicalDestinations.map((route) => ({
  route,
  explicitReferences: references.filter((reference) => routeMatches(reference.normalizedTarget, route)).length,
  governedCatalogReference: true,
}));
const routesWithoutExplicitSourceInbound = canonicalExplicitInbound
  .filter((item) => item.explicitReferences === 0)
  .map((item) => item.route);
const depthDistribution = Object.fromEntries(
  [...new Set(uniqueRoutes.map(routeDepth))]
    .sort((left, right) => left - right)
    .map((depth) => [depth, uniqueRoutes.filter((route) => routeDepth(route) === depth).length]),
);
const sourceMetrics = files.reduce(
  (metrics, file) => {
    const source = sources.get(file);
    metrics.nextLinkComponents += countMatches(source, /<Link\b/g);
    metrics.rawAnchorElements += countMatches(source, /<a\b/g);
    metrics.rawInternalAnchors += countMatches(
      source,
      /<a\b[^>]*\bhref\s*=\s*(?:\{\s*)?(["'`])\/[^"'`]*?\1/gs,
    );
    return metrics;
  },
  { nextLinkComponents: 0, rawAnchorElements: 0, rawInternalAnchors: 0 },
);
const criticalJourneys = outcomes.criticalJourneys.map((journey) => {
  const startFile = pageFileFromRoute(journey.start);
  const directReferences = references.filter(
    (reference) => reference.file === startFile && routeMatches(reference.normalizedTarget, journey.end),
  ).length;
  const sharedShellReferences = references.filter(
    (reference) =>
      reference.file.startsWith("components/atlas/") &&
      routeMatches(reference.normalizedTarget, journey.end),
  ).length;
  const sameRouteJourney = journey.start === journey.end;

  return {
    journey: journey.journey,
    start: journey.start,
    end: journey.end,
    maximumActions: journey.maximumActions,
    startRoutePresent: uniqueRoutes.includes(journey.start),
    endRoutePresent: uniqueRoutes.some((route) => routeMatches(route, journey.end)),
    directReferenceFromStart: directReferences,
    sharedShellReferences,
    sameRouteJourney,
    runtimeCompletionMeasured: false,
  };
});
const navigationKinds = Object.fromEntries(
  ["href", "router", "redirect"].map((kind) => [
    kind,
    references.filter((reference) => reference.kind === kind).length,
  ]),
);

const baseline = {
  generatedAt: new Date().toISOString(),
  phase: 23,
  wave: 2,
  scope: "tracked-source-navigation-baseline",
  measurementBoundary: {
    structuralEvidence: "measured",
    behavioralEvidence: "blocked-awaiting-runtime-telemetry",
    claim: "Estrutura navegável não comprova cliques, tempo, conclusão ou conversão.",
  },
  structural: {
    trackedSourceFiles: files.length,
    crmRoutes: uniqueRoutes.length,
    canonicalDestinations: inventory.counts.canonicalDestinations,
    canonicalDestinationsPresent: inventory.counts.canonicalDestinationsPresent,
    maximumRouteDepth: Math.max(...uniqueRoutes.map(routeDepth)),
    averageRouteDepth: Number(
      (uniqueRoutes.reduce((total, route) => total + routeDepth(route), 0) / uniqueRoutes.length).toFixed(2),
    ),
    depthDistribution,
    navigationReferences: references.length,
    navigationKinds,
    uniqueInternalTargets: uniqueTargets.length,
    uniqueStaticInternalTargets: staticTargets.length,
    dynamicTemplateReferences: references.filter((reference) => reference.dynamicTemplate).length,
    nextLinkComponents: sourceMetrics.nextLinkComponents,
    rawAnchorElements: sourceMetrics.rawAnchorElements,
    rawInternalAnchors: sourceMetrics.rawInternalAnchors,
    canonicalRoutesCoveredByGovernedCatalog: inventory.counts.canonicalDestinations,
    canonicalRoutesWithExplicitSourceInbound:
      canonicalExplicitInbound.length - routesWithoutExplicitSourceInbound.length,
    canonicalRoutesWithoutExplicitSourceInbound: routesWithoutExplicitSourceInbound.length,
  },
  canonicalExplicitInbound,
  routesWithoutExplicitSourceInbound,
  criticalJourneys,
  behavioralTelemetry: {
    status: "blocked-awaiting-runtime-telemetry",
    clickThroughRate: null,
    medianActionsToComplete: null,
    taskCompletionRate: null,
    abandonmentRate: null,
    timeToCommercialOutcome: null,
  },
  governance: {
    productionDataModified: false,
    applicationDataRead: false,
    environmentSecretsRead: false,
    personalDataCaptured: false,
    runtimeNavigationChanged: false,
    automaticDecisionAboutPeople: false,
  },
};

if (canonicalSet.size !== inventory.counts.canonicalDestinations) {
  throw new Error("O catálogo canônico possui destinos duplicados.");
}

process.stdout.write(`${JSON.stringify(baseline, null, 2)}\n`);
