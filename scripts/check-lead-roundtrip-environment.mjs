import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const read = (file) => readFileSync(`${root}/${file}`, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const required = [
  "config/fixtures/lead-roundtrip-environment-attestation-template.json",
  "docs/LEAD_ROUNDTRIP_ENVIRONMENT_STAGE_4.md",
  "scripts/audit-lead-roundtrip-environment.mjs",
  "scripts/check-secret-governance.mjs"
];
for (const file of required) expect(existsSync(`${root}/${file}`), `arquivo ausente: ${file}`);

if (!failures.length) {
  const template = JSON.parse(read("config/fixtures/lead-roundtrip-environment-attestation-template.json"));
  const report = read("docs/LEAD_ROUNDTRIP_ENVIRONMENT_STAGE_4.md");
  expect(Object.values(template.checks).every((value) => value === false), "atestado alegou verificacao antes da auditoria");
  expect(Object.values(template.network).every((value) => value === false), "template alegou acesso externo");
  expect(template.release.executionAllowed === false && template.release.productionAllowed === false && template.release.zipAllowed === false, "release liberado indevidamente");
  for (const marker of ["Etapa 4", "11 verificações", "sem revelar valores", "não abre conexão", "service role", "permit da Etapa 3 continua obrigatório", "Nenhum banco, ambiente Hostinger, campanha ou conta Meta foi alterado"]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);
}

for (const command of [
  ["scripts/audit-lead-roundtrip-environment.mjs", "--self-test"],
  ["scripts/check-lead-roundtrip-controlled-permit.mjs"],
  ["scripts/check-secret-governance.mjs"]
]) {
  const child = spawnSync(process.execPath, command, { cwd: root, encoding: "utf8", env: process.env });
  if (child.status !== 0) failures.push(`${command[0]}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1200)}`);
}

const audit = spawnSync(process.execPath, ["scripts/audit-lead-roundtrip-environment.mjs"], { cwd: root, encoding: "utf8", env: process.env });
if (audit.status !== 0) failures.push("auditoria local falhou");
else {
  expect(!/(?:postgres(?:ql)?:\/\/|eyJ[a-zA-Z0-9_-]{10}|sk-[a-zA-Z0-9_-]{8}|service_role.{0,20}:\s*[^f\"])/i.test(audit.stdout), "auditoria pode ter exposto credencial");
  try {
    const snapshot = JSON.parse(audit.stdout);
    expect(snapshot.totalChecks === 11 && snapshot.release.executionAllowed === false, "snapshot local invalido");
    expect(Object.values(snapshot.network).every((value) => value === false), "auditoria local tocou rede");
  } catch { failures.push("snapshot local nao e JSON seguro"); }
}

if (failures.length) {
  console.error("HOMOLOGAÇÃO LEAD ROUNDTRIP Etapa 4: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("HOMOLOGAÇÃO LEAD ROUNDTRIP Etapa 4: aprovada — auditoria estrutural segura disponível; conexão, autenticação e escritas continuam bloqueadas.");
