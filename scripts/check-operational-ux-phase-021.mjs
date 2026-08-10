import { existsSync, readFileSync } from "node:fs";

const required = [
  "config/operational-ux-phase-021-leads-lead360-density.json",
  "components/atlas/information-primitives.tsx",
  "app/(crm)/leads/page.tsx",
  "app/(crm)/leads/[id]/page.tsx",
  "tests/contracts/leads-lead360-density.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_021_LEADS_LEAD360_DENSITY.md",
];

let failed = false;
for (const file of required) {
  const ok = existsSync(file);
  console.log(`${ok ? "PASS" : "FAIL"}: ${file}`);
  failed ||= !ok;
}

const config = JSON.parse(readFileSync(required[0], "utf8"));
const leads = readFileSync(required[2], "utf8");
const lead360 = readFileSync(required[3], "utf8");
const checks = [
  ["fase 21", config.phase === 21],
  ["duas superfícies canônicas", config.canonicalSurfaces.length === 2],
  ["fila de ação preservada", leads.includes("atlas-leads-action-queue")],
  ["tabela preservada", leads.includes("atlas-leads-table-panel")],
  ["diagnóstico progressivo", leads.includes("Ver diagnóstico da carteira")],
  ["próxima ação preservada", lead360.includes("Próxima ação recomendada")],
  ["registro preservado", lead360.includes("addActivity")],
  ["cinco análises progressivas", (lead360.match(/<AtlasDetailDisclosure/g) || []).length >= 5],
  [
    "sem mutação operacional",
    config.infrastructureMutation === false && config.releaseMutation === false,
  ],
];

for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  failed ||= !ok;
}

if (failed) process.exit(1);
console.log(
  "\nFase 21 aprovada: Leads e Lead 360 orientados à ação com análises preservadas sob demanda.",
);
