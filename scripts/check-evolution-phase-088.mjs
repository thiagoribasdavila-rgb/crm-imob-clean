import fs from "node:fs";
import ts from "typescript";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-088-explainable-context-correction-timeline.json"));
const previous = JSON.parse(read("config/evolution-phase-087-governed-lead-context-correction.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const contract = read("lib/atlas/commercial-context-timeline.ts");
const component = read("components/crm/commercial-context-timeline-entry.tsx");
const page = read("app/(crm)/leads/[id]/page.tsx");
const route = read("app/api/v1/leads/[id]/route.ts");
const report = read("docs/EVOLUTION_PHASE_088_EXPLAINABLE_CONTEXT_CORRECTION_TIMELINE.md");

const compiledContract = ts.transpileModule(contract, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const runtimeModule = { exports: {} };
new Function("exports", "module", compiledContract)(runtimeModule.exports, runtimeModule);
const {
  commercialContextProjectLabel,
  commercialContextSourceLabel,
  parseCommercialContextCorrectionTimeline,
} = runtimeModule.exports;

const validMetadata = {
  correctionReason: "Cliente confirmou o projeto e a origem durante a ligação.",
  previousContext: { projectId: null, projectName: null, source: "Site" },
  currentContext: { projectId: "1a725388-c9cc-4b42-a66a-24f0f0ca88a1", projectName: "Inside Perdizes", source: "Meta Ads" },
  currentLeadStateOnly: true,
  humanConfirmed: true,
  historicalSnapshotsRewritten: false,
  automaticFill: false,
};
const parsed = parseCommercialContextCorrectionTimeline(validMetadata);
const sourceOnly = parseCommercialContextCorrectionTimeline({
  ...validMetadata,
  previousContext: { projectId: validMetadata.currentContext.projectId, projectName: "Inside Perdizes", source: "Site" },
});
const unsafeHistory = parseCommercialContextCorrectionTimeline({ ...validMetadata, historicalSnapshotsRewritten: true });
const automatic = parseCommercialContextCorrectionTimeline({ ...validMetadata, automaticFill: true });
const unchanged = parseCommercialContextCorrectionTimeline({ ...validMetadata, previousContext: validMetadata.currentContext });
const runtimeContractValid = parsed
  && parsed.changedDimensions.join(",") === "project,source"
  && parsed.policy.futureDecisionsUseCurrentContext === true
  && parsed.policy.historicalFactsChanged === false
  && sourceOnly?.changedDimensions.join(",") === "source"
  && unsafeHistory === null
  && automatic === null
  && unchanged === null
  && commercialContextProjectLabel(parsed.current) === "Inside Perdizes"
  && commercialContextProjectLabel(parsed.previous) === "Não informado"
  && commercialContextSourceLabel(parsed.previous) === "Site";

const checks = [
  ["Fase anterior encaminha a timeline explicável", previous.status === "completed" && previous.nextPhase.phase === 88],
  ["Fase 088 concluída sem alterar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 88", program.currentPhase >= 88],
  ["Contrato interpreta antes, agora, dimensão e política futura", contract.includes("CommercialContextCorrectionTimeline") && runtimeContractValid],
  ["Parser rejeita automação, reescrita histórica e evento sem mudança", contract.includes("record.humanConfirmed === true") && contract.includes("record.historicalSnapshotsRewritten === false") && contract.includes("changedDimensions.length === 0")],
  ["Timeline mostra antes, agora e motivo registrado", component.includes('label="Antes"') && component.includes('label="Agora"') && component.includes("Motivo registrado")],
  ["Impacto futuro e imutabilidade histórica estão explícitos", component.includes("Efeito futuro:") && component.includes("próximas decisões, recomendações e resultados") && component.includes("Histórico preservado:") && component.includes("snapshots anteriores")],
  ["Lead 360 especializa apenas o evento governado", page.includes('activity.type === "commercial_context_corrected"') && page.includes("parseCommercialContextCorrectionTimeline") && page.includes("CommercialContextTimelineEntry")],
  ["Evento inválido mantém descrição genérica como fallback", page.includes("!contextCorrection && activity.description")],
  ["Responsável e horário continuam visíveis", page.includes('activity.authorName || "Equipe Atlas"') && page.includes('toLocaleString("pt-BR")')],
  ["Leitura reutiliza metadata já carregado sem novo endpoint", route.includes("mapLiveLeadEvent(row)") && page.includes("activity.metadata") && !component.includes("fetch(")],
  ["Contrato de escrita continua append-only e com história imutável", route.includes('type: "commercial_context_corrected"') && route.includes("buildGovernedLeadContextAuditMetadata")],
  ["Relatório registra impacto, segurança, compatibilidade, risco e próxima etapa", report.includes("Impacto operacional") && report.includes("Segurança e governança") && report.includes("Compatibilidade") && report.includes("Risco identificado") && report.includes("Próxima etapa recomendada")],
  ["Release continua bloqueado até o gate", phase.release.zipCreated === false && phase.release.buildExecuted === false && phase.release.gatesApproved === false],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 088 verificada: antes/depois explicável, motivo humano, efeito futuro e história preservada.");
