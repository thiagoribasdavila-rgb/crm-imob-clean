import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-076-factual-sample-sufficiency.json"));
const previous = JSON.parse(read("config/evolution-phase-075-supervised-observed-outcome-filter.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_076_FACTUAL_SAMPLE_SUFFICIENCY.md");

const checks = [
  ["Fase anterior encaminha a suficiência da amostra", previous.status === "completed" && previous.nextPhase.phase === 76],
  ["Fase 076 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 76", program.currentPhase >= 76],
  ["Motor possui contrato tipado de suficiência factual", engine.includes("export type CommercialOutcomeSampleSufficiency") && engine.includes("export function buildCommercialOutcomeSampleSufficiency")],
  ["Critério transparente exige dez fatos em cada janela", engine.includes("COMMERCIAL_OUTCOME_MINIMUM_PER_WINDOW = 10") && engine.includes("currentObservedTasks >= COMMERCIAL_OUTCOME_MINIMUM_PER_WINDOW") && engine.includes("previousObservedTasks >= COMMERCIAL_OUTCOME_MINIMUM_PER_WINDOW")],
  ["Janela maior não compensa janela insuficiente", !engine.includes("!comparable || totalObserved < 20") && engine.includes("!hasDescriptiveSample(current.observedTasks, previous.observedTasks)")],
  ["Contrato mostra contagens e faltantes atuais e anteriores", ["currentObservedTasks", "previousObservedTasks", "currentMissing", "previousMissing", "minimumPerWindow"].every((value) => engine.includes(value))],
  ["Política proíbe significância, causalidade, previsão e escrita", engine.includes("statisticalSignificanceClaim: false") && engine.includes("causalClaim: false") && engine.includes("predictiveClaim: false") && engine.includes("downstreamWrites: false")],
  ["API calcula a suficiência depois da comparação filtrada", route.includes("buildCommercialOutcomeSampleSufficiency(commercialOutcomeComparison)") && route.includes("sampleSufficiency: commercialOutcomeSampleSufficiency")],
  ["Rota mantém sessão, tenant, RLS e no-store", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Rota não cria efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Copilot mostra indicador compacto e acessível", dock.includes("Fase 76 · suficiência factual") && dock.includes('data-commercial-outcome-sample-sufficiency=') && dock.includes('aria-label="Suficiência factual da amostra comercial"')],
  ["Interface expõe as duas janelas e seus faltantes", dock.includes("Período atual") && dock.includes("Período anterior") && dock.includes("currentMissing") && dock.includes("previousMissing")],
  ["Interface declara o limite do indicador", dock.includes("não representa significância estatística, causalidade ou previsão") && dock.includes("resultados humanos confirmados em cada janela")],
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
console.log("Fase 076 verificada: suficiência factual por janela, limite descritivo explícito e nenhuma previsão, chamada externa ou escrita operacional.");
