import fs from "node:fs";
const config = JSON.parse(fs.readFileSync("config/evolution-phase-047-sales-revenue-decision.json", "utf8"));
const previous = JSON.parse(fs.readFileSync("config/evolution-phase-046-distribution-capacity.json", "utf8"));
const page = fs.readFileSync("app/(crm)/sales/page.tsx", "utf8");
const checkpoints = JSON.parse(fs.readFileSync("config/evolution-zip-checkpoints.json", "utf8"));
const report = fs.readFileSync("docs/EVOLUTION_PHASE_047_SALES_REVENUE_DECISION.md", "utf8");
const checks = [
  ["Fase 047 concluída sem mutação de dados ou schema", config.status === "completed" && config.productionDataModified === false && config.databaseSchemaChanged === false],
  ["Fase anterior encaminha decisões de receita", previous.nextPhase.phase === 47],
  ["Vendas declara decisão de receita primeiro", page.includes('data-evolution-phase="47"') && page.includes('data-sales-layout="revenue-decision-first"')],
  ["Fila limita três decisões verificáveis", page.includes(".slice(0, 3)") && config.revenueContract.visibleDecisionLimit === 3],
  ["Fechamento e comissão têm sinais explicáveis", page.includes("commission === \"overdue\"") && page.includes('risk.key === "at_risk"') && page.includes('risk.key === "incomplete"')],
  ["Copilot exige aprovação e não executa", page.includes('module: "sales-revenue-decision"') && page.includes("Não altere o forecast, não registre pagamento e não envie mensagens")],
  // CC-6: anti-promessa reescrita para "a previsão orienta a revisão, não garante fechamento".
  ["Previsão não é promessa", page.includes("não garante fechamento") && config.revenueContract.forecastGuarantee === false],
  ["Ações financeiras continuam explícitas", page.includes("configureCommission") && page.includes("registerPayment") && config.safetyPolicy.financialActionsRemainExplicit === true],
  ["Marco excepcional da fase 47 está programado", checkpoints.specialCheckpoints.includes(47) && config.checkpoint.specialFirstPackage === true && config.checkpoint.nextRecurringPackage === 100],
  ["Relatório registra o primeiro pacote e continuidade", report.includes("ZIP excepcional") && config.nextPhase.phase === 48]
];
for (const [label, passed] of checks) { if (!passed) { console.error(`✗ ${label}`); process.exitCode = 1; } else console.log(`✓ ${label}`); }
if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 047 verificada: receita prioriza confirmações humanas e está pronta para o primeiro pacote.");
