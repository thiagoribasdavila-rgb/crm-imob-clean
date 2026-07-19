import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-022-navigation-commercial-outcomes.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const phaseTwentyOne = JSON.parse(fs.readFileSync("config/evolution-phase-021-navigation-architecture-inventory.json", "utf8"));
const navigation = fs.readFileSync("lib/atlas/navigation.ts", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_022_NAVIGATION_COMMERCIAL_OUTCOMES.md", "utf8");

const compiledNavigation = ts.transpileModule(navigation, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const navigationModule = { exports: {} };
vm.runInNewContext(compiledNavigation, {
  module: navigationModule,
  exports: navigationModule.exports,
  require: () => ({}),
});
const { atlasNavigation, atlasContextCommands } = navigationModule.exports;
const canonicalRoutes = [...new Set([...atlasNavigation, ...atlasContextCommands].map((item) => item.href))].sort();
const outcomeRoutes = config.canonicalOutcomes.map((item) => item.route).sort();
const primaryOutcomes = config.canonicalOutcomes.filter((item) => item.surface === "primary");
const contextualOutcomes = config.canonicalOutcomes.filter((item) => item.surface === "contextual-command");
const requiredOutcomeFieldsPresent = config.canonicalOutcomes.every((item) =>
  [item.decisionQuestion, item.primaryAction, item.completionEvidence].every((value) => typeof value === "string" && value.trim().length >= 12),
);
const uniqueOutcomeRoutes = new Set(outcomeRoutes).size === outcomeRoutes.length;
const journeysWithinBudget = config.criticalJourneys.every((journey) =>
  Number.isInteger(journey.maximumActions) && journey.maximumActions > 0 && journey.maximumActions <= config.successModel.maximumActionsForCriticalJourney,
);
const ambiguityRoutes = config.ambiguityDecisions.flatMap((item) => [item.primaryRoute, ...item.aliasesToPreserveUntilUsageAudit]);

const checks = [
  ["Fase 022 concluída sem alteração de runtime", config.status === "completed" && config.productionDataModified === false && config.runtimeNavigationChanged === false],
  ["Inventário anterior está concluído", phaseTwentyOne.status === "completed" && phaseTwentyOne.topology.canonicalDestinationsPresent === 25],
  ["Todos os destinos canônicos possuem resultado", JSON.stringify(canonicalRoutes) === JSON.stringify(outcomeRoutes) && canonicalRoutes.length === 25 && uniqueOutcomeRoutes],
  ["Dezenove destinos principais estão definidos", primaryOutcomes.length === 19],
  ["Seis comandos contextuais estão definidos", contextualOutcomes.length === 6],
  ["Pergunta, ação e evidência são obrigatórias", requiredOutcomeFieldsPresent],
  ["Jornadas críticas respeitam até três ações", config.criticalJourneys.length >= 6 && journeysWithinBudget],
  ["Decisões ambíguas preservam compatibilidade", config.ambiguityDecisions.length === 7 && config.ambiguityDecisions.every((item) => item.aliasesToPreserveUntilUsageAudit.length > 0)],
  ["Pipeline e conversas possuem conceito principal", ambiguityRoutes.includes("/pipeline") && ambiguityRoutes.includes("/kanban") && ambiguityRoutes.includes("/conversations") && ambiguityRoutes.includes("/chat")],
  ["Métricas inventadas e decisão automática continuam proibidas", config.successModel.inventedBehaviorMetricAllowed === false && config.successModel.automaticDecisionAboutPeopleAllowed === false],
  ["Relatório deixa a próxima fase explícita", report.includes("Fase 023") && report.includes("Nenhum redirecionamento foi criado")],
  ["Gate da Fase 020 continua bloqueado", phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 022 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 022 aprovada: cada destino canônico conduz a um resultado comercial verificável.");
