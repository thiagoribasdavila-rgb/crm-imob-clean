import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-003.json"));
const audit = read("scripts/audit-meta-event-contract.mjs");
const report = read("docs/META_CRM_EVENT_CONTRACT.md");
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

expect(config.phase === 3 && config.mode === "audit_only", "configuracao da Fase 3 invalida");
expect(config.contractVersion === "atlas-meta-crm-v1", "contrato sem versao");
expect(config.canonicalEvents.length === 7, "catalogo canonico incompleto");
for (const eventName of ["Lead", "Contact", "QualifiedLead", "Schedule", "SubmitApplication", "ConvertedLead", "BuyerProfile"]) {
  const event = config.canonicalEvents.find((item) => item.eventName === eventName);
  expect(Boolean(event?.sourceOfTruth && event?.eventIdTemplate && event?.minimumEvidence?.length), `evento sem origem ou evidencia: ${eventName}`);
}
expect(audit.includes("config.canonicalEvents.map") && audit.includes("everyEventMapped"), "catalogo canonico nao e auditado dinamicamente");
expect(config.deduplication.scope.join(",") === "organization_id,event_id", "escopo de deduplicacao invalido");
expect(config.delivery.productionDeliveryEnabled === false, "producao deve permanecer bloqueada");
expect(config.governance.realEventDelivery === false && config.governance.databaseMutation === false, "fase nao pode enviar evento nem alterar banco");
for (const marker of ["unique (organization_id, event_id)", "source_evidence_not_persisted", "runtime_schema_not_ready", "safeForSingleTestEvent", "identifiersPrinted: false"]) {
  expect(audit.includes(marker), `marcador de auditoria ausente: ${marker}`);
}
for (const marker of ["Fase 3/100", "evento canônico", "um sinal por lead e marco", "source_event_id", "PGRST205", "Fase 4/100"]) {
  expect(report.includes(marker), `relatorio incompleto: ${marker}`);
}
expect(packageJson.scripts["meta:phase-003:audit"]?.includes("audit-meta-event-contract.mjs"), "comando de auditoria ausente");
expect(packageJson.scripts["meta:phase-003:check"]?.includes("check-meta-intelligence-phase-003.mjs"), "gate da Fase 3 ausente");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 3: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("META INTELLIGENCE Fase 3: aprovada — contrato CRM, deduplicacao e bloqueios documentados sem envio real.");
