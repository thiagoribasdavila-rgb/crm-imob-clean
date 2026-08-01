import fs from "node:fs";
import ts from "typescript";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-086-supervised-context-gap-prevention.json"));
const previous = JSON.parse(read("config/evolution-phase-085-auditable-context-gap-queue.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-context-preview.ts");
const queueRoute = read("app/api/ai/daily-queue/route.ts");
const taskRoute = read("app/api/v1/tasks/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_086_SUPERVISED_CONTEXT_GAP_PREVENTION.md");

const compiledEngine = ts.transpileModule(engine, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const runtimeModule = { exports: {} };
new Function("exports", "module", compiledEngine)(runtimeModule.exports, runtimeModule);
const { buildCommercialOutcomeContextPreview, sameCommercialOutcomeContextPreview } = runtimeModule.exports;
const complete = buildCommercialOutcomeContextPreview({ projectName: " Inside   Perdizes ", sourceName: "Meta Ads" });
const missing = buildCommercialOutcomeContextPreview({ projectName: null, sourceName: "" });
const runtimeContractValid = complete.status === "complete"
  && complete.projectName === "Inside Perdizes"
  && complete.sourceName === "Meta Ads"
  && complete.missingDimensions.length === 0
  && missing.status === "attention"
  && missing.missingDimensions.join(",") === "project,source"
  && missing.policy.missingContextBlocksRecording === false
  && missing.policy.automaticFill === false
  && sameCommercialOutcomeContextPreview(complete, { projectName: "Inside Perdizes", sourceName: "Meta Ads" })
  && !sameCommercialOutcomeContextPreview(complete, missing);

const checks = [
  ["Fase anterior encaminha a prevenção supervisionada", previous.status === "completed" && previous.nextPhase.phase === 86],
  ["Fase 086 concluída sem alterar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 86", program.currentPhase >= 86],
  ["Contrato tipado diferencia contexto completo e ausente", engine.includes("export type CommercialOutcomeContextPreview") && engine.includes("missingDimensions") && runtimeContractValid],
  ["Política permite registrar ausência sem preencher valores", engine.includes("missingContextBlocksRecording: false") && engine.includes("automaticFill: false") && engine.includes("historicalSnapshotOnConfirmation: true")],
  ["Fila reaproveita o contexto já carregado sem nova consulta", queueRoute.includes("const queueItems = queue.items.map") && queueRoute.includes("leadContexts.get(item.leadId)") && queueRoute.includes("outcomeContextPreview: buildCommercialOutcomeContextPreview")],
  ["Copilot propaga contexto para tarefa e lacuna antiga", dock.includes("outcomeContextPreview: item.outcomeContextPreview") && dock.includes("projectName: gap.projectName") && dock.includes("sourceName: gap.sourceName")],
  ["Prévia mostra projeto, origem, ausência e correção opcional", dock.includes('data-commercial-outcome-context-preview=') && dock.includes("contexto que será preservado") && dock.includes("Não informado") && dock.includes("Revisar cadastro da lead")],
  ["Ausência contextual não desabilita o botão", dock.includes('disabled={!taskOutcome || !taskOutcomeReviewed || taskOutcomeSaving}') && !dock.includes('disabled={!taskOutcome || !taskOutcomeReviewed || taskCompletionContext.outcomeContextPreview.status')],
  ["Confirmação humana abrange resultado e contexto", dock.includes("commercialContextReviewed: true") && dock.includes("revisei o projeto e a origem mostrados acima")],
  ["API exige prévia revisada e idempotência", taskRoute.includes("commercialContextReviewed") && taskRoute.includes("hasExpectedCommercialContext") && taskRoute.includes("expectedCommercialContext: expectedCommercialContextPreview") && taskRoute.includes("COPILOT_TASK_IDEMPOTENCY_REQUIRED")],
  ["Servidor detecta mudança concorrente e devolve contexto atual", taskRoute.includes("sameCommercialOutcomeContextPreview") && taskRoute.includes("TASK_OUTCOME_CONTEXT_CONFLICT") && taskRoute.includes("commercialContextPreview: currentCommercialContextPreview")],
  ["Snapshot usa somente valores confirmados no servidor", taskRoute.includes("projectName: currentCommercialContextPreview.projectName") && taskRoute.includes("sourceName: currentCommercialContextPreview.sourceName") && taskRoute.includes('basis: "lead_at_human_confirmation"')],
  ["Tenant, lead visível e RLS continuam preservados", taskRoute.includes("requireAccessContext(request)") && taskRoute.includes('.eq("organization_id", organizationId)') && taskRoute.includes('from("leads")') && !taskRoute.includes("getSupabaseAdmin")],
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
console.log("Fase 086 verificada: contexto visível antes do resultado, ausência não bloqueante e snapshot protegido contra alteração concorrente.");
