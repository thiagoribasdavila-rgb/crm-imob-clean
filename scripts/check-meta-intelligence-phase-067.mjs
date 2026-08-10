import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const template = JSON.parse(readFileSync("config/fixtures/meta-external-test-command-permit-template.json", "utf8"));
const code = readFileSync("scripts/preflight-meta-external-test-command-permit.mjs", "utf8");
const doc = readFileSync("docs/META_EXTERNAL_TEST_COMMAND_PERMIT_PHASE_67.md", "utf8");
const failures = [];
const expect = (value, label) => { if (!value) failures.push(label); };
expect(template.status === "not_permitted" && template.permit.issued === false && template.execution.commandExecuted === false, "template inicia permitido ou executado");
expect(template.environment === "staging" && template.scope === "single_test_event", "template excede escopo");
for (const marker of ["validateExternalTestCommandPermit", "staging_single_event_scope_required", "permit_state_invalid", "execution_must_remain_blocked_until_command_invocation", "external_test_command_permit_valid_command_not_executed", "selfTestExternalTestCommandPermit"]) expect(code.includes(marker), `controle ausente: ${marker}`);
for (const marker of ["não executa o comando", "Produção, retry, promoção automática", "envio em massa", "uso único"]) expect(doc.includes(marker), `documentacao ausente: ${marker}`);
const test = spawnSync(process.execPath, ["scripts/preflight-meta-external-test-command-permit.mjs", "--self-test"], { encoding: "utf8" });
expect(test.status === 0, "autoteste da permissao reprovado");
if (failures.length) { console.error("META INTELLIGENCE Fase 67: REPROVADA"); failures.forEach((item) => console.error(`- ${item}`)); process.exit(1); }
console.log("META INTELLIGENCE Fase 67: aprovada — permissao unitária vinculada e expirada preparada, sem executar chamada externa.");
