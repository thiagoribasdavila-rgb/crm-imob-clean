import { existsSync, readFileSync } from "node:fs";

const required = [
  "config/operational-ux-phase-019-sla-intake-disclosure.json",
  "components/atlas/information-primitives.tsx",
  "app/(crm)/dashboard/page.tsx",
  "tests/contracts/sla-intake-disclosure.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_019_SLA_INTAKE_DISCLOSURE.md",
];

let failed = false;
for (const file of required) {
  const ok = existsSync(file);
  console.log(`${ok ? "PASS" : "FAIL"}: ${file}`);
  failed ||= !ok;
}

const config = JSON.parse(readFileSync(required[0], "utf8"));
const dashboard = readFileSync(required[2], "utf8");
const checks = [
  ["fase 19", config.phase === 19],
  ["duas superfícies cobertas", config.canonicalSurfaces.length === 2],
  [
    "entrada detalhada sob demanda",
    dashboard.includes(
      'label="Ver histórico, distribuição e origem dos dados"',
    ),
  ],
  [
    "cinco decisões de SLA",
    dashboard.includes('label="Indicadores essenciais do SLA do time"'),
  ],
  [
    "quatro alertas urgentes visíveis",
    dashboard.includes("teamSla.alerts.slice(0, 4)"),
  ],
  [
    "evidência adicional preservada",
    dashboard.includes("teamSla.alerts.slice(4, 12)"),
  ],
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
  "\nFase 19 aprovada: SLA e entrada diária compactados com evidência preservada.",
);
