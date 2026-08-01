import fs from "node:fs";
import ts from "typescript";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-085-auditable-context-gap-queue.json"));
const previous = JSON.parse(read("config/evolution-phase-084-commercial-context-coverage.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_085_AUDITABLE_CONTEXT_GAP_QUEUE.md");
const compiledEngine = ts.transpileModule(engine, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const runtimeModule = { exports: {} };
new Function("exports", "module", compiledEngine)(runtimeModule.exports, runtimeModule);
const { buildCommercialOutcomeContextGapQueue } = runtimeModule.exports;
const runtimeQueue = buildCommercialOutcomeContextGapQueue([
  {
    id: "historical-both-missing",
    eventType: "copilot_task_outcome_recorded",
    createdAt: "2026-07-17T12:00:00.000Z",
    leadId: "lead-1",
    leadName: "Lead um",
    taskId: "task-1",
    taskTitle: "Confirmar interesse",
    outcome: "contacted",
    humanConfirmed: true,
    historicalProjectName: null,
    historicalSourceName: null,
    contextBasis: "historical_outcome_snapshot",
  },
  {
    id: "legacy-project-missing",
    eventType: "copilot_task_outcome_recorded",
    createdAt: "2026-07-10T12:00:00.000Z",
    leadId: "lead-2",
    leadName: "Lead dois",
    taskId: "task-2",
    taskTitle: "Enviar material",
    outcome: "proposal_sent",
    humanConfirmed: true,
    projectName: null,
    sourceName: "Site",
    contextBasis: "current_lead_snapshot",
  },
  {
    id: "legacy-duplicate-older",
    eventType: "copilot_task_outcome_recorded",
    createdAt: "2026-07-05T12:00:00.000Z",
    leadId: "lead-2",
    taskId: "task-2",
    outcome: "no_response",
    humanConfirmed: true,
    projectName: null,
    sourceName: null,
    contextBasis: "current_lead_snapshot",
  },
  {
    id: "historical-source-missing",
    eventType: "copilot_task_outcome_recorded",
    createdAt: "2026-07-15T12:00:00.000Z",
    leadId: "lead-3",
    taskId: "task-3",
    outcome: "meeting_scheduled",
    humanConfirmed: true,
    historicalProjectName: "Inside Perdizes",
    historicalSourceName: null,
    contextBasis: "historical_outcome_snapshot",
  },
  {
    id: "complete-context",
    eventType: "copilot_task_outcome_recorded",
    createdAt: "2026-07-16T12:00:00.000Z",
    leadId: "lead-4",
    taskId: "task-4",
    outcome: "follow_up_needed",
    humanConfirmed: true,
    projectName: "Arvo Paraíso",
    sourceName: "Meta Ads",
    contextBasis: "current_lead_snapshot",
  },
  {
    id: "outside-window",
    eventType: "copilot_task_outcome_recorded",
    createdAt: "2026-06-01T12:00:00.000Z",
    leadId: "lead-5",
    taskId: "task-5",
    outcome: "other",
    humanConfirmed: true,
    projectName: null,
    sourceName: null,
    contextBasis: "current_lead_snapshot",
  },
], new Date("2026-07-18T12:00:00.000Z"), 30, 2);

const runtimeContractValid = runtimeQueue.observedTasks === 4
  && runtimeQueue.outcomesWithContextGaps === 3
  && runtimeQueue.missingProjectTasks === 2
  && runtimeQueue.missingSourceTasks === 2
  && runtimeQueue.missingBothTasks === 1
  && runtimeQueue.immutableHistoricalGaps === 2
  && runtimeQueue.currentLeadReviewableGaps === 1
  && runtimeQueue.queue.length === 2
  && runtimeQueue.remainingGaps === 1
  && runtimeQueue.queue[0]?.eventId === "historical-both-missing"
  && runtimeQueue.queue[0]?.correctionMode === "future_results_only"
  && runtimeQueue.queue[1]?.eventId === "legacy-project-missing"
  && runtimeQueue.queue[1]?.correctionMode === "update_current_lead"
  && runtimeQueue.queue[1]?.href === "/leads/lead-2";

const checks = [
  ["Fase anterior encaminha a fila de lacunas", previous.status === "completed" && previous.nextPhase.phase === 85],
  ["Fase 085 concluída sem alterar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 85", program.currentPhase >= 85],
  ["Motor expõe contrato e construtor tipados", engine.includes("export type CommercialOutcomeContextGapQueue") && engine.includes("export function buildCommercialOutcomeContextGapQueue")],
  ["Fila separa projeto, origem e ausência conjunta", engine.includes('missingDimensions.push("project")') && engine.includes('missingDimensions.push("source")') && engine.includes("missingBothTasks")],
  ["Ordenação usa lacunas observadas e idade factual", engine.includes("right.missingDimensions.length - left.missingDimensions.length") && engine.includes("left.observedAt.localeCompare(right.observedAt)") && engine.includes("businessImpactInferred: false")],
  ["Contrato executável preserva deduplicação, limite e modos de correção", runtimeContractValid],
  ["Histórico imutável e cadastro atual não são confundidos", engine.includes('correctionMode: historicalEvidenceImmutable ? "future_results_only" : "update_current_lead"') && engine.includes("historicalEvidenceImmutable: true")],
  ["Política rejeita backfill, previsão, ranking e escrita", engine.includes("historicalBackfillInferred: false") && engine.includes("manualCorrectionOnly: true") && engine.includes("predictiveClaim: false") && engine.includes("rankingClaim: false") && engine.includes("downstreamWrites: false")],
  ["API calcula a fila com todos os resultados e a devolve", route.includes("buildCommercialOutcomeContextGapQueue(outcomeInputs") && route.includes("contextGapQueue: commercialOutcomeContextGapQueue") && route.includes('contextGapQueueScope: "all-outcomes"')],
  ["Filtro supervisionado não oculta lacunas de outra categoria", route.includes('appliedTo: ["summary", "comparison", "evidence", "freshness", "contextFreshness", "context", "contextComparison", "contextCoverage"]') && dock.includes('"contextComparison" | "contextCoverage">') && !dock.includes('"contextComparison" | "contextCoverage" | "contextGapQueue">')],
  ["Rota preserva sessão, tenant, RLS e no-store", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Leitura continua sem efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Copilot mostra fila curta, dimensão ausente e revisão humana", dock.includes('data-commercial-context-gap-queue="missing-dimensions-oldest-human-review"') && dock.includes("O que precisa de contexto humano") && dock.includes("Projeto ausente") && dock.includes("Origem ausente") && dock.includes("Atualizar lead")],
  ["Interface explica imutabilidade e ausência de inferência", dock.includes("evidência histórica nunca é reescrita") && dock.includes("não infere impacto comercial, score, ranking ou previsão")],
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
console.log("Fase 085 verificada: fila curta de lacunas contextuais, com revisão humana, histórico imutável e nenhuma escrita automática.");
