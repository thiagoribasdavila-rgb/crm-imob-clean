import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const template = JSON.parse(readFileSync("config/fixtures/meta-commercial-event-envelope-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-commercial-event-envelope.mjs", "utf8");
const doc = readFileSync("docs/META_COMMERCIAL_EVENT_ENVELOPE_PHASE_58.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "template_not_dispatchable" && template.dispatch.enabled === false && template.dispatch.provider === null, "template permite envio externo");
expect(Object.values(template.forbidden).every((value) => value === true), "campos pessoais nao protegidos");
for (const marker of ["validateCommercialEventEnvelope", "consent_required", "human_confirmation_required", "revenue_value_invalid", "external_dispatch_must_remain_disabled", "sensitive_data_detected", "selfTestCommercialEventEnvelope"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["despacho externo permanece desligado", "não chama Meta", "telefone, e-mail, nome", "chave de idempotência"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-commercial-event-envelope.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste do envelope reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 58: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 58: aprovada — envelope de conversao seguro e idempotente preparado, sem despacho externo.");
