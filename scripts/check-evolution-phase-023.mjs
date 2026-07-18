import { execFileSync } from "node:child_process";
import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-023-navigation-baseline.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseTwentyTwo = JSON.parse(fs.readFileSync("config/evolution-phase-022-navigation-commercial-outcomes.json", "utf8"));
const current = JSON.parse(
  execFileSync(process.execPath, ["scripts/measure-navigation-baseline.mjs"], { encoding: "utf8" }),
);
const report = fs.readFileSync("docs/EVOLUTION_PHASE_023_NAVIGATION_BASELINE.md", "utf8");

const baseline = config.structuralBaseline;
const behavioralValues = Object.entries(config.behavioralTelemetry)
  .filter(([key]) => !["status", "reason"].includes(key))
  .map(([, value]) => value);
const currentJourneyEndpointsExist = current.criticalJourneys.every(
  (journey) => journey.startRoutePresent && journey.endRoutePresent,
);
const checks = [
  ["Fase 023 concluída sem alterar runtime", config.status === "completed" && config.productionDataModified === false && config.runtimeNavigationChanged === false],
  ["Resultado comercial anterior está definido", phaseTwentyTwo.status === "completed" && phaseTwentyTwo.criticalJourneys.length === 6],
  ["Linha de base registra 141 rotas", baseline.crmRoutes === 141 && baseline.canonicalDestinationsPresent === 26],
  ["Distribuição de profundidade fecha o inventário", Object.values(baseline.depthDistribution).reduce((total, value) => total + value, 0) === baseline.crmRoutes],
  ["Profundidade estrutural foi quantificada", baseline.maximumRouteDepth === 4 && baseline.routesAtDepthTwoOrLess === 115 && baseline.routesAtDepthThreeOrMore === 26],
  ["Referências internas foram medidas", baseline.navigationReferences === 177 && baseline.uniqueInternalTargets === 67 && baseline.dynamicTemplateReferences === 75],
  ["Catálogo governado cobre todos os destinos", baseline.canonicalRoutesCoveredByGovernedCatalog === 26 && current.structural.canonicalRoutesCoveredByGovernedCatalog === current.structural.canonicalDestinations],
  ["Dependência exclusiva do catálogo está explícita", baseline.canonicalRoutesWithoutExplicitSourceInbound === 10 && config.findings.some((finding) => finding.id === "catalog-only-destinations")],
  ["Jornadas críticas possuem endpoints no código atual", config.criticalJourneyBaseline.journeysWithExistingEndpoints === 6 && currentJourneyEndpointsExist],
  ["Lacuna de diagnóstico de integração foi registrada", config.criticalJourneyBaseline.journeysWithoutContextualDirectReference.includes("diagnosticar-integracao")],
  ["Métricas comportamentais continuam desconhecidas", config.behavioralTelemetry.status === "blocked-awaiting-runtime-telemetry" && behavioralValues.every((value) => value === null)],
  ["Medição atual não lê dados nem segredos", current.governance.applicationDataRead === false && current.governance.environmentSecretsRead === false && current.governance.personalDataCaptured === false],
  ["Relatório separa estrutura de comportamento", report.includes("não prova comportamento") && report.includes("Fase 024") && report.includes("Nenhuma rota foi alterada")],
  ["Gate da Fase 020 continua bloqueado", phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 023 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 023 aprovada: linha de base estrutural reproduzível, sem métricas comportamentais inventadas.");
