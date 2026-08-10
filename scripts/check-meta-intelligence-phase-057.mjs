import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const config = JSON.parse(readFileSync("config/meta-commercial-signal-contract.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-commercial-signal-contract.mjs", "utf8");
const doc = readFileSync("docs/META_COMMERCIAL_SIGNALS_PHASE_57.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(config.status === "prepared_no_external_dispatch" && config.guardrails.dispatchEnabled === false, "envio externo foi habilitado");
expect(config.signals.length === 6 && config.signals.some((signal) => signal.name === "sale_confirmed" && signal.humanConfirmationRequired), "sinais comerciais incompletos");
for (const marker of ["validateCommercialSignalContract", "requiresConsent", "requiresServerSideHashing", "requiresIdempotencyKey", "revenue_signal_governance_invalid", "allowsClientSecrets", "commercial_signal_contract_valid_dispatch_still_blocked"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["envio permanece desligado", "consentimento", "não guarda segredos", "não promete otimização automática"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-commercial-signal-contract.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste dos sinais reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 57: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 57: aprovada — sinais comerciais preparados para medir conversão real, sem chamada externa.");
