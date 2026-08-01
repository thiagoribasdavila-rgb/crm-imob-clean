import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-070-local-commercial-memory-quality.json"));
const previous = JSON.parse(read("config/evolution-phase-069-explainable-outcome-period-comparison.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const route = read("app/api/ai/daily-queue/route.ts");
const taskRoute = read("app/api/v1/tasks/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_070_LOCAL_COMMERCIAL_MEMORY_QUALITY.md");

const checks = [
  ["Fase anterior encaminha a qualidade da memória", previous.status === "completed" && previous.nextPhase.phase === 70],
  ["Fase 070 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 70", program.currentPhase >= 70],
  ["Motor expõe qualidade e fila de lacunas tipadas", engine.includes("export type CommercialOutcomeMemoryQuality") && engine.includes("export type CommercialOutcomeMemoryGap") && engine.includes("export function buildCommercialOutcomeMemoryQuality")],
  ["Somente conclusão humana vinculada à lead é elegível", engine.includes('event.eventType === "copilot_task_completed"') && engine.includes("event.humanConfirmed") && engine.includes("Boolean(event.leadId)")],
  ["Resultado válido precisa suceder a conclusão", engine.includes("latestOutcomeAtByTask") && engine.includes("< completedAt") && engine.includes("isCommercialOutcomeCode")],
  ["Cobertura e fila curta são factuais e limitadas", engine.includes("eligibleCompletedTasks") && engine.includes("missingOutcomeTasks") && engine.includes("coveragePercent") && engine.includes("gaps.slice(0, queueLimit)")],
  ["Política impede modelo, previsão e escrita automática", engine.includes("generativeModelUsed: false") && engine.includes("manualResolutionOnly: true") && engine.includes("predictiveClaim: false") && engine.includes("downstreamWrites: false")],
  ["Motor local não chama rede ou provedor generativo", !engine.includes("fetch(") && !engine.includes("OPENAI_API_KEY") && !engine.includes("PERPLEXITY_API_KEY")],
  ["API enriquece rótulos sem alterar armazenamento", route.includes("taskDetailsById") && route.includes("leadContexts.get") && route.includes("nullableText(event.description)") && route.includes("buildCommercialOutcomeMemoryQuality")],
  ["Sessão, tenant, RLS e no-store continuam obrigatórios", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Rota de leitura não cria efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Correção manual reutiliza o contrato idempotente existente", taskRoute.includes('action === "record_outcome"') && taskRoute.includes("idempotencyFingerprint") && taskRoute.includes("humanConfirmed")],
  ["Copilot mostra fila compacta e abre o formulário governado", dock.includes("Fase 70 · qualidade da memória") && dock.includes("prepareCommercialMemoryGap") && dock.includes('governedActions: ["record-task-outcome"]') && dock.includes("Registrar resultado observado →")],
  ["Interface explicita limites e confirmação humana", dock.includes("correção manual") && dock.includes("sem modelo generativo, previsão ou escrita automática") && dock.includes("canRecordGovernedTaskOutcome")],
  ["Relatório registra impacto, segurança, risco e próxima etapa", report.includes("Impacto operacional") && report.includes("Segurança e governança") && report.includes("Risco identificado") && report.includes("Próxima etapa recomendada")],
  ["Release continua bloqueado até o gate", phase.release.zipCreated === false && phase.release.buildExecuted === false && phase.release.gatesApproved === false],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 070 verificada: lacunas da memória priorizadas localmente e corrigíveis somente por confirmação humana.");
