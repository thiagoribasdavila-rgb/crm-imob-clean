import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-080-contextual-recency-evidence.json"));
const previous = JSON.parse(read("config/evolution-phase-079-contextual-commercial-memory-freshness.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_080_CONTEXTUAL_RECENCY_EVIDENCE.md");

const checks = [
  ["Fase anterior encaminha evidências contextuais", previous.status === "completed" && previous.nextPhase.phase === 80],
  ["Fase 080 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 80", program.currentPhase >= 80],
  ["Contrato contextual possui evidência mínima tipada", engine.includes("export type CommercialOutcomeContextFreshnessEvidenceItem") && engine.includes("evidence: CommercialOutcomeContextFreshnessEvidenceItem[]") && engine.includes("remainingEvidence: number")],
  ["Motor limita evidência e mantém a contagem restante", engine.includes("requestedEvidenceLimit = 2") && engine.includes("Math.min(3") && engine.includes("remainingEvidence: Math.max(0, orderedEvidence.length - evidenceLimit)")],
  ["Evidência contém somente referência, resultado e horário", engine.includes("eventId: outcome.id") && engine.includes("observedAt: new Date") && engine.includes("outcomeLabel: commercialOutcomeDefinitionByCode")],
  ["Contrato rejeita identidade, contato, ranking, qualidade, causa e previsão", engine.includes("personalIdentityIncluded: false") && engine.includes("personalContactDataIncluded: false") && engine.includes("rankingClaim: false") && engine.includes("qualityClaim: false") && engine.includes("causalClaim: false") && engine.includes("predictiveClaim: false")],
  ["API solicita dois fatos sobre a amostra filtrada existente", route.includes("buildCommercialOutcomeContextFreshness(filteredOutcomeInputs, outcomeGeneratedAt, outcomePeriodDays, 4, 2")],
  ["Rota mantém sessão, tenant, RLS e no-store", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Rota continua sem efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Copilot apresenta os fatos somente sob demanda", dock.includes("data-commercial-context-evidence") && dock.includes("Conferir fatos") && dock.includes("Fase 80 · evidências sob demanda")],
  ["Controle é nativo, acessível e preserva fatos adicionais", dock.includes("<details") && dock.includes("<summary") && dock.includes("aria-label={`Conferir fatos humanos de ${segment.label}`}") && dock.includes("segment.remainingEvidence")],
  ["Interface declara proteção de dados e limites semânticos", dock.includes("sem nome, contato ou mensagem") && dock.includes("não mede qualidade, desempenho, conversão ou chance de venda")],
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
console.log("Fase 080 verificada: fatos contextuais sob demanda, sem dados pessoais, nova consulta, escrita operacional ou alteração de schema.");
