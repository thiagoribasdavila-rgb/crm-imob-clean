/**
 * Teste adversarial do módulo PURO de propostas de campanha Meta.
 *
 * Standalone, sem framework: executa o CÓDIGO REAL de
 * lib/marketing/campaign-proposals.ts (strip de tipos nativo do Node — o módulo
 * só tem `import type`, apagado no strip) e valida:
 * shape EXATO da linha approval_requests, payload { kind, plan, projection,
 * governance }, governança determinística, expiração default de 72h e custom,
 * e validateProposal por kind (create exige plan não vazio; activate exige
 * objectId; verba positiva; kind inválido).
 *
 * Rodar da raiz do repo: node scripts/check-campaign-proposals.mjs (Node >= 22.13)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "lib", "marketing", "campaign-proposals.ts");
const stripped = stripTypeScriptTypes(fs.readFileSync(sourcePath, "utf8"));
const mod = await import(`data:text/javascript;base64,${Buffer.from(stripped, "utf8").toString("base64")}`);
const {
  buildCampaignProposal,
  validateProposal,
  CAMPAIGN_PROPOSAL_REQUEST_TYPE,
  CAMPAIGN_PROPOSAL_ENTITY_TYPE,
  CAMPAIGN_PROPOSAL_VERSION,
  DEFAULT_EXPIRES_IN_HOURS,
} = mod;

const failures = [];
let passed = 0;
function check(name, condition, extra = "") {
  if (condition) passed += 1;
  else failures.push(`${name}${extra ? ` — ${extra}` : ""}`);
}

const NOW = new Date("2026-07-19T12:00:00.000Z");

function publishInput(over = {}) {
  return {
    organizationId: "org-1",
    requestedBy: "user-1",
    kind: "create",
    title: "Campanha lançamento",
    payload: {
      accountId: "act_123",
      steps: [{ kind: "create_campaign", path: "act_123/campaigns", payload: { status: "PAUSED", special_ad_categories: ["HOUSING"] } }],
      pageId: "999",
      leadFormId: "888",
    },
    ...over,
  };
}

function controlInput(kind, over = {}) {
  return {
    organizationId: "org-1",
    requestedBy: "user-1",
    kind,
    title: `Controle ${kind}`,
    payload: { objectType: "campaign", objectId: "120210000000000", ...(over.payload ?? {}) },
    ...over,
  };
}

// --------------------------------------------------------------------------
// 1) Shape EXATO da linha approval_requests
// --------------------------------------------------------------------------
const row = buildCampaignProposal(publishInput(), NOW);
const rowKeys = Object.keys(row).sort();
check(
  "linha tem exatamente as colunas de approval_requests",
  JSON.stringify(rowKeys) ===
    JSON.stringify(["entity_id", "entity_type", "expires_at", "organization_id", "payload", "request_type", "requested_by", "status"]),
  rowKeys.join(","),
);
check("request_type = meta_campaign", row.request_type === CAMPAIGN_PROPOSAL_REQUEST_TYPE && row.request_type === "meta_campaign");
check("entity_type = meta_campaign", row.entity_type === CAMPAIGN_PROPOSAL_ENTITY_TYPE && row.entity_type === "meta_campaign");
check("entity_id é null (sem entidade CRM)", row.entity_id === null);
check("status nasce pending", row.status === "pending");
check("organization_id propagado", row.organization_id === "org-1");
check("requested_by propagado", row.requested_by === "user-1");

// --------------------------------------------------------------------------
// 2) payload { version, kind, title, plan, projection, governance }
// --------------------------------------------------------------------------
check("payload contém kind/plan/projection/governance", ["kind", "plan", "projection", "governance"].every((k) => k in row.payload));
check("payload.version registrado", row.payload.version === CAMPAIGN_PROPOSAL_VERSION);
check("payload.kind espelha input", row.payload.kind === "create");
check("payload.title espelha input", row.payload.title === "Campanha lançamento");
check("payload.plan é o input.payload (passthrough)", row.payload.plan.accountId === "act_123" && row.payload.plan.steps.length === 1);
check("payload.projection null quando omitido", row.payload.projection === null);
check("governance.requiresApproval true", row.payload.governance.requiresApproval === true);
check("governance.source determinístico", row.payload.governance.source === "deterministic");
check("governance.note não vazio", typeof row.payload.governance.note === "string" && row.payload.governance.note.length > 0);

// --------------------------------------------------------------------------
// 3) Expiração — default 72h e custom
// --------------------------------------------------------------------------
check("expiração default = 72h a partir de now", row.expires_at === new Date(NOW.getTime() + DEFAULT_EXPIRES_IN_HOURS * 3_600_000).toISOString());
check("DEFAULT_EXPIRES_IN_HOURS = 72", DEFAULT_EXPIRES_IN_HOURS === 72);
const rowCustom = buildCampaignProposal(publishInput({ expiresInHours: 24 }), NOW);
check("expiração custom respeitada", rowCustom.expires_at === new Date(NOW.getTime() + 24 * 3_600_000).toISOString());
const rowZero = buildCampaignProposal(publishInput({ expiresInHours: 0 }), NOW);
check("expiresInHours 0 cai no default", rowZero.expires_at === row.expires_at);
const rowNeg = buildCampaignProposal(publishInput({ expiresInHours: -5 }), NOW);
check("expiresInHours negativo cai no default", rowNeg.expires_at === row.expires_at);

// --------------------------------------------------------------------------
// 4) projection preservada quando fornecida
// --------------------------------------------------------------------------
const proj = { moveKind: "aumentar_verba", target: "MCMV", weeklySpendDelta: 100, weeklyLeadsDelta: { pessimista: 1, esperado: 2, otimista: 3 }, confidence: "media", assumptions: [], horizon: "1 semana" };
const rowProj = buildCampaignProposal(publishInput({ projection: proj }), NOW);
check("payload.projection preservada", rowProj.payload.projection && rowProj.payload.projection.target === "MCMV");

// --------------------------------------------------------------------------
// 5) validateProposal — create
// --------------------------------------------------------------------------
check("create válido não tem problemas", validateProposal(publishInput()).length === 0);
check("create com steps vazio é recusado", validateProposal(publishInput({ payload: { accountId: "act_1", steps: [] } })).some((p) => /vazio/i.test(p)));
check("create sem accountId é recusado", validateProposal(publishInput({ payload: { steps: [{ kind: "create_campaign", path: "x", payload: {} }] } })).some((p) => /accountId/i.test(p)));
check("create com passo de controle (sem steps) é recusado", validateProposal(publishInput({ payload: { objectType: "campaign", objectId: "120210000000000" } })).some((p) => /passo de controle/i.test(p)));

// --------------------------------------------------------------------------
// 6) validateProposal — controle (pause/activate/set_daily_budget)
// --------------------------------------------------------------------------
check("activate com objectId válido passa", validateProposal(controlInput("activate")).length === 0);
check("activate sem objectId é recusado", validateProposal(controlInput("activate", { payload: { objectType: "campaign", objectId: "" } })).some((p) => /objectId/i.test(p)));
check("pause com objectId não numérico é recusado", validateProposal(controlInput("pause", { payload: { objectType: "campaign", objectId: "abc" } })).some((p) => /objectId/i.test(p)));
check("set_daily_budget exige verba positiva", validateProposal(controlInput("set_daily_budget", { payload: { objectType: "campaign", objectId: "120210000000000", dailyBudgetBrl: 0 } })).some((p) => /positivo/i.test(p)));
check("set_daily_budget verba negativa recusada", validateProposal(controlInput("set_daily_budget", { payload: { objectType: "campaign", objectId: "120210000000000", dailyBudgetBrl: -10 } })).some((p) => /positivo/i.test(p)));
check("set_daily_budget válido passa", validateProposal(controlInput("set_daily_budget", { payload: { objectType: "campaign", objectId: "120210000000000", dailyBudgetBrl: 50 } })).length === 0);
check("controle recebendo plano de publicação é recusado", validateProposal(controlInput("pause", { payload: { accountId: "act_1", steps: [{ kind: "create_campaign", path: "x", payload: {} }] } })).some((p) => /plano de publicação/i.test(p)));

// --------------------------------------------------------------------------
// 7) validateProposal — campos base e kind inválido
// --------------------------------------------------------------------------
check("kind inválido é recusado", validateProposal(publishInput({ kind: "delete" })).some((p) => /kind/i.test(p)));
check("organizationId ausente é recusado", validateProposal(publishInput({ organizationId: "" })).some((p) => /organizationId/i.test(p)));
check("requestedBy ausente é recusado", validateProposal(publishInput({ requestedBy: "" })).some((p) => /requestedBy/i.test(p)));
check("title ausente é recusado", validateProposal(publishInput({ title: "  " })).some((p) => /title/i.test(p)));
check("expiresInHours inválido é recusado", validateProposal(publishInput({ expiresInHours: -1 })).some((p) => /expiresInHours/i.test(p)));

// --------------------------------------------------------------------------
// 8) build é puro — não valida, não lança mesmo com input "ruim"
// --------------------------------------------------------------------------
let threw = false;
try { buildCampaignProposal(publishInput({ payload: { accountId: "", steps: [] } }), NOW); } catch { threw = true; }
check("build não lança com plano vazio (validação é separada)", threw === false);

// --------------------------------------------------------------------------
console.log(`\ncampaign-proposals: ${passed} verificações passaram, ${failures.length} falharam.`);
if (failures.length) {
  console.error("\nFALHAS:");
  for (const f of failures) console.error(` ✗ ${f}`);
  process.exit(1);
}
console.log("✓ módulo de propostas de campanha aprovado.");
