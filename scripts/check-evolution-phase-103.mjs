import { readFileSync } from "node:fs";

const checks = [];

function read(path) {
  return readFileSync(path, "utf8");
}

function assert(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}

const dashboard = read("app/(crm)/dashboard/page.tsx");
const css = read("app/globals.css");
const program = JSON.parse(read("config/evolution-program-3000.json"));
const config = JSON.parse(read("config/evolution-phase-103-command-center-decision-layer.json"));
const docs = read("docs/EVOLUTION_PHASE_103_COMMAND_CENTER_DECISION_LAYER.md");
const packageJson = JSON.parse(read("package.json"));

assert("programa está na fase 103", program.currentPhase === 103);
assert("configuração da fase 103 existe", config.phase === 103 && config.status === "implemented");
assert("script npm da fase 103 foi registrado", packageJson.scripts["evolution:phase-103:check"] === "node scripts/check-evolution-phase-103.mjs");
assert("Command Center possui camada de decisão da fase 103", dashboard.includes('data-phase="103-command-center-decision-layer"'));
assert("Command Center calcula prioridade por ações atrasadas", dashboard.includes("metrics.overdue > 0"));
assert("Command Center calcula prioridade por leads sem responsável", dashboard.includes("metrics.unassigned > 0"));
assert("Command Center calcula prioridade por leads quentes", dashboard.includes("metrics.hot > 0"));
assert("Command Center expõe plano com IA sem executar ação automática", dashboard.includes("Pedir plano à IA") && dashboard.includes("openCopilot("));
assert("CSS possui estrutura visual da camada de decisão", css.includes(".atlas-command-decision-layer"));
assert("CSS possui estados visuais por tom", css.includes('[data-tone="danger"]') && css.includes('[data-tone="success"]'));
assert("CSS possui responsividade mobile da camada de decisão", css.includes("@media (max-width: 640px)") && css.includes(".atlas-command-decision-actions a"));
assert("documentação explica impacto operacional", docs.includes("Impacto operacional") && docs.includes("proteger conversão"));

const failed = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? "✓" : "✗"} ${check.name}`);
}

if (failed.length) {
  console.error(`\nFase 103 incompleta: ${failed.length} falha(s).`);
  process.exit(1);
}

console.log("\nFase 103 validada: Command Center decision layer implementado.");
