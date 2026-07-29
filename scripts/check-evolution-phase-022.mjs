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
/**
 * 2026-07-29 — um dos 22 destinos canônicos deixou de ser destino.
 *
 * "Clientes 360" (/customers) saiu do catálogo: lia a MESMA tabela `leads` que
 * /leads (readCompatibleCustomers era alias de readCompatibleLeads), sem SLA,
 * filtros, lote nem ordenação — e sem o piso de carteira, então um corretor via
 * as 469 leads da imobiliária inteira, com telefone e e-mail. O resultado
 * comercial que ela prometia ("Qual é o contexto completo deste comprador?")
 * não sumiu: é o mesmo de /leads, agora com os segmentos por vínculo herdados.
 *
 * O config NÃO foi editado: `canonicalOutcomes` continua com os 22 resultados
 * que a fase escreveu. A checagem exige que a ÚNICA diferença entre catálogo e
 * config seja essa rota, e que ela de fato redirecione para um destino que tem
 * resultado declarado. Qualquer outro descompasso continua reprovando.
 */
const retiredRoutes = outcomeRoutes.filter((route) => !canonicalRoutes.includes(route));
const retiredSurface = fs.readFileSync("app/(crm)/customers/page.tsx", "utf8");
const retiredRedirectsToDeclaredOutcome = retiredSurface.includes('redirect("/leads")')
  && canonicalRoutes.includes("/leads")
  && outcomeRoutes.includes("/leads");
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
  ["Inventário anterior está concluído", phaseTwentyOne.status === "completed" && phaseTwentyOne.topology.canonicalDestinationsPresent === 22],
  // Catálogo podado na fonte de propósito (commit e20f8931 "navegação podada na fonte"): 25->22 destinos canônicos. /command-center consolida Início+Command Center (substitui /dashboard); /ai-dashboard, /revenue-engine e /atlas-2030 saíram do catálogo (grupos (ai)/(autonomous)/estratégico quarentenados); /decision-center foi promovido a destino principal. Guard re-baselinado à fonte lib/atlas/navigation.ts.
  ["Todos os destinos canônicos possuem resultado", canonicalRoutes.every((route) => outcomeRoutes.includes(route)) && JSON.stringify(retiredRoutes) === JSON.stringify(["/customers"]) && retiredRedirectsToDeclaredOutcome && canonicalRoutes.length + retiredRoutes.length === 22 && uniqueOutcomeRoutes],
  ["Dezoito destinos principais estão definidos", primaryOutcomes.length === 18],
  ["Quatro comandos contextuais estão definidos", contextualOutcomes.length === 4],
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
