import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { evaluateLeadRoundtripControlledPermit } from "./preflight-lead-roundtrip-controlled-permit.mjs";

const root = process.cwd();
const read = (file) => readFileSync(`${root}/${file}`, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const required = [
  "config/fixtures/lead-roundtrip-controlled-permit-template.json",
  "config/fixtures/lead-roundtrip-controlled-evidence-template.json",
  "docs/LEAD_ROUNDTRIP_CONTROLLED_PERMIT_STAGE_3.md",
  "scripts/preflight-lead-roundtrip-controlled-permit.mjs"
];
for (const file of required) expect(existsSync(`${root}/${file}`), `arquivo ausente: ${file}`);

if (!failures.length) {
  const permit = JSON.parse(read("config/fixtures/lead-roundtrip-controlled-permit-template.json"));
  const evidence = JSON.parse(read("config/fixtures/lead-roundtrip-controlled-evidence-template.json"));
  const result = evaluateLeadRoundtripControlledPermit(permit);
  const report = read("docs/LEAD_ROUNDTRIP_CONTROLLED_PERMIT_STAGE_3.md");
  expect(result.valid === true && result.executionAllowed === false && result.missingGates.length === 11, "template deveria permanecer bloqueado por onze gates");
  expect(Object.values(evidence.receipts).every((value) => value === null), "comprovante preenchido sem execucao");
  expect(Object.values(evidence.assertions).every((value) => value === false), "assercoes reais alegadas sem execucao");
  expect(evidence.decision.productionAllowed === false && evidence.decision.zipAllowed === false, "release liberado indevidamente");
  for (const marker of ["Etapa 3", "11 gates", "autorização humana explícita", "tenant exclusivo", "rollback", "não executa nenhuma escrita", "Nenhum banco, ambiente Hostinger, campanha ou conta Meta foi alterado"]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);
}

for (const command of [
  ["scripts/preflight-lead-roundtrip-controlled-permit.mjs", "--self-test"],
  ["scripts/check-lead-roundtrip-local-rehearsal.mjs"],
  ["scripts/check-secret-governance.mjs"]
]) {
  const child = spawnSync(process.execPath, command, { cwd: root, encoding: "utf8", env: process.env });
  if (child.status !== 0) failures.push(`${command[0]}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1200)}`);
}

if (failures.length) {
  console.error("HOMOLOGAÇÃO LEAD ROUNDTRIP Etapa 3: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("HOMOLOGAÇÃO LEAD ROUNDTRIP Etapa 3: aprovada — autorização e comprovantes preparados; execução continua bloqueada pelos 11 gates humanos e operacionais.");
