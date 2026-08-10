import { existsSync, readFileSync } from "node:fs";

const required = [
  "config/operational-ux-phase-014-card-purpose-taxonomy.json",
  "components/ui/AtlasCard.tsx",
  "components/ui/AtlasUI.tsx",
  "tests/contracts/card-purpose-taxonomy.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_014_CARD_PURPOSE_TAXONOMY.md"
];

let failed = false;
for (const file of required) {
  const ok = existsSync(file);
  console.log(`${ok ? "PASS" : "FAIL"}: ${file}`);
  failed ||= !ok;
}

const config = JSON.parse(readFileSync(required[0], "utf8"));
const card = readFileSync(required[1], "utf8");
const checks = [
  ["fase 14", config.phase === 14],
  ["seis funções", Object.keys(config.purposes).length === 6],
  ["propósito explícito", card.includes("data-card-purpose={purpose}")],
  ["métrica canônica", card.includes('data-card-purpose="metric"')],
  ["sem mutação operacional", config.infrastructureMutation === false && config.releaseMutation === false]
];
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  failed ||= !ok;
}

if (failed) process.exit(1);
console.log("\nFase 14 aprovada: cada superfície declara uma função visual e operacional única.");
