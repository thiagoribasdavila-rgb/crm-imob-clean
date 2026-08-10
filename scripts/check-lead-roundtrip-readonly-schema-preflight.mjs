import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const read = (file) => readFileSync(`${root}/${file}`, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const files = [
  "config/contracts/lead-roundtrip-runtime-schema-contract.json",
  "scripts/sql/lead-roundtrip-readonly-schema-preflight.sql",
  "scripts/evaluate-lead-roundtrip-schema-snapshot.mjs",
  "docs/LEAD_ROUNDTRIP_READONLY_SCHEMA_PREFLIGHT_STAGE_6.md"
];
for (const file of files) expect(existsSync(`${root}/${file}`), `arquivo ausente: ${file}`);

if (!failures.length) {
  const contract = JSON.parse(read(files[0]));
  const sql = read(files[1]).trim().toLowerCase();
  const evaluator = read(files[2]);
  const report = read(files[3]);
  expect(contract.security.catalogOnly === true && contract.security.readsBusinessRows === false && contract.security.writesDatabase === false, "contrato permite leitura comercial ou escrita");
  expect(contract.objects.length === 8, "contrato mínimo deve declarar oito objetos obrigatórios");
  expect(sql.startsWith("with ") && sql.endsWith(";"), "SQL não é uma única consulta catalog-only");
  expect((sql.match(/;/g) ?? []).length === 1, "SQL contém mais de uma instrução");
  expect(sql.includes("pg_class") && sql.includes("pg_attribute") && sql.includes("pg_policies"), "SQL não cobre objetos, colunas, RLS e políticas");
  expect(!/\b(?:insert|update|delete|alter|drop|create|truncate|grant|revoke|call|copy)\s+/.test(sql), "SQL contém comando mutável");
  expect(!/(?:auth\.users|from\s+public\.(?:leads|profiles|customers)|join\s+public\.(?:leads|profiles|customers)|select\s+\*|\b(?:email|phone|cpf)\b)/.test(sql), "SQL pode consultar linhas ou dados pessoais");
  for (const forbidden of ["createClient(", "fetch(", "DATABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "child_process"]) expect(!evaluator.includes(forbidden), `avaliador contém acesso operacional: ${forbidden}`);
  for (const marker of ["Etapa 6", "somente leitura", "catálogo", "não consulta leads", "RLS", "não aplica migration", "Nenhum banco, ambiente Hostinger, campanha ou conta Meta foi alterado"]) expect(report.includes(marker), `documentação incompleta: ${marker}`);
}

for (const command of [
  ["scripts/evaluate-lead-roundtrip-schema-snapshot.mjs", "--self-test"],
  ["scripts/check-lead-roundtrip-safe-env-bootstrap.mjs"],
  ["scripts/check-secret-governance.mjs"]
]) {
  const child = spawnSync(process.execPath, command, { cwd: root, encoding: "utf8", env: process.env });
  if (child.status !== 0) failures.push(`${command[0]}: ${(child.stderr || child.stdout || "falha").trim().slice(0, 1000)}`);
}

if (failures.length) {
  console.error("HOMOLOGAÇÃO LEAD ROUNDTRIP Etapa 6: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("HOMOLOGAÇÃO LEAD ROUNDTRIP Etapa 6: aprovada — contrato e preflight catalog-only prontos; nenhuma conexão, linha comercial, migration ou escrita foi executada.");
