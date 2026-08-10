import { existsSync, readFileSync } from "node:fs";

const required = [
  "config/operational-ux-phase-025-minimum-advance-readiness.json",
  "app/(crm)/leads/[id]/page.tsx",
  "tests/contracts/minimum-advance-readiness.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_025_MINIMUM_ADVANCE_READINESS.md",
];

let failed = false;
for (const file of required) {
  const ok = existsSync(file);
  console.log(`${ok ? "PASS" : "FAIL"}: ${file}`);
  failed ||= !ok;
}

const config = JSON.parse(readFileSync(required[0], "utf8"));
const page = readFileSync(required[1], "utf8");
const checks = [
  ["fase 25", config.phase === 25],
  ["seis requisitos explícitos", config.requirements?.length === 6],
  ["prontidão visível", page.includes('data-ux-phase="25-minimum-advance-readiness"')],
  ["primeira lacuna acionável", page.includes("minimumAdvanceReadiness.nextMissing") && page.includes("recoverAdvanceRequirement")],
  ["sem bloqueio automático", page.includes("Orientação operacional, não bloqueio automático")],
  ["sem mutação operacional", config.infrastructureMutation === false && config.releaseMutation === false],
];

for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  failed ||= !ok;
}

if (failed) process.exit(1);
console.log("\nFase 25 aprovada: o corretor sabe o que falta antes de avançar a venda.");
