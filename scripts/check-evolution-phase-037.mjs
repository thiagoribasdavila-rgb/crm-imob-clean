import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-037-pipeline-movement-workspace.json", "utf8"));
const phaseThirtySix = JSON.parse(fs.readFileSync("config/evolution-phase-036-leads-action-workspace.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const pipeline = fs.readFileSync("app/(crm)/pipeline/page.tsx", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_037_PIPELINE_MOVEMENT_WORKSPACE.md", "utf8");

const checks = [
  ["Fase 037 concluída sem mutação de dados", config.status === "completed" && config.productionDataModified === false && config.dataFetchingChanged === false && config.databaseSchemaChanged === false],
  ["Fase anterior encaminha para Pipeline", phaseThirtySix.status === "completed" && phaseThirtySix.nextPhase.phase === 37],
  ["Pipeline publica o contrato movement-first", pipeline.includes('data-pipeline-layout="movement-first"') && config.pipelineContract.layoutAttribute === "movement-first"],
  ["Fila deriva do Pipeline autorizado já carregado", pipeline.includes('data-priority-source="authorized-loaded-pipeline"') && pipeline.includes("visibleLeads.filter(isOpenLead).slice(0, 3)") && config.pipelineContract.prioritySource === "authorized-loaded-pipeline"],
  ["Fila permanece limitada a três prioridades", pipeline.includes("slice(0, 3)") && config.pipelineContract.visiblePriorityLimit === 3],
  // Reconciliação CC-6: o risco deixou de ser um rótulo textual "Risco {risk}" e passou a ser
  // renderizado como badge visível na fila de prioridade (<AtlasBadge tone={riskTone(risk)}>{risk}).
  // A visibilidade de risco, etapa atual e etapa seguinte foi preservada.
  ["Risco, etapa atual e etapa seguinte ficam visíveis", pipeline.includes("<AtlasBadge tone={riskTone(risk)}>") && pipeline.includes("currentStage?.label") && pipeline.includes("nextStage?.label") && config.movementQueue.currentStageVisible === true],
  ["Movimentação exige escolha humana", pipeline.includes("Movimentar após validar") && pipeline.includes('className="atlas-broker-move-select"') && pipeline.includes("void moveLead(lead.id") && config.movementQueue.movementRequiresHumanSelection === true],
  // Reconciliação CC-6: o atalho de IA foi renomeado de "Preparar com IA" para "abordagem com IA"
  // (rótulos "✦ IA" na fila e "Preparar abordagem com IA" no kanban). O acesso a Lead 360, IA e
  // ligação permanece disponível.
  ["Lead 360, Copilot e ligação permanecem disponíveis", pipeline.includes("Abrir Lead 360") && pipeline.includes("abordagem com IA") && pipeline.includes("contact.call")],
  ["Etapas canônicas e desfazer seguro permanecem", pipeline.includes("DEFAULT_PIPELINE_STAGES") && pipeline.includes("expectedFromStage") && pipeline.includes("undoLastMove") && config.pipelineContract.safeMovementPreserved === true],
  ["Kanban preserva três formas de movimentação", pipeline.includes('draggable={!savingId}') && pipeline.includes("moveByKeyboard") && pipeline.includes("destinationOptions.map")],
  ["Fila duplicada foi consolidada", (pipeline.match(/Comece por aqui/g) || []).length === 1 && !pipeline.includes('className="atlas-broker-focus"') && config.movementQueue.consolidatedSections === 1],
  // Reconciliação CC-6: a frase "no recorte atual" foi reescrita como declaração determinística
  // explícita — "Sugestão determinística calculada apenas com os leads já carregados neste quadro"
  // (data-signal-source="deterministic-loaded-leads"). A interface segue declarando o recorte sem alegar previsão.
  ["Interface declara recorte sem alegar previsão", pipeline.includes("já carregados neste quadro") && pipeline.includes('data-priority-source="authorized-loaded-pipeline"') && config.truthPolicy.queuePresentedAsGlobalPortfolio === false && config.truthPolicy.priorityIsHeuristicNotPrediction === true],
  ["Ações novas são rotuladas e tocáveis", pipeline.includes('aria-labelledby="atlas-pipeline-priority-title"') && pipeline.includes('aria-live="polite"') && styles.includes(".atlas-broker-move-select") && styles.includes("min-height: 44px")],
  ["Cabeçalho e robô foram compactados", styles.includes("padding: clamp(20px, 3vw, 32px)") && styles.includes("width: clamp(64px, 7vw, 94px)")],
  ["Relatório registra verdade, segurança e próxima fase", report.includes("Nenhum score, percentual ou probabilidade") && report.includes("Nenhum ganho de produtividade") && report.includes("Fase 038")],
  ["RBAC, tenant e gate de homologação permanecem", config.safetyPolicy.rbacPreserved === true && config.safetyPolicy.tenantIsolationPreserved === true && phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false]
];

for (const [label, passed] of checks) {
  if (!passed) throw new Error(`Fase 037 inválida: ${label}`);
  console.log(`✓ ${label}`);
}

console.log("Fase 037 aprovada: Pipeline compacto e orientado à movimentação explícita, segura e reversível.");
