import fs from "node:fs";
import ts from "typescript";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-084-commercial-context-coverage.json"));
const previous = JSON.parse(read("config/evolution-phase-083-historical-context-propagation.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_084_COMMERCIAL_CONTEXT_COVERAGE.md");
const compiledEngine = ts.transpileModule(engine, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const runtimeModule = { exports: {} };
new Function("exports", "module", compiledEngine)(runtimeModule.exports, runtimeModule);
const { buildCommercialOutcomeContextCoverage } = runtimeModule.exports;
const runtimeCoverage = buildCommercialOutcomeContextCoverage([
  {
    id: "current-historical",
    eventType: "copilot_task_outcome_recorded",
    createdAt: "2026-07-17T12:00:00.000Z",
    leadId: "lead-1",
    taskId: "task-1",
    outcome: "contacted",
    humanConfirmed: true,
    historicalProjectName: null,
    historicalSourceName: "Meta Ads",
    contextBasis: "historical_outcome_snapshot",
  },
  {
    id: "current-legacy",
    eventType: "copilot_task_outcome_recorded",
    createdAt: "2026-07-16T12:00:00.000Z",
    leadId: "lead-2",
    taskId: "task-2",
    outcome: "proposal_sent",
    humanConfirmed: true,
    projectName: "Inside Perdizes",
    sourceName: "Site",
    contextBasis: "current_lead_snapshot",
  },
  {
    id: "current-duplicate-older",
    eventType: "copilot_task_outcome_recorded",
    createdAt: "2026-07-15T12:00:00.000Z",
    leadId: "lead-2",
    taskId: "task-2",
    outcome: "no_response",
    humanConfirmed: true,
    projectName: "Legacy old label",
    sourceName: "Legacy old source",
    contextBasis: "current_lead_snapshot",
  },
  {
    id: "previous-historical",
    eventType: "copilot_task_outcome_recorded",
    createdAt: "2026-06-10T12:00:00.000Z",
    leadId: "lead-3",
    taskId: "task-3",
    outcome: "meeting_scheduled",
    humanConfirmed: true,
    historicalProjectName: "Arvo Paraíso",
    historicalSourceName: null,
    contextBasis: "historical_outcome_snapshot",
  },
], new Date("2026-07-18T12:00:00.000Z"), 30);

const runtimeContractValid = runtimeCoverage.current.observedTasks === 2
  && runtimeCoverage.current.historicalSnapshotTasks === 1
  && runtimeCoverage.current.currentLeadFallbackTasks === 1
  && runtimeCoverage.current.projects.classifiedCoveragePercent === 50
  && runtimeCoverage.current.projects.historicalClassifiedCoveragePercent === 0
  && runtimeCoverage.current.sources.classifiedCoveragePercent === 100
  && runtimeCoverage.current.sources.historicalClassifiedCoveragePercent === 50
  && runtimeCoverage.previous.observedTasks === 1
  && runtimeCoverage.previous.projects.historicalClassifiedCoveragePercent === 100
  && runtimeCoverage.previous.sources.classifiedCoveragePercent === 0;

const checks = [
  ["Fase anterior encaminha a cobertura contextual", previous.status === "completed" && previous.nextPhase.phase === 84],
  ["Fase 084 concluída sem alterar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 84", program.currentPhase >= 84],
  ["Motor expõe contrato e construtor tipados", engine.includes("export type CommercialOutcomeContextCoverage") && engine.includes("export function buildCommercialOutcomeContextCoverage")],
  ["Cobertura separa projeto e origem", engine.includes("projects: buildContextCoverageDimension") && engine.includes("sources: buildContextCoverageDimension")],
  ["Disponibilidade e preservação histórica são métricas distintas", engine.includes("classifiedCoveragePercent") && engine.includes("historicalClassifiedCoveragePercent") && engine.includes("legacyFallbackClassifiedTasks")],
  ["Denominador é o total de resultados observados", engine.includes('denominator: "observed_tasks"') && engine.includes("percentage(classifiedTasks, outcomes.length)")],
  ["Janelas atual e anterior têm duração equivalente", engine.includes("previousEndMs = currentStartMs - 1") && engine.includes("previousStartMs = previousEndMs - periodDays * 86_400_000")],
  ["Contrato executável preserva nulos, deduplica tarefas e separa histórico de legado", runtimeContractValid],
  ["Valor histórico nulo continua sem associação inventada", engine.includes("Um snapshot histórico com valor nulo continua nulo") && !engine.includes("outcome.historicalProjectName ?? outcome.projectName")],
  ["Política rejeita backfill, qualidade, causa e previsão", engine.includes("historicalBackfillInferred: false") && engine.includes("descriptiveCoverageOnly: true") && engine.includes("qualityClaim: false") && engine.includes("causalClaim: false") && engine.includes("predictiveClaim: false")],
  ["API calcula e devolve a cobertura", route.includes("buildCommercialOutcomeContextCoverage") && route.includes("contextCoverage: commercialOutcomeContextCoverage")],
  ["Filtro supervisionado alcança a nova leitura", route.includes('"contextCoverage"') && dock.includes('"contextCoverage"')],
  ["Rota preserva sessão, tenant, RLS e no-store", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Leitura continua sem efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Copilot mostra dimensão, período e denominador", dock.includes('data-commercial-context-coverage="dimension-period-observed-denominator"') && dock.includes("Quanto da memória está realmente contextualizada") && dock.includes("Preservado no fato") && dock.includes("Denominador: resultados humanos confirmados")],
  ["Interface não transforma cobertura em precisão", dock.includes("Percentuais descrevem cobertura, não qualidade, desempenho, causa ou previsão")],
  ["Relatório registra impacto, segurança, compatibilidade, risco e próxima etapa", report.includes("Impacto operacional") && report.includes("Segurança e governança") && report.includes("Compatibilidade") && report.includes("Risco identificado") && report.includes("Próxima etapa recomendada")],
  ["Release continua bloqueado até o gate", phase.release.zipCreated === false && phase.release.buildExecuted === false && phase.release.gatesApproved === false],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 084 verificada: cobertura contextual por dimensão e período, com preservação histórica separada do fallback legado e sem escrita automática.");
