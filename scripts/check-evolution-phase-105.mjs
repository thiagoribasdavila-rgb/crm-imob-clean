import { readFileSync } from "node:fs";

const checks = [];

function read(path) {
  return readFileSync(path, "utf8");
}

function assert(name, condition) {
  checks.push({ name, ok: Boolean(condition) });
}

const program = JSON.parse(read("config/evolution-program-3000.json"));
const roadmap = JSON.parse(read("config/evolution-v30-roadmap.json"));
const config = JSON.parse(read("config/evolution-phase-105-v30-roadmap.json"));
const docs = read("docs/ATLAS_V30_ROADMAP.md");
const phaseDocs = read("docs/EVOLUTION_PHASE_105_V30_ROADMAP.md");
const packageJson = JSON.parse(read("package.json"));

assert("programa avançou para fase 105", program.currentPhase === 105);
assert("roadmap V30 está ativo no programa", program.strategicRoadmap?.active === "ATLAS_V30_ROADMAP");
assert("programa aponta V3 para V30", program.strategicRoadmap?.currentProductVersion === "V3" && program.strategicRoadmap?.targetProductVersion === "V30");
assert("roadmap tem 270 fases planejadas", roadmap.totalPlannedPhases === 270);
assert("roadmap começa na fase 105 e termina na 374", roadmap.phaseStart === 105 && roadmap.phaseEnd === 374);
assert("roadmap usa 27 versões com 10 fases", roadmap.versions.length === 27 && roadmap.phasesPerVersion === 10);
assert("roadmap contém V4 e V30", roadmap.versions[0]?.version === "V4" && roadmap.versions.at(-1)?.version === "V30");
assert("roadmap define ZIP milestones", roadmap.executionModel?.zipMilestones?.includes("V5") && roadmap.executionModel?.zipMilestones?.includes("V30"));
assert("roadmap define build no fechamento de versão", roadmap.executionModel?.buildPolicy === "run one full build only at version close or release zip");
assert("configuração da fase 105 existe", config.phase === 105 && config.status === "implemented");
assert("script npm da fase 105 foi registrado", packageJson.scripts["evolution:phase-105:check"] === "node scripts/check-evolution-phase-105.mjs");
assert("documentação principal explica V4 até V30", docs.includes("V4 até V30") && docs.includes("270 fases planejadas"));
assert("documentação principal mantém foco em conversão", docs.includes("transformar leads em vendas") && docs.includes("qualified-to-visit-conversion"));
assert("documentação da fase 105 explica build e ZIP", phaseDocs.includes("não rodar build completo todos os dias") && phaseDocs.includes("V5"));

const failed = checks.filter((check) => !check.ok);

for (const check of checks) {
  console.log(`${check.ok ? "✓" : "✗"} ${check.name}`);
}

if (failed.length) {
  console.error(`\nFase 105 incompleta: ${failed.length} falha(s).`);
  process.exit(1);
}

console.log("\nFase 105 validada: roadmap V30 ativo e governado.");
