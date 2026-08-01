import fs from "node:fs";
const config = JSON.parse(fs.readFileSync("config/evolution-phase-046-distribution-capacity.json", "utf8"));
const previous = JSON.parse(fs.readFileSync("config/evolution-phase-045-team-conversion-support.json", "utf8"));
const page = fs.readFileSync("app/(crm)/distribution/page.tsx", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_046_DISTRIBUTION_CAPACITY.md", "utf8");
const checks = [
  ["Fase 046 concluída sem mutação de dados ou schema", config.status === "completed" && config.productionDataModified === false && config.databaseSchemaChanged === false],
  ["Fase anterior encaminha proteção da distribuição", previous.nextPhase.phase === 46],
  ["Distribuição declara leitura por capacidade", page.includes('data-evolution-phase="46"') && page.includes('data-distribution-layout="capacity-first"')],
  ["Decisão mostra no máximo três sinais", page.includes(".slice(0, 3)") && config.distributionContract.visibleDecisionLimit === 3],
  ["Espera, capacidade e equilíbrio são explícitos", page.includes("oldestWaitingMinutes") && page.includes("brokersNearCapacity") && page.includes("balanceGap")],
  ["Copilot recebe contexto agregado", page.includes('module: "distribution-capacity"') && page.includes("humanApprovalRequired: true") && config.copilotPolicy.aggregateContextOnly === true],
  ["IA não distribui nem altera limites", page.includes("Não distribua leads, não altere capacidade e não envie mensagens") && config.distributionContract.automaticAssignment === false],
  // CC-6: onClick reformatado com espaços no arrow (() => void distribute(1)).
  // O clique humano de atribuição segue presente; só o whitespace mudou.
  ["Atribuição continua exigindo clique humano", page.includes("void distribute(1)") && page.includes("decisão explícita da liderança") && config.safetyPolicy.explicitLeadershipActionRequired === true],
  ["Fila preserva proteção de dados", page.includes("sem PII") && config.distributionContract.personalDataExposed === false],
  ["Relatório registra governança e próxima fase", report.includes("aprovação humana") && config.nextPhase.phase === 47]
];
for (const [label, passed] of checks) { if (!passed) { console.error(`✗ ${label}`); process.exitCode = 1; } else console.log(`✓ ${label}`); }
if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 046 verificada: distribuição prioriza capacidade, espera e equilíbrio com decisão humana.");
