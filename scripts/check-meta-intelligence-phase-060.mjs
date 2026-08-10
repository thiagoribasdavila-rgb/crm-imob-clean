import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const template = JSON.parse(readFileSync("config/fixtures/meta-commercial-dispatch-rehearsal-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-commercial-dispatch-rehearsal.mjs", "utf8");
const doc = readFileSync("docs/META_COMMERCIAL_DISPATCH_REHEARSAL_PHASE_60.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_requested" && template.dispatch.enabled === false && template.dispatch.provider === null, "template permite despacho");
expect(template.environment === "staging" && template.testEventOnly === true && template.maxEvents === 0, "template nao esta restrito ao ensaio");
for (const marker of ["validateCommercialDispatchRehearsal", "isolated_staging_required", "test_event_only_required", "single_event_limit_required", "dispatch_must_remain_disabled_before_external_gate", "sensitive_data_detected", "selfTestCommercialDispatchRehearsal"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["não faz chamada ao Meta", "produção é proibida", "Nenhum retry", "build ou ZIP"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-commercial-dispatch-rehearsal.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste do ensaio reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 60: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 60: aprovada — ensaio unitario em staging preparado, sem chamada externa ou liberacao de producao.");
