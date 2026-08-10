import { existsSync, readFileSync } from "node:fs";

const required = [
  "config/operational-ux-phase-024-essential-data-recovery.json",
  "app/(crm)/leads/[id]/page.tsx",
  "components/crm/lead-context-correction.tsx",
  "tests/contracts/essential-data-recovery.test.mjs",
  "docs/ATLAS_ONE_UX_PHASE_024_ESSENTIAL_DATA_RECOVERY.md",
];

let failed = false;
for (const file of required) {
  const ok = existsSync(file);
  console.log(`${ok ? "PASS" : "FAIL"}: ${file}`);
  failed ||= !ok;
}

const config = JSON.parse(readFileSync(required[0], "utf8"));
const page = readFileSync(required[1], "utf8");
const contextEditor = readFileSync(required[2], "utf8");
const checks = [
  ["fase 24", config.phase === 24],
  ["Lead 360 canônico", config.canonicalSurface === "lead-360"],
  ["recuperação essencial visível", page.includes('data-ux-phase="24-essential-data-recovery"')],
  ["primeira lacuna priorizada", page.includes("essentialRecoveryItems[0]")],
  ["demais lacunas compactadas", page.includes("essentialRecoveryItems.slice(1)")],
  ["projeto abre correção governada", page.includes("setContextEditorRequest") && contextEditor.includes("initiallyEditing")],
  ["perfil canônico preservado", page.includes('id="lead-commercial-profile"')],
  ["sem mutação operacional", config.infrastructureMutation === false && config.releaseMutation === false],
];

for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"}: ${label}`);
  failed ||= !ok;
}

if (failed) process.exit(1);
console.log("\nFase 24 aprovada: lacunas essenciais agora são recuperáveis no ponto de uso.");
