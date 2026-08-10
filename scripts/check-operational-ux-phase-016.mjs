import { existsSync, readFileSync } from "node:fs";

const required = [
  "config/operational-ux-phase-016-progressive-disclosure.json",
  "components/atlas/page-header.tsx",
  "components/atlas/information-primitives.tsx",
  "components/ui/AtlasUI.tsx",
  "tests/contracts/progressive-disclosure.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_016_PROGRESSIVE_DISCLOSURE.md"
];

let failed = false;
for (const file of required) {
  const ok = existsSync(file);
  console.log(`${ok ? "PASS" : "FAIL"}: ${file}`);
  failed ||= !ok;
}

const config = JSON.parse(readFileSync(required[0], "utf8"));
const checks = [
  ["fase 16", config.phase === 16],
  ["três níveis", Object.keys(config.informationLayers).length === 3],
  ["decisão protegida", config.protectedVisibleContent.includes("decision")],
  ["ação protegida", config.protectedVisibleContent.includes("primary-action")],
  ["sem mutação operacional", config.infrastructureMutation === false && config.releaseMutation === false]
];
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  failed ||= !ok;
}

if (failed) process.exit(1);
console.log("\nFase 16 aprovada: decisão imediata, contexto sob demanda e diagnóstico seguro.");
