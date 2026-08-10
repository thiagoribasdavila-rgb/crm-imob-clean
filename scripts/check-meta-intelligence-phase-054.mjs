import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const template = JSON.parse(readFileSync("config/fixtures/atlas-readiness-audit-ledger-template.json", "utf8"));
const code = readFileSync("scripts/preflight-atlas-readiness-audit-ledger.mjs", "utf8");
const doc = readFileSync("docs/READINESS_AUDIT_LEDGER_PHASE_54.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };

expect(template.status === "empty" && template.entries.length === 0, "ledger template iniciado com aprovacao");
expect(Object.values(template.execution).every((value) => value === false), "execucao liberada no ledger");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes sensiveis incompletas");
for (const marker of ["validateReadinessAuditLedger", "evidence_fingerprint_reused", "hash_chain_broken", "entry_hash_invalid", "isolated_staging_required", "execution_must_remain_blocked", "selfTestReadinessAuditLedger"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["não executa build", "não cria ZIP", "não publica", "segredos"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-atlas-readiness-audit-ledger.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste do ledger reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 54: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 54: aprovada — trilha de prontidao encadeada, anti-reuso e anti-alteracao preparada; execucao segue bloqueada.");
