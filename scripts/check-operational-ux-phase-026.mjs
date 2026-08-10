import { existsSync, readFileSync } from "node:fs";

const required = [
  "config/operational-ux-phase-026-project-material-finder.json",
  "app/(crm)/developments/materials/page.tsx",
  "app/api/v1/developments/materials/route.ts",
  "tests/contracts/project-material-finder.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_026_PROJECT_MATERIAL_FINDER.md",
];

let failed = false;
for (const file of required) {
  const ok = existsSync(file);
  console.log(`${ok ? "PASS" : "FAIL"}: ${file}`);
  failed ||= !ok;
}

const config = JSON.parse(readFileSync(required[0], "utf8"));
const page = readFileSync(required[1], "utf8");
const api = readFileSync(required[2], "utf8");
const checks = [
  ["fase 26", config.phase === 26],
  ["quatro dimensões", config.searchDimensions?.length === 4],
  [
    "busca decisiva visível",
    page.includes('data-ux-phase="26-project-material-finder"'),
  ],
  [
    "região e tipologia filtráveis",
    page.includes("Todas as regiões") && page.includes("Todas as tipologias"),
  ],
  [
    "cadastro canônico reutilizado",
    api.includes("neighborhood") &&
      api.includes("product_type") &&
      api.includes("typologies"),
  ],
  [
    "governança preservada",
    api.includes("requireAccessContext") &&
      api.includes("materials.portfolio.read"),
  ],
  [
    "sem mutação de infraestrutura",
    config.infrastructureMutation === false && config.releaseMutation === false,
  ],
];

for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  failed ||= !ok;
}

if (failed) process.exit(1);
console.log(
  "\nFase 26 aprovada: projeto e material vigente são encontrados com menos navegação.",
);
