import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const template = JSON.parse(readFileSync("config/fixtures/atlas-release-evidence-manifest-template.json", "utf8"));
const code = readFileSync("scripts/preflight-atlas-release-evidence-manifest.mjs", "utf8");
const doc = readFileSync("docs/RELEASE_EVIDENCE_MANIFEST_PHASE_56.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "pending" && Object.values(template.requiredChecks).every((value) => value === false), "manifesto iniciou aprovado");
expect(Object.values(template.execution).every((value) => value === false), "execucao liberada no manifesto");
for (const marker of ["validateReleaseEvidenceManifest", "release_audit_binding_invalid", "evidence_fingerprint_chain_mismatch", "ledger_hash_chain_mismatch", "required_check_missing", "execution_must_remain_blocked_until_release_command", "selfTestReleaseEvidenceManifest"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["não executa build", "não cria ZIP", "não publica", "sete controles"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-atlas-release-evidence-manifest.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste do manifesto reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 56: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 56: aprovada — manifesto completo exige cadeia auditavel e sete evidencias, sem liberar execucao.");
