import fs from "node:fs";
const config = JSON.parse(fs.readFileSync("config/evolution-phase-044-proactive-copilot.json", "utf8"));
const previous = JSON.parse(fs.readFileSync("config/evolution-phase-043-reactivation-decision-workspace.json", "utf8"));
const page = fs.readFileSync("app/(crm)/ai-dashboard/page.tsx", "utf8");
const dock = fs.readFileSync("components/AtlasCopilotDock.tsx", "utf8");
const api = fs.readFileSync("app/api/ai/copilot/route.ts", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_044_PROACTIVE_COPILOT.md", "utf8");
const checks = [
  ["Fase 044 concluída sem mutação de dados ou schema", config.status === "completed" && config.productionDataModified === false && config.databaseSchemaChanged === false],
  ["Fase anterior encaminha Copilot", previous.nextPhase.phase === 44],
  ["Copilot declara operação proativa e humana", page.includes('data-evolution-phase="44"') && page.includes('data-ai-layout="proactive-human-led"') && page.includes("IA SUGERE") && page.includes("HUMANO DECIDE")],
  ["Três playbooks cobrem SLA, inércia e estoque", (page.match(/id: "(sla|next-action|inventory)"/g) || []).length === 3 && config.copilotContract.visiblePlaybooks === 3],
  ["Prompt proíbe execução automática", page.includes("Não execute contato, movimentação ou distribuição") && config.copilotContract.automaticExecution === false],
  ["Contexto enviado é agregado", page.includes('module: "ai-dashboard"') && !page.includes("phone") && config.copilotContract.aggregateContextOnly === true],
  ["Fallback local e governança existentes permanecem", dock.includes("externalContext") && api.includes("buildFallbackRealEstateAnswer") && api.includes('mode = "local-fallback"') && config.copilotContract.localIntelligenceFallbackPreserved === true],
  ["Falha técnica usa recuperação segura", page.includes("AtlasRecoverableError") && config.truthPolicy.technicalErrorsExposed === false],
  ["Relatório registra decisão humana", report.includes("decisão humana") && config.nextPhase.phase === 45]
];
for (const [label, passed] of checks) { if (!passed) { console.error(`✗ ${label}`); process.exitCode = 1; } else console.log(`✓ ${label}`); }
if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 044 verificada: Copilot proativo prepara decisões sem executar ações comerciais.");
