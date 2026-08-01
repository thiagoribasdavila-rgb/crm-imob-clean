import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-002.json"));
const audit = read("scripts/audit-meta-permissions-and-destinations.mjs");
const report = read("docs/META_PERMISSIONS_AND_DESTINATIONS.md");
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 2 && config.mode === "read_only", "configuracao da Fase 2 invalida");
expect(config.governance.secretsInOutput === false, "segredos devem permanecer bloqueados");
expect(config.governance.assetIdentifiersInOutput === false, "identificadores de ativos nao podem aparecer");
expect(config.governance.databaseMutation === false && config.governance.migrationApplication === false, "a fase nao pode alterar banco");
expect(config.governance.campaignMutation === false && config.governance.budgetMutation === false && config.governance.audienceMutation === false, "a fase nao pode modificar midia");

for (const permission of ["ads_read", "leads_retrieval", "pages_show_list", "pages_read_engagement", "pages_manage_metadata"]) {
  expect(audit.includes(permission) && JSON.stringify(config).includes(permission), `permissao sem contrato: ${permission}`);
}
for (const destination of config.dataDestinations) {
  expect(audit.includes(destination), `destino nao auditado: ${destination}`);
}
for (const marker of ["Configured is not operational proof", "identifiersPrinted: false", "runtime_schema_not_ready", "asset_accessible", "destination_ready"]) {
  expect(audit.includes(marker), `marcador de auditoria ausente: ${marker}`);
}
for (const marker of ["33 de 123", "PGRST205", "Andromeda não é uma API", "Fase 3/100", "backup", "RLS"]) {
  expect(report.includes(marker), `relatorio incompleto: ${marker}`);
}
expect(packageJson.scripts["meta:phase-002:audit"]?.includes("audit-meta-permissions-and-destinations.mjs"), "comando de auditoria ausente");
expect(packageJson.scripts["meta:phase-002:check"]?.includes("check-meta-intelligence-phase-002.mjs"), "gate da Fase 2 ausente");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 2: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 2: aprovada — permissoes, propriedade e destinos auditados sem mutacoes.");
