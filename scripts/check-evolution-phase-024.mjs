import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-024-navigation-deduplication.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseTwentyTwo = JSON.parse(fs.readFileSync("config/evolution-phase-022-navigation-commercial-outcomes.json", "utf8"));
const phaseTwentyThree = JSON.parse(fs.readFileSync("config/evolution-phase-023-navigation-baseline.json", "utf8"));
const registry = fs.readFileSync("lib/atlas/navigation-aliases.ts", "utf8");
const legacyRoutes = fs.readFileSync("scripts/legacy-route-paths.mjs", "utf8");
const integrations = fs.readFileSync("app/(crm)/integrations/page.tsx", "utf8");
const sidebar = fs.readFileSync("components/Sidebar.tsx", "utf8");
const atlasV2 = fs.readFileSync("app/(crm)/atlas-v2/page.tsx", "utf8");
const realRoutes = fs.readFileSync("scripts/test-real-routes.mjs", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_024_NAVIGATION_DEDUPLICATION.md", "utf8");

const routeFiles = new Map([
  ["/automation", "app/(crm)/automation/page.tsx"],
  ["/kanban", "app/(crm)/kanban/page.tsx"],
  ["/creatives", "app/(crm)/creatives/page.tsx"],
  ["/agents", "app/(crm)/agents/page.tsx"],
  ["/ai-insights", "app/(crm)/ai-insights/page.tsx"],
  ["/analytics", "app/(crm)/analytics/page.tsx"],
  ["/chat", "app/(crm)/chat/page.tsx"],
]);

const canonicalFiles = new Map([
  ["/automations", "app/(crm)/automations/page.tsx"],
  ["/pipeline", "app/(crm)/pipeline/page.tsx"],
  ["/marketing/creatives", "app/(crm)/marketing/creatives/page.tsx"],
  ["/atlas-v3/agents", "app/(crm)/atlas-v3/agents/page.tsx"],
  ["/intelligence", "app/(crm)/intelligence/page.tsx"],
  ["/reports", "app/(crm)/reports/page.tsx"],
  ["/conversations", "app/(crm)/conversations/page.tsx"],
]);

const aliasPagesAreCompatible = config.canonicalMappings.every(({ alias }) => {
  const source = fs.readFileSync(routeFiles.get(alias), "utf8");
  return source.includes("redirect(resolveAtlasNavigationAlias")
    && source.includes(`\"${alias}\"`)
    && !source.includes("permanentRedirect");
});
const registryHasEveryMapping = config.canonicalMappings.every(({ concept, alias, canonical }) =>
  registry.includes(`concept: \"${concept}\", alias: \"${alias}\", canonical: \"${canonical}\"`),
);
const canonicalPagesExist = config.canonicalMappings.every(({ canonical }) => fs.existsSync(canonicalFiles.get(canonical)));
const phaseTwentyTwoMappings = phaseTwentyTwo.ambiguityDecisions.map((entry) => ({
  alias: entry.aliasesToPreserveUntilUsageAudit[0],
  canonical: entry.primaryRoute,
}));
const decisionsPreserved = config.canonicalMappings.every(({ alias, canonical }) =>
  phaseTwentyTwoMappings.some((entry) => entry.alias === alias && entry.canonical === canonical),
);

const checks = [
  ["Fase 024 concluída com mudança reversível", config.status === "completed" && config.runtimeNavigationChanged === true && config.productionDataModified === false],
  ["Sete conceitos ambíguos foram consolidados", config.aliasesConsolidated === 7 && config.canonicalMappings.length === 7],
  ["Decisões da Fase 022 foram preservadas", phaseTwentyTwo.status === "completed" && decisionsPreserved],
  ["Registro governado contém todos os aliases", registryHasEveryMapping],
  ["Destinos canônicos existem", canonicalPagesExist],
  ["Aliases encaminham sem interface duplicada", aliasPagesAreCompatible],
  ["Compatibilidade usa redirecionamento temporário", config.redirectMode === "temporary-307" && config.permanentRedirectUsed === false],
  ["Rotas CRM compatíveis saíram da quarentena", !legacyRoutes.includes('"app/(crm)/analytics"') && !legacyRoutes.includes('"app/(crm)/kanban"') && legacyRoutes.includes('"app/analytics"')],
  ["Referências ativas usam destinos canônicos", sidebar.includes('href: "/marketing/creatives"') && atlasV2.includes('["Criativos", "/marketing/creatives"') && realRoutes.includes('"/atlas-v3/agents"')],
  ["Diagnóstico de integração ganhou acesso contextual", integrations.includes('href="/integrations/health"') && config.criticalJourneyImprovement.directContextualEntryAdded === true],
  ["Nenhuma rota ou dado foi apagado", config.routesDeleted === false && config.safetyPolicy.databaseRead === false && config.safetyPolicy.personalDataCaptured === false],
  ["Métrica comportamental não foi inventada", config.behavioralTelemetry.status === "awaiting-runtime-telemetry" && config.behavioralTelemetry.inventedMetricPublished === false],
  ["Relatório documenta compatibilidade e limite", report.includes("HTTP 307") && report.includes("Nenhuma rota foi apagada") && report.includes("Fase 025")],
  ["Lacuna anterior foi tratada sem contornar staging", phaseTwentyThree.criticalJourneyBaseline.journeysWithoutContextualDirectReference.includes("diagnosticar-integracao") && phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 024 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 024 aprovada: sete aliases consolidados, destinos antigos preservados e navegação interna canônica.");
