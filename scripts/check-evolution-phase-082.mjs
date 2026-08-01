import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-082-supervised-commercial-context-snapshot.json"));
const previous = JSON.parse(read("config/evolution-phase-081-commercial-context-provenance.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const taskRoute = read("app/api/v1/tasks/route.ts");
const queueRoute = read("app/api/ai/daily-queue/route.ts");
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_082_SUPERVISED_COMMERCIAL_CONTEXT_SNAPSHOT.md");

const checks = [
  ["Fase anterior encaminha a captura supervisionada", previous.status === "completed" && previous.nextPhase.phase === 82],
  ["Fase 082 concluída sem alterar schema ou dados já existentes", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 82", program.currentPhase >= 82],
  ["Captura permanece no resultado governado e idempotente", taskRoute.includes('action === "record_outcome"') && taskRoute.includes('type: "copilot_task_outcome_recorded"') && taskRoute.includes("idempotencyFingerprint")],
  ["Lead e tenant são confirmados antes do snapshot", taskRoute.includes('.from("leads")') && taskRoute.includes('.select("id,project,source")') && taskRoute.includes('.eq("organization_id", organizationId)')],
  ["Snapshot versionado preserva somente contexto comercial", taskRoute.includes("commercialContextSnapshot") && taskRoute.includes("schemaVersion: 1") && taskRoute.includes('basis: "lead_at_human_confirmation"') && taskRoute.includes("commercialContextCapturedAt")],
  ["Falha de contexto impede gravação parcial", taskRoute.indexOf("TASK_OUTCOME_CONTEXT_SNAPSHOT_FAILED") < taskRoute.indexOf('type: "copilot_task_outcome_recorded"') && taskRoute.includes("task.outcome_context_snapshot_failed")],
  ["Registro não inclui contato pessoal no snapshot", !/commercialContextSnapshot:[\s\S]{0,400}(phone|email|name:)/.test(taskRoute)],
  ["Leitura aceita somente snapshot conhecido e válido", queueRoute.includes("commercialContextSnapshotFrom") && queueRoute.includes('snapshot.schemaVersion !== 1') && queueRoute.includes('snapshot.basis !== "lead_at_human_confirmation"') && queueRoute.includes("Number.isFinite(new Date(capturedAt).getTime())")],
  ["Fallback legado continua explícito e sem backfill", queueRoute.includes('const contextBasis: CommercialOutcomeContextBasis = historicalContext') && queueRoute.includes('? "historical_outcome_snapshot"') && queueRoute.includes(': "current_lead_snapshot"') && queueRoute.includes("currentLeadContextResolvedAt.toISOString()") && queueRoute.includes("nunca reconstruído como histórico")],
  ["Contrato mede cobertura histórica e mista", engine.includes('contextTimeBasis: "historical_outcome_snapshot" | "current_lead_snapshot" | "mixed"') && engine.includes("historicalSnapshotTasks") && engine.includes("currentSnapshotFallbackTasks")],
  ["Recência prefere snapshot histórico comprovado", engine.includes('outcome.contextBasis === "historical_outcome_snapshot"') && engine.includes("outcome.historicalProjectName") && engine.includes("outcome.historicalSourceName")],
  ["Política rejeita inferência histórica", engine.includes("historicalSnapshotPreferred: true") && engine.includes("currentLeadFallbackForLegacy: true") && engine.includes("historicalBackfillInferred: false")],
  ["Copilot mostra cobertura e base de cada fato sob demanda", dock.includes("Fase 82 · contexto supervisionado") && dock.includes("preservado(s) no resultado") && dock.includes("fallback(s) legado(s)") && dock.includes("evidence.contextBasis") && dock.includes("evidence.contextCapturedAt")],
  ["Interface declara que legado não é reconstruído", dock.includes("Registros antigos não são reconstruídos") && dock.includes("contexto preservado quando existe")],
  ["Rotas preservam autenticação, organização, RLS e no-store", taskRoute.includes("requireAccessContext(request)") && queueRoute.includes("requireAccessContext(request)") && queueRoute.includes('"Cache-Control": "no-store"') && !taskRoute.includes("getSupabaseAdmin") && !queueRoute.includes("getSupabaseAdmin")],
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
console.log("Fase 082 verificada: novos resultados preservam contexto supervisionado; legado permanece explícito, sem backfill, schema ou automação.");
