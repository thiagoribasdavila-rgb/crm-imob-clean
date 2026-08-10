import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [
  calibration,
  homologation,
  status,
  briefing,
  copilot,
  dashboard,
  operatingSystem,
] = await Promise.all([
  read("lib/atlas/ai-calibration.ts"),
  read("app/api/v1/homologation/route.ts"),
  read("app/api/ai/status/route.ts"),
  read("app/api/ai/briefing/route.ts"),
  read("app/api/ai/copilot/route.ts"),
  read("app/(crm)/ai-dashboard/page.tsx"),
  read("lib/ai/operating-system.ts"),
]);

const checks = [
  [
    "calibracao deriva de evidencias reais",
    calibration.includes("buildAiCalibration")
      && calibration.includes("usageEvents")
      && calibration.includes("memoryRecords")
      && calibration.includes("passedHomologationChecks"),
  ],
  [
    "nenhuma precisao automatica e alegada",
    calibration.includes("accuracyClaimed: false")
      && calibration.includes('basis: "evidence_coverage"'),
  ],
  [
    "numeros historicos fixos foram removidos",
    !calibration.includes("percent: 89")
      && !calibration.includes("controls: 366")
      && !calibration.includes('verifiedAt: "2026-07-17"'),
  ],
  [
    "homologacao consulta evidencias sob organizacao",
    homologation.includes('from("ai_usage_events")')
      && homologation.includes('from("lead_commercial_memory_states")')
      && homologation.includes('from("project_materials")')
      && homologation.includes('from("ai_orchestration_decisions")')
      && homologation.includes('.eq("organization_id", organizationId)'),
  ],
  [
    "datas ficticias de calibracao foram removidas das APIs",
    !status.includes("2026-07-17")
      && !briefing.includes("2026-07-17")
      && !copilot.includes("2026-07-17"),
  ],
  [
    "painel nao promete validacao sem prova",
    !dashboard.includes("Calibração de mercado")
      && !dashboard.includes(">VALIDADA<")
      && dashboard.includes("Evidência operacional"),
  ],
  [
    "acoes externas permanecem supervisionadas",
    operatingSystem.includes("autonomousExternalActions: false")
      && operatingSystem.includes("humanApprovalRequired: true"),
  ],
];

let failures = 0;
for (const [label, passed] of checks) {
  console.log(`${passed ? "PASS" : "FAIL"} ${label}`);
  if (!passed) failures += 1;
}

console.log(`\nV3000 conversion baseline: ${checks.length - failures}/${checks.length}`);
if (failures) process.exit(1);
