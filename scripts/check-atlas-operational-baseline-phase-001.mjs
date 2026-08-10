import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import process from "node:process";

const read = (path) => readFileSync(path, "utf8");
const config = JSON.parse(read("config/atlas-10x-phase-001-operational-baseline.json"));
const packageJson = JSON.parse(read("package.json"));
const runner = read("scripts/run-atlas-operational-baseline-phase-001.mjs");
const report = read("docs/ATLAS_10X_PHASE_001_OPERATIONAL_BASELINE.md");
const result = read("docs/ATLAS_10X_PHASE_001_RESULT.md");
const checks = [];

const expect = (condition, label) => checks.push([label, Boolean(condition)]);

expect(config.schema_version === "atlas.10x.phase-001.v1", "contrato versionado");
expect(config.phase === 1 && config.total_phases === 24, "fase vinculada ao plano 10/10");
expect(config.build_policy === "build_only_on_release_package", "build reservado ao fechamento do pacote");
expect(config.production_policy === "blocked_until_runtime_evidence", "produção falha fechada sem evidência real");
expect(config.code_checks.includes("first-contact-sla:check"), "SLA de primeiro contato faz parte do gate");
expect(config.runtime_checks.includes("audit:runtime-schema"), "paridade do schema remoto faz parte do gate");
expect(config.runtime_checks.includes("smoke:v3"), "smoke autenticado faz parte do gate");
expect(packageJson.scripts?.["atlas:baseline:measure"]?.includes("run-atlas-operational-baseline-phase-001.mjs"), "medidor exposto no package");
expect(packageJson.scripts?.["atlas:baseline:check"]?.includes("check-atlas-operational-baseline-phase-001.mjs"), "verificador exposto no package");
expect(runner.includes("production_ready: false"), "medidor nunca promove produção");
expect(runner.includes('process.argv.includes("--runtime")'), "runtime exige comando explícito");
expect(runner.includes('existsSync(".env.local")'), "runtime verifica ambiente sem ler ou revelar segredo");
expect(report.includes("Código aprovado não significa operação comprovada"), "relatório separa construção de evidência");
expect(report.includes("SLA do primeiro contato"), "relatório registra o bloqueador de conversão");
expect(report.includes("Fase 2"), "relatório orienta a próxima etapa");
expect(result.includes("11 de 11 gates locais aprovados"), "resultado local registrado");
expect(result.includes("first-contact-sla:check` | Aprovado"), "SLA local aprovado registrado");
expect(result.includes("Produção liberada | Não"), "produção permanece bloqueada");

const selfTest = spawnSync(process.execPath, ["scripts/run-atlas-operational-baseline-phase-001.mjs", "--self-test"], {
  cwd: process.cwd(),
  encoding: "utf8",
});
expect(selfTest.status === 0, "autoteste do medidor");

for (const [label, passed] of checks) {
  console.log(`${passed ? "✓" : "✗"} ${label}`);
}

if (checks.some(([, passed]) => !passed)) process.exit(1);
console.log(`\nFase 1/24 aprovada: ${checks.length} controles de linha de base.`);
