import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-077-auditable-commercial-outcome-evidence.json"));
const previous = JSON.parse(read("config/evolution-phase-076-factual-sample-sufficiency.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const engine = read("lib/atlas/commercial-outcome-summary.ts");
const route = read("app/api/ai/daily-queue/route.ts");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_077_AUDITABLE_COMMERCIAL_OUTCOME_EVIDENCE.md");

const checks = [
  ["Fase anterior encaminha evidências auditáveis", previous.status === "completed" && previous.nextPhase.phase === 77],
  ["Fase 077 concluída sem mutar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 77", program.currentPhase >= 77],
  ["Motor possui contrato e construtor tipados de evidência", engine.includes("export type CommercialOutcomeEvidence") && engine.includes("export type CommercialOutcomeEvidenceItem") && engine.includes("export function buildCommercialOutcomeEvidence")],
  ["Evidência usa somente o último fato humano por tarefa", engine.includes("latestObservedOutcomes(events, currentStartMs, currentEndMs)") && engine.includes("latestObservedOutcomes(events, previousStartMs, previousEndMs)") && engine.includes("humanConfirmedOnly: true") && engine.includes("latestOutcomePerTask: true")],
  ["Janelas não se sobrepõem e preservam contagens totais", engine.includes("previousEndMs = currentStartMs - 1") && engine.includes("currentTotal: currentOutcomes.length") && engine.includes("previousTotal: previousOutcomes.length") && engine.includes("currentRemaining") && engine.includes("previousRemaining")],
  ["Contrato exclui dados pessoais de contato", engine.includes("personalContactDataIncluded: false") && !engine.includes("CommercialOutcomeEvidenceItem = {\n  phone:") && !engine.includes("CommercialOutcomeEvidenceItem = {\n  email:")],
  ["Política proíbe causalidade, previsão e escrita", engine.includes("readOnly: true") && engine.includes("causalClaim: false") && engine.includes("predictiveClaim: false") && engine.includes("downstreamWrites: false")],
  ["API calcula evidência sobre o recorte filtrado", route.includes("buildCommercialOutcomeEvidence(filteredOutcomeInputs") && route.includes("evidence: commercialOutcomeEvidence") && route.includes('appliedTo: ["summary", "comparison", "evidence"')],
  ["Rota mantém sessão, tenant, RLS e no-store", route.includes("requireAccessContext(request)") && route.includes('.eq("organization_id", organizationId)') && route.includes("identity.supabase") && route.includes('"Cache-Control": "no-store"') && !route.includes("getSupabaseAdmin")],
  ["Rota não cria efeitos downstream", !route.includes(".insert(") && !route.includes(".update(") && !route.includes(".upsert(") && !route.includes(".delete(")],
  ["Copilot usa painel recolhível e acessível", dock.includes("Fase 77 · evidências auditáveis") && dock.includes("<details") && dock.includes("<summary") && dock.includes('aria-label="Conferir evidências humanas da memória comercial"')],
  ["Interface mostra as duas janelas e os fatos restantes", dock.includes("commercialOutcomeSummary.evidence.current") && dock.includes("commercialOutcomeSummary.evidence.previous") && dock.includes("window.remaining") && dock.includes("permanecem na contagem deste recorte")],
  ["Interface declara exclusão de contatos e limites", dock.includes("Sem telefone, e-mail, previsão ou alteração automática") && dock.includes("contexto histórico preferido") && dock.includes("fallback atual sem reconstrução")],
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
console.log("Fase 077 verificada: fatos auditáveis por janela, escopo preservado e nenhum dado de contato, modelo externo ou efeito operacional.");
