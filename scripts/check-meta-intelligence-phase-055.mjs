import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const template = JSON.parse(readFileSync("config/fixtures/atlas-release-audit-binding-template.json", "utf8"));
const code = readFileSync("scripts/preflight-atlas-release-audit-binding.mjs", "utf8");
const doc = readFileSync("docs/RELEASE_AUDIT_BINDING_PHASE_55.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_bound" && !template.evidenceFingerprint && !template.ledgerEntryHash, "template iniciou vinculado");
expect(Object.values(template.execution).every((value) => value === false), "execucao liberada no template");
expect(Object.values(template.forbidden).every((value) => value === true), "protecao sensivel incompleta");
for (const marker of ["validateReleaseAuditBinding", "audit_ledger_invalid", "ledger_entry_not_found", "evidence_fingerprint_not_bound_to_ledger_entry", "execution_must_remain_blocked_until_all_release_gates", "selfTestReleaseAuditBinding"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["build, ZIP e publicação bloqueados", "Nenhum segredo", "não substitui os gates técnicos"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-atlas-release-audit-binding.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste do vinculo reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 55: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 55: aprovada — recibo e ledger vinculados antes do gate final; nenhuma execucao foi liberada.");
