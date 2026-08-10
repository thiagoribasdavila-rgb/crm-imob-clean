import { readFileSync } from "node:fs";

const root = process.cwd();

function read(path) {
  return readFileSync(`${root}/${path}`, "utf8");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exitCode = 1;
  }
}

function includes(path, pattern, label = pattern) {
  const source = read(path);
  assert(source.includes(pattern), `${path} precisa conter ${label}`);
}

function excludes(path, pattern, label = pattern) {
  const source = read(path);
  assert(!source.includes(pattern), `${path} não deve conter ${label}`);
}

const pagePath = "app/(crm)/marketing/campaigns/page.tsx";
const approvalRoutePath = "app/api/v1/integrations/meta/test-approvals/route.ts";
const candidateRoutePath = "app/api/v1/integrations/meta/test-candidates/route.ts";
const helperPath = "lib/meta/test-lead-candidate.ts";
const configPath = "config/evolution-phase-165-meta-director-approval-receipt.json";
const programPath = "config/evolution-program-3000.json";
const docsPath = "docs/EVOLUTION_PHASE_165_META_DIRECTOR_APPROVAL_RECEIPT.md";
const roadmapPath = "docs/EVOLUTION_PHASES_165_170_META_CONTROLLED_ACTIVATION_PLAN.md";
const packagePath = "package.json";

const program = JSON.parse(read(programPath));
assert(program.currentPhase === 165, "programa deve avançar para currentPhase 165");

includes(pagePath, 'data-v30-phase="164-meta-eligible-lead-selection"');
includes(pagePath, 'data-v30-phase="165-meta-director-approval-receipt"');
includes(pagePath, "Lead real elegível para o teste Meta");
includes(pagePath, "/api/v1/integrations/meta/test-approvals");
includes(pagePath, "Aprovar lead por 24h");
includes(pagePath, "Nenhum evento foi enviado para Meta.");
includes(pagePath, "lead_candidate_handoff_no_delivery");

includes(approvalRoutePath, "requireAccessContext");
includes(approvalRoutePath, 'accessRoles: ["admin", "director_decisor", "director"]');
includes(approvalRoutePath, "enforceRateLimit");
includes(approvalRoutePath, 'const approvalTtlMs = 24 * 60 * 60 * 1_000');
includes(approvalRoutePath, 'const approvalEventType = "meta.test_lead.approved"');
includes(approvalRoutePath, "isMetaLeadReadyForDirectorApproval");
includes(approvalRoutePath, "candidateFingerprint");
includes(approvalRoutePath, "deliveryAuthorized: false");
includes(approvalRoutePath, "externalEventSent: false");
includes(approvalRoutePath, '.from("atlas_events")');
excludes(approvalRoutePath, "META_CONVERSIONS_ACCESS_TOKEN", "token de conversão Meta");
excludes(approvalRoutePath, '.from("meta_conversions")', "fila externa Meta");

includes(candidateRoutePath, "buildMetaLeadCandidate");
includes(helperPath, "isMetaLeadReadyForDirectorApproval");
includes(configPath, '"phase": 165');
includes(configPath, "Meta Director Lead Approval Receipt");
includes(docsPath, "Fase 165");
includes(docsPath, "não chama CAPI");
includes(roadmapPath, "| 170 |");
includes(roadmapPath, "Homologação da onda Meta/Andromeda");
includes(packagePath, '"evolution:phase-165:check"');

if (!process.exitCode) {
  console.log("✅ Fase 165 validada: aprovação Meta da diretoria persistida, temporária e sem envio externo.");
}
