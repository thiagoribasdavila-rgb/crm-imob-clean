import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-insight-disclosure-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-insight-disclosure.mjs", "utf8");
const doc = readFileSync("docs/META_INSIGHT_DISCLOSURE_PHASE_81.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_prepared" && template.display.actionMode === "view_only", "template permite acao automatica");
expect(Object.values(template.forbidden).every((value) => value === true), "protecoes de transparencia incompletas");
for (const marker of ["validateMetaInsightDisclosure", "transparency_fields_invalid", "weak_or_invalid_insight_must_be_view_only", "action_or_external_change_observed", "meta_insight_disclosure_valid_transparent_view_only", "selfTestMetaInsightDisclosure"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["classe, confiança, qualidade da evidência, validade", "Evidência fraca, conflitante, expirada ou revogada", "não executa ações", "dados de clientes"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-insight-disclosure.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste de transparencia reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 81: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 81: aprovada — insights transparentes, sem acao automatica e com revisao humana.");
