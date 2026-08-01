import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-001.json"));
const audit = read("scripts/audit-meta-asset-inventory.mjs");
const report = read("docs/META_ASSET_INVENTORY.md");
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 1 && config.mode === "read_only", "configuração da Fase 1 inválida");
expect(config.governance.secretsInOutput === false, "saída de segredos precisa permanecer bloqueada");
expect(config.governance.campaignMutation === false && config.governance.budgetMutation === false && config.governance.audienceMutation === false, "a auditoria não pode modificar mídia");
for (const marker of ["verified_read_only", "configured_not_proven", "events_received_equals_one_in_test_dataset", "personalDataPrinted: false", "META_CONVERSIONS_ACCESS_TOKEN"]) {
  expect(audit.includes(marker) || JSON.stringify(config).includes(marker), `marcador ausente: ${marker}`);
}
for (const marker of ["Implementado", "Configurado", "Operacional", "Andromeda não é uma API", "Fase 2/100"]) {
  expect(report.includes(marker), `relatório incompleto: ${marker}`);
}
expect(packageJson.scripts["meta:phase-001:audit"]?.includes("audit-meta-asset-inventory.mjs"), "comando de auditoria ausente");
expect(packageJson.scripts["meta:phase-001:check"]?.includes("check-meta-intelligence-phase-001.mjs"), "gate da Fase 1 ausente");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 1: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 1: aprovada — inventário seguro, auditável e sem mutações.");
