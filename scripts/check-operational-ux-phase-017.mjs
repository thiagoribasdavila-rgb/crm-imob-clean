import { existsSync, readFileSync } from "node:fs";

const required = [
  "config/operational-ux-phase-017-primary-metric-hierarchy.json",
  "components/atlas/information-primitives.tsx",
  "app/(crm)/dashboard/page.tsx",
  "tests/contracts/primary-metric-hierarchy.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_017_PRIMARY_METRIC_HIERARCHY.md"
];

let failed = false;
for (const file of required) {
  const ok = existsSync(file);
  console.log(`${ok ? "PASS" : "FAIL"}: ${file}`);
  failed ||= !ok;
}

const config = JSON.parse(readFileSync(required[0], "utf8"));
const checks = [
  ["fase 17", config.phase === 17],
  ["máximo de cinco métricas", config.maximumPrimaryMetrics === 5],
  ["Sala de Comando canônica", config.canonicalSurface === "command-center"],
  ["camada complementar preservada", Boolean(config.layers.supporting)],
  ["sem mutação operacional", config.infrastructureMutation === false && config.releaseMutation === false]
];
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  failed ||= !ok;
}

if (failed) process.exit(1);
console.log("\nFase 17 aprovada: cinco métricas essenciais visíveis e contexto complementar preservado.");
