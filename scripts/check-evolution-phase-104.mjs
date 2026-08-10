import { readFileSync } from "node:fs";

const checks = [];

function read(path) {
  return readFileSync(path, "utf8");
}

function assert(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}

const leads = read("app/(crm)/leads/page.tsx");
const css = read("app/globals.css");
const program = JSON.parse(read("config/evolution-program-3000.json"));
const config = JSON.parse(read("config/evolution-phase-104-leads-action-cockpit.json"));
const docs = read("docs/EVOLUTION_PHASE_104_LEADS_ACTION_COCKPIT.md");
const packageJson = JSON.parse(read("package.json"));

assert("programa está na fase 104", program.currentPhase === 104);
assert("configuração da fase 104 existe", config.phase === 104 && config.status === "implemented");
assert("script npm da fase 104 foi registrado", packageJson.scripts["evolution:phase-104:check"] === "node scripts/check-evolution-phase-104.mjs");
assert("Leads possui cockpit de decisão da fase 104", leads.includes('data-phase="104-leads-action-cockpit"'));
assert("Leads calcula decisão por follow-up vencido", leads.includes("pageMetrics.overdue > 0") && leads.includes('filter: "overdue"'));
assert("Leads calcula decisão por lead sem responsável", leads.includes("pageMetrics.unassigned > 0") && leads.includes('filter: "unassigned"'));
assert("Leads calcula decisão por lead quente", leads.includes("pageMetrics.hot > 0") && leads.includes('filter: "hot"'));
assert("Leads preserva decisão humana com Copilot explicável", leads.includes("Pedir orientação") && leads.includes("atlas:open-copilot"));
assert("Leads preserva ações existentes de carteira", leads.includes('data-phase="36-visible-action-queue"') && leads.includes('data-phase="54-team-transfer"'));
assert("CSS possui estrutura visual do cockpit de Leads", css.includes(".atlas-leads-decision-cockpit"));
assert("CSS possui tons operacionais do cockpit", css.includes('.atlas-leads-decision-cockpit[data-tone="danger"]') && css.includes('.atlas-leads-decision-cockpit[data-tone="success"]'));
assert("CSS possui responsividade do cockpit de Leads", css.includes(".atlas-leads-decision-grid") && css.includes(".atlas-leads-decision-actions > *"));
assert("documentação explica impacto operacional", docs.includes("Impacto operacional") && docs.includes("transformar leads em vendas"));

const failed = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? "✓" : "✗"} ${check.name}`);
}

if (failed.length) {
  console.error(`\nFase 104 incompleta: ${failed.length} falha(s).`);
  process.exit(1);
}

console.log("\nFase 104 validada: Leads action cockpit implementado.");
