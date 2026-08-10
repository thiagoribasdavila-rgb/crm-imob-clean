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
const routePath = "app/api/v1/integrations/meta/test-candidates/route.ts";
const configPath = "config/evolution-phase-164-meta-eligible-lead-selection.json";
const programPath = "config/evolution-program-3000.json";
const docsPath = "docs/EVOLUTION_PHASE_164_META_ELIGIBLE_LEAD_SELECTION.md";
const packagePath = "package.json";

const program = JSON.parse(read(programPath));
assert(program.currentPhase === 164, "programa deve avançar para currentPhase 164");

includes(routePath, "requireAccessContext");
includes(routePath, 'accessRoles: ["admin", "director_decisor", "director"]');
includes(routePath, "enforceRateLimit");
includes(routePath, "lead_candidate_selection_no_delivery");
includes(routePath, "readinessPct");
includes(routePath, "hasMetaOrigin");
includes(routePath, "Não envia CAPI");
includes(routePath, "Não expõe telefone, e-mail, CPF, renda ou documento.");
excludes(routePath, "META_CONVERSIONS_ACCESS_TOKEN", "token de conversão Meta");

includes(pagePath, "MetaTestLeadCandidate");
includes(pagePath, "leadCandidates");
includes(pagePath, "loadLeadCandidates");
includes(pagePath, "/api/v1/integrations/meta/test-candidates");
includes(pagePath, 'data-v30-phase="164-meta-eligible-lead-selection"');
includes(pagePath, "Lead real elegível para o teste Meta");
includes(pagePath, "MetaLeadCandidateCard");
includes(pagePath, "lead_candidate_handoff_no_delivery");
includes(pagePath, "Nenhum evento foi enviado para Meta.");

includes(configPath, '"phase": 164');
includes(configPath, "Meta Eligible Lead Selection");
includes(configPath, "sem disparo CAPI");

includes(docsPath, "Fase 164");
includes(docsPath, "Meta Eligible Lead Selection");
includes(docsPath, "não envia evento para Meta");
includes(docsPath, "origem Meta");

includes(packagePath, '"evolution:phase-164:check"');

if (!process.exitCode) {
  console.log("✅ Fase 164 validada: seleção segura de lead Meta implementada sem disparo real.");
}
