import fs from "node:fs";

const read = (file) => fs.readFileSync(file, "utf8");
const json = (file) => JSON.parse(read(file));

const previous = json("config/evolution-phase-099-project-write-homologation.json");
const phase = json("config/evolution-phase-100-release-checkpoint.json");
const program = json("config/evolution-program-3000.json");
const gates = json("config/atlas-ai-os-release-gates.json");
const releaseScript = read("scripts/release-atlas-ai-os.mjs");
const packageScript = read("scripts/package-hostinger.mjs");
const verifyScript = read("scripts/verify-hostinger-package.mjs");
const report = read("docs/EVOLUTION_PHASE_100_RELEASE_CHECKPOINT.md");

const expectedBlockers = [
  "project-write-migration-not-homologated",
  "authenticated-commercial-journeys-not-behaviorally-proven",
  "hostinger-runtime-smoke-not-executed",
  "release-source-not-consolidated-in-a-clean-commit",
  "director-release-signoff-not-recorded",
];

const checks = [
  ["Fase 99 foi preservada", previous.phase === 99 && previous.status === "completed" && previous.migrationApplied === false],
  ["Fase 100 concluiu o checkpoint sem mutar produção", phase.phase === 100 && phase.program === "continuous" && phase.status === "completed" && phase.productionDataModified === false && phase.databaseSchemaChanged === false && phase.authenticationChanged === false],
  ["Programa contínuo avançou para 100", program.currentPhase >= 100],
  ["Um único build foi exigido e executado", phase.build.requiredExecutions === 1 && phase.build.executed === 1 && phase.build.status === "passed" && phase.release.buildExecuted === true],
  ["Regressão, dependências, tipos, lint e smoke foram registrados", phase.validation.phaseHistory === "passed-through-99" && phase.validation.dependencyAudit === "passed-zero-production-vulnerabilities" && phase.validation.typecheck === "passed" && phase.validation.lint === "passed" && phase.validation.localSmoke === "passed"],
  ["Release permanece bloqueado sem falsa aprovação", phase.releaseDecision.state === "blocked" && phase.releaseDecision.approved === false && phase.releaseDecision.artifactCreated === false && phase.releaseDecision.automaticDeploy === false],
  ["Todos os bloqueios críticos estão explícitos", expectedBlockers.every((blocker) => phase.releaseDecision.blockers.includes(blocker))],
  ["ZIP não foi forçado além do gate", phase.release.zipCreated === false && phase.safety.zipForcedPastGate === false && phase.safety.secretsPackaged === false && phase.safety.customerDataPackaged === false],
  ["Gate oficial continua bloqueado", gates.status === "blocked" && gates.approved === false && gates.automaticDeploy === false && gates.gates.consistentDatabase === false && gates.gates.criticalTestsPassed === false && gates.gates.directorApproval === false],
  ["Release oficial exige aprovação e exatamente um build", releaseScript.includes("gates.approved !== true") && releaseScript.includes("gates.localBuildsRequired !== 1") && releaseScript.includes('run("npm", ["run", "build"])')],
  ["Pacote nasce de commit reproduzível e recusa alterações", packageScript.includes('git", ["archive", "--format=tar", "HEAD"]') && packageScript.includes("Existem alterações versionadas sem commit")],
  ["Pacote e verificador excluem dados privados", packageScript.includes("env\\.local") && packageScript.includes("privateDataIncluded: false") && verifyScript.includes("Conteúdo proibido") && verifyScript.includes("Checksum externo divergente")],
  ["Relatório explica aprovação técnica, bloqueio, segurança e próximo gate", report.includes("Evidências aprovadas") && report.includes("Por que o ZIP foi bloqueado") && report.includes("Gate para o próximo pacote") && report.includes("Segurança preservada") && report.includes("Próxima etapa recomendada")],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else console.log(`✓ ${label}`);
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 100 verificada: build e smoke aprovados; ZIP corretamente bloqueado até as evidências operacionais e o aceite humano.");
