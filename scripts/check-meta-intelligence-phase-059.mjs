import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const template = JSON.parse(readFileSync("config/fixtures/meta-commercial-outbox-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-commercial-outbox.mjs", "utf8");
const doc = readFileSync("docs/META_COMMERCIAL_OUTBOX_PHASE_59.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "empty_dispatch_disabled" && template.events.length === 0, "fila template nao esta vazia");
expect(template.dispatch.enabled === false && template.dispatch.automaticRetry === false && template.dispatch.provider === null, "envio ou retry liberado");
for (const marker of ["validateCommercialOutbox", "validateCommercialEventEnvelope", "idempotency_key_reused", "external_dispatch_must_remain_disabled", "automaticRetry", "commercial_outbox_valid_dispatch_still_disabled"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["não chama Meta", "não publica eventos", "não executa build", "não cria ZIP", "Segredos e dados pessoais são proibidos"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-commercial-outbox.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste da fila reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 59: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 59: aprovada — outbox valida eventos e impede envio, retry automatico e duplicidade.");
