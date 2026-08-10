import { existsSync, readFileSync } from "node:fs";

const required = [
  "config/operational-ux-phase-018-role-metric-hierarchy.json",
  "components/atlas/information-primitives.tsx",
  "app/(crm)/dashboard/page.tsx",
  "tests/contracts/role-metric-hierarchy.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_018_ROLE_METRIC_HIERARCHY.md"
];

let failed = false;
for (const file of required) {
  const ok = existsSync(file);
  console.log(`${ok ? "PASS" : "FAIL"}: ${file}`);
  failed ||= !ok;
}

const config = JSON.parse(readFileSync(required[0], "utf8"));
const checks = [
  ["fase 18", config.phase === 18],
  ["quatro papéis cobertos", Object.keys(config.roles).length === 4],
  ["cinco métricas por papel", Object.values(config.roles).every((role) => role.primary.length === 5)],
  ["indicador complementar preservado", Object.values(config.roles).every((role) => Boolean(role.supporting))],
  ["sem mutação operacional", config.infrastructureMutation === false && config.releaseMutation === false]
];
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  failed ||= !ok;
}

if (failed) process.exit(1);
console.log("\nFase 18 aprovada: hierarquia decisória aplicada às quatro visões por cargo.");
