import fs from "node:fs";
const config = JSON.parse(fs.readFileSync("config/evolution-phase-045-team-conversion-support.json", "utf8"));
const previous = JSON.parse(fs.readFileSync("config/evolution-phase-044-proactive-copilot.json", "utf8"));
const page = fs.readFileSync("app/(crm)/brokers/page.tsx", "utf8");
const api = fs.readFileSync("app/api/v1/crm/team/conversion/route.ts", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_045_TEAM_CONVERSION_SUPPORT.md", "utf8");
const checks = [
  ["Fase 045 concluída sem mutação de dados ou schema", config.status === "completed" && config.productionDataModified === false && config.databaseSchemaChanged === false],
  ["Fase anterior encaminha gestão da equipe", previous.nextPhase.phase === 45],
  ["Equipe declara apoio à conversão", page.includes('data-evolution-phase="45"') && page.includes('data-team-layout="conversion-support"')],
  ["Fila limita três carteiras sem ranking", api.includes(".slice(0, 3)") && api.includes("peopleRanking: false") && page.includes("não é um ranking de pessoas") && config.teamContract.visibleSupportLimit === 3],
  ["Sinais de carga são explicáveis", api.includes("overdue.length * 4") && api.includes("hotWithoutNextAction.length * 3") && config.teamContract.explainableSignals.length === 3],
  ["API usa sessão autenticada e RLS", api.includes("requireAccessContext") && api.includes("identity.supabase") && !api.includes("getSupabaseAdmin") && config.safetyPolicy.authenticatedRlsClientUsed === true],
  ["Compatibilidade não remove organização", api.includes("isMissingColumn") && (api.match(/eq\("organization_id", organizationId\)/g) || []).length >= 4],
  ["Dados de contato não são devolvidos", !api.includes("phone") && !api.includes("email") && config.teamContract.directContactDataReturned === false],
  ["Copilot usa somente sinais agregados", page.includes('module: "team-conversion"') && !page.includes("memberId:") && config.safetyPolicy.personalDataSentToCopilot === false],
  ["Relatório registra apoio não punitivo", report.includes("não é ranking") && config.nextPhase.phase === 46]
];
for (const [label, passed] of checks) { if (!passed) { console.error(`✗ ${label}`); process.exitCode = 1; } else console.log(`✓ ${label}`); }
if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 045 verificada: gestão enxerga bloqueios de carteira sem ranking punitivo.");
