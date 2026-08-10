import { existsSync, readFileSync } from "node:fs";

const required = [
  "config/operational-ux-phase-027-commercial-truth-first.json",
  "app/(crm)/developments/materials/page.tsx",
  "app/api/v1/developments/materials/route.ts",
  "tests/contracts/commercial-truth-first.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_027_COMMERCIAL_TRUTH_FIRST.md",
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
  ["fase 27", config.phase === 27],
  [
    "verdade comercial primeiro",
    page.includes('data-ux-phase="27-commercial-truth-first"'),
  ],
  [
    "três respostas visíveis",
    ["Estoque disponível", "Preço de entrada", "Material vigente"].every(
      (label) => page.includes(label),
    ),
  ],
  [
    "estoque canônico",
    api.includes('from("properties")') &&
      api.includes("development_id,status,price"),
  ],
  ["isolamento preservado", api.includes('.eq("organization_id", org)')],
  [
    "sem preço fictício",
    page.includes('"A confirmar"') &&
      config.zeroPricePolicy === "never-present-zero-as-valid-price",
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
  "\nFase 27 aprovada: estoque, preço e material vigente precedem análises secundárias.",
);
