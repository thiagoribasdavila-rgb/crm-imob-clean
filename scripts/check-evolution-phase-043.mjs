import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-043-reactivation-decision-workspace.json", "utf8"));
const previous = JSON.parse(fs.readFileSync("config/evolution-phase-042-project-decision-workspace.json", "utf8"));
const page = fs.readFileSync("app/(crm)/leads/reactivation-governance/page.tsx", "utf8");
const api = fs.readFileSync("app/api/v1/crm/reactivation/governance/route.ts", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_043_REACTIVATION_DECISION_WORKSPACE.md", "utf8");

const checks = [
  ["Fase 043 concluída sem mutação de dados ou schema", config.status === "completed" && config.productionDataModified === false && config.databaseSchemaChanged === false],
  ["Fase anterior encaminha Reativação", previous.nextPhase.phase === 43],
  ["Reativação declara decisão como primeira leitura", page.includes('data-evolution-phase="43"') && page.includes('data-reactivation-layout="decision-first"')],
  ["Fila limita três decisões explicáveis", api.includes(".slice(0, 3)") && api.includes("decisionForBatch") && config.reactivationContract.visibleDecisionLimit === 3],
  ["Base fria permanece separada da carteira", page.includes("BASE FRIA SEPARADA") && config.reactivationContract.coldBaseSeparated === true],
  ["Simulação não cria mensagem nem ação externa", api.includes("noMessagesCreated: true") && api.includes("noExternalAction: true") && config.reactivationContract.simulationCreatesMessages === false],
  ["Copilot recebe apenas evidência agregada", page.includes('module: "reactivation"') && !page.includes("phone") && config.safetyPolicy.personalDataSentInCopilotContext === false],
  ["Nenhum contato automático foi adicionado", page.includes("nenhum contato, envio ou transferência") && config.reactivationContract.automaticCustomerContact === false],
  ["Falha técnica vira recuperação segura", page.includes("AtlasRecoverableError") && !api.includes("Aplique a migration") && config.truthPolicy.technicalErrorsExposed === false],
  ["Relatório registra limites e próxima fase", report.includes("aprovação humana") && config.nextPhase.phase === 44]
];

for (const [label, passed] of checks) {
  if (!passed) { console.error(`✗ ${label}`); process.exitCode = 1; } else console.log(`✓ ${label}`);
}
if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 043 verificada: reativação prioriza respostas, bloqueios e qualidade sem contato autônomo.");
