import fs from "node:fs";
import ts from "typescript";

const read = (path) => fs.readFileSync(path, "utf8");
const phase = JSON.parse(read("config/evolution-phase-087-governed-lead-context-correction.json"));
const previous = JSON.parse(read("config/evolution-phase-086-supervised-context-gap-prevention.json"));
const program = JSON.parse(read("config/evolution-program-3000.json"));
const contract = read("lib/atlas/governed-lead-context-correction.ts");
const route = read("app/api/v1/leads/[id]/route.ts");
const page = read("app/(crm)/leads/[id]/page.tsx");
const component = read("components/crm/lead-context-correction.tsx");
const dock = read("components/AtlasCopilotDock.tsx");
const report = read("docs/EVOLUTION_PHASE_087_GOVERNED_LEAD_CONTEXT_CORRECTION.md");

const compiledContract = ts.transpileModule(contract, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const runtimeModule = { exports: {} };
new Function("exports", "module", compiledContract)(runtimeModule.exports, runtimeModule);
const {
  buildGovernedLeadContextAuditMetadata,
  normalizeCommercialContextText,
  sameGovernedLeadCommercialContext,
  validateGovernedLeadContextCorrection,
} = runtimeModule.exports;

const valid = validateGovernedLeadContextCorrection({
  projectId: "1a725388-c9cc-4b42-a66a-24f0f0ca88a1",
  source: "  Meta   Ads  ",
  reason: "Cliente confirmou o empreendimento na ligação.",
  humanConfirmed: true,
});
const invalidProject = validateGovernedLeadContextCorrection({
  projectId: "outro-tenant",
  source: "Site",
  reason: "Correção revisada pela equipe comercial.",
  humanConfirmed: true,
});
const missingEvidence = validateGovernedLeadContextCorrection({ source: "Site", reason: "curto", humanConfirmed: false });
const audit = buildGovernedLeadContextAuditMetadata({
  previous: { projectId: null, projectName: null, source: "Site" },
  current: { projectId: "1a725388-c9cc-4b42-a66a-24f0f0ca88a1", projectName: "Inside Perdizes", source: "Meta Ads" },
  reason: "Cliente confirmou o empreendimento na ligação.",
});
const runtimeContractValid = valid.ok
  && valid.correction.source === "Meta Ads"
  && !invalidProject.ok
  && !missingEvidence.ok
  && normalizeCommercialContextText(" Site\n  orgânico ") === "Site orgânico"
  && sameGovernedLeadCommercialContext({ projectId: null, source: "Site" }, { projectId: null, source: "Site" })
  && audit.historicalSnapshotsRewritten === false
  && audit.automaticFill === false
  && audit.currentLeadStateOnly === true;

const checks = [
  ["Fase anterior encaminha a correção governada", previous.status === "completed" && previous.nextPhase.phase === 87],
  ["Fase 087 concluída sem alterar schema ou dados reais", phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false],
  ["Programa contínuo avançou para a fase 87", program.currentPhase >= 87],
  ["Contrato tipado normaliza, valida e preserva política histórica", contract.includes("GovernedLeadContextCorrection") && runtimeContractValid],
  ["API mantém autenticação, escopo da lead e tenant", route.includes("requireApiIdentity(request)") && route.includes("requireLeadAccess(identity, id)") && route.includes('.eq("organization_id", identity.organizationId)')],
  ["Projetos disponíveis e projeto salvo vêm do tenant atual", route.includes('from("crm_projects")') && route.includes("projectOptions") && route.includes("LEAD_CONTEXT_PROJECT_OUT_OF_SCOPE")],
  ["API exige prévia e detecta alteração concorrente", route.includes("LEAD_CONTEXT_EXPECTATION_REQUIRED") && route.includes("sameGovernedLeadCommercialContext") && route.includes("LEAD_CONTEXT_CORRECTION_CONFLICT")],
  ["Correção registra evento auditável e tenta rollback", route.includes('type: "commercial_context_corrected"') && route.includes("buildGovernedLeadContextAuditMetadata") && route.includes("rollbackQuery")],
  ["Formulário genérico preserva a origem atual", route.includes("source: currentLead.source") && page.includes("use a correção governada acima") && page.includes("readOnly")],
  ["Lead 360 mostra um bloco compacto com motivo e confirmação", component.includes('id="commercial-context"') && component.includes("Motivo auditável") && component.includes("Revisei projeto e origem")],
  ["Lead 360 envia expectativa revisada e recarrega após salvar", page.includes('action: "correct_commercial_context"') && component.includes("expectedProjectId") && component.includes("expectedSource") && page.includes("await load()")],
  ["Copilot abre diretamente o ponto de correção", dock.includes("#commercial-context") && dock.includes("Revisar cadastro da lead")],
  ["Nenhum snapshot histórico é reescrito", contract.includes("historicalSnapshotsRewritten: false") && report.includes("snapshots históricos permanecem imutáveis")],
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
console.log("Fase 087 verificada: correção atual governada, concorrência protegida, auditoria compensável e história imutável.");
