import { existsSync, readFileSync } from "node:fs";

const required = [
  "config/operational-ux-phase-015-compact-page-header.json",
  "components/atlas/page-header.tsx",
  "styles/atlas-tokens.css",
  "tests/contracts/compact-page-header.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_015_COMPACT_PAGE_HEADER.md"
];

let failed = false;
for (const file of required) {
  const ok = existsSync(file);
  console.log(`${ok ? "PASS" : "FAIL"}: ${file}`);
  failed ||= !ok;
}

const config = JSON.parse(readFileSync(required[0], "utf8"));
const component = readFileSync(required[1], "utf8");
const checks = [
  ["fase 15", config.phase === 15],
  ["uma ação visível", config.contract.maximumVisibleActions === 1],
  ["descrição em duas linhas", config.contract.descriptionLines === 2],
  ["densidade explícita", component.includes('data-header-density="compact"')],
  ["sem mutação operacional", config.infrastructureMutation === false && config.releaseMutation === false]
];
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  failed ||= !ok;
}

if (failed) process.exit(1);
console.log("\nFase 15 aprovada: cabeçalhos compactos, contextuais e com uma única ação visível.");
