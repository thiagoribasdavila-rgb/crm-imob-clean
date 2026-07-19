import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-063-governed-pipeline-movement.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const dock = read("components/AtlasCopilotDock.tsx");
const pipeline = read("app/api/v1/pipeline/route.ts");
const report = read("docs/EVOLUTION_PHASE_063_GOVERNED_PIPELINE_MOVEMENT.md");

const checks = [
  ["Fase 063 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 63", program.currentPhase >= 63],
  ["Copilot mostra uma prévia de pipeline separada da resposta", dock.includes('data-governed-write="pipeline-move"') && dock.includes("pipelineContext") && dock.includes("pipelineTarget")],
  ["Usuário precisa revisar e confirmar a mudança", dock.includes("pipelineReviewed") && dock.includes('data-governed-confirmation="pipeline"') && dock.includes("Confirmar movimentação")],
  ["UI informa etapa esperada e confirmação explícita", dock.includes('fetch("/api/v1/pipeline"') && dock.includes("expectedFromStage: pipelineContext.currentStage") && dock.includes('source: "atlas-copilot"') && dock.includes("humanConfirmed: true")],
  ["Backend bloqueia movimentação silenciosa do Copilot", pipeline.includes("COPILOT_PIPELINE_CONFIRMATION_REQUIRED") && pipeline.includes('source === "atlas-copilot" && !humanConfirmed')],
  ["Tenant e acesso à lead continuam obrigatórios", pipeline.includes("requireApiIdentity") && pipeline.includes("requireLeadAccess(identity, leadId)") && pipeline.includes('.eq("organization_id", identity.organizationId)')],
  ["Concorrência usa a etapa atual como trava", pipeline.includes("previousStage !== expectedFromStage") && pipeline.includes("PIPELINE_STAGE_CONFLICT") && dock.includes("nextGovernedPipelineStage(currentStage)")],
  ["Movimentação e reversão mantêm evidência auditável", pipeline.includes('from("pipeline_history")') && pipeline.includes("reversalOf") && dock.includes("undoConfirmedPipeline") && dock.includes("Desfazer movimentação")],
  ["Origem e confirmação entram no histórico comercial", pipeline.includes("recordLiveLeadEvent") && pipeline.includes("source,") && pipeline.includes('humanConfirmed: source === "atlas-copilot" ? humanConfirmed : null')],
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
console.log("Fase 063 verificada: o Copilot movimenta o pipeline somente após revisão humana, com trava concorrente, histórico e reversão segura.");
