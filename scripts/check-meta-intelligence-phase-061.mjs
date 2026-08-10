import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-commercial-test-event-receipt-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-commercial-test-event-receipt.mjs", "utf8");
const doc = readFileSync("docs/META_COMMERCIAL_TEST_EVENT_RECEIPT_PHASE_61.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_received" && template.payloadStored === false, "template armazena recebimento indevido");
expect(Object.values(template.dispatch).every((value) => value === false), "template libera despacho");
for (const marker of ["validateCommercialTestEventReceipt", "payload_storage_forbidden", "dispatch_guardrail_open", "providerResponseClass", "commercial_test_event_receipt_valid_promotion_still_blocked", "selfTestCommercialTestEventReceipt"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["payload e a resposta bruta", "não promove eventos para produção", "não habilita retry", "não cria ZIP"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-commercial-test-event-receipt.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste do recibo reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 61: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 61: aprovada — recibo tecnico minimo preserva evidencia sem payload e sem promocao automatica.");
