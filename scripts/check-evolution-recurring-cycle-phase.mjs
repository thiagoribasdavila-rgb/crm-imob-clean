import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import {
  CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES,
  inspectControlledProofExecutionRecurringCycleMemory,
  inspectControlledProofExecutionRecurringCyclePolicy,
} from "../lib/release/controlled-proof-execution-recurring-cycle.mjs";

const phaseNumber = Number(process.argv[2]);
const fail = (message) => { throw new Error(`[phase-${phaseNumber}] ${message}`); };
if (!Number.isInteger(phaseNumber) || phaseNumber < 255 || phaseNumber > 349) fail("fase inválida");
const stageIndex = (phaseNumber - 255) % CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES.length;
const expectedStage = CONTROLLED_PROOF_EXECUTION_RECURRING_CYCLE_STAGES[stageIndex];
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const phasePath = `config/evolution-phase-${phaseNumber}-controlled-proof-execution-recurring-${expectedStage}.json`;
const docPath = `docs/EVOLUTION_PHASE_${phaseNumber}_CONTROLLED_PROOF_EXECUTION_RECURRING_${expectedStage.replaceAll("-", "_").toUpperCase()}.md`;
for (const path of [
  phasePath, docPath,
  "config/controlled-proof-execution-recurring-cycle-policy.json",
  "config/controlled-proof-execution-recurring-cycle-memory.json",
  "lib/release/controlled-proof-execution-recurring-cycle.mjs",
  "scripts/run-controlled-proof-execution-recurring-cycle-phase.mjs",
  "tests/contracts/controlled-proof-execution-recurring-cycle.test.mjs",
]) if (!existsSync(path)) fail(`arquivo ausente: ${path}`);

const previousChecker = phaseNumber === 255 ? "scripts/check-evolution-phase-254.mjs" : "scripts/check-evolution-recurring-cycle-phase.mjs";
const previousArgs = phaseNumber === 255 ? [previousChecker] : [previousChecker, String(phaseNumber - 1)];
execFileSync(process.execPath, previousArgs, { stdio: "pipe" });

const policy = readJson("config/controlled-proof-execution-recurring-cycle-policy.json");
const memory = readJson("config/controlled-proof-execution-recurring-cycle-memory.json");
const phase = readJson(phasePath);
const readiness = JSON.parse(execFileSync(process.execPath, ["scripts/run-controlled-proof-execution-recurring-cycle-phase.mjs", String(phaseNumber)], { encoding: "utf8" }));
const policyInspection = inspectControlledProofExecutionRecurringCyclePolicy(policy, {
  compositionId: "conversion-core-candidate",
  upstreamAuthorizationPolicyHash: "d473e49a7a7b6e9850531356cf1eba7d8e80fd9e8b97d916049167d55cd015d5",
  upstreamAuthorizationMemoryHash: "cd8ca34ab7fe175ee05366649ff10e95142a723c012c0c6ee863a5b8ce3b5502",
  trustedActors: [],
});
if (!policyInspection.ok) fail(`política inválida: ${policyInspection.reason}`);
const memoryInspection = inspectControlledProofExecutionRecurringCycleMemory(memory, { policy });
if (!memoryInspection.ok) fail(`memória inválida: ${memoryInspection.reason}`);
if (phase.phase !== phaseNumber || phase.status !== "implemented" || phase.gateStage !== expectedStage) fail("fase, status ou gate divergente");
if (readiness.phase !== phaseNumber || readiness.gateStage !== expectedStage) fail("diagnóstico divergente");
if (phase.currentState.policyHash !== policy.policyHash || phase.currentState.memoryHash !== memory.memoryHash) fail("vínculo canônico divergente");
if (policy.trustedActors.length !== 0 || memory.entries.length !== 0) fail("ator ou evidência real foi inventado");
if (phase.currentState.trustedActorsConfigured !== 0 || phase.currentState.recordedEntries !== 0) fail("contagem inventada");
if (phase.currentState.runtimeEvidenceRecorded !== false || phase.runtimeHomologated !== false) fail("execução real alegada sem evidência");
for (const value of Object.values(phase.safety)) if (value !== false) fail("efeito externo indevido");
for (const key of ["networkAccessAllowed", "databaseMutationAllowed", "externalPublicationAllowed", "automaticPackageGeneration", "automaticBuild", "automaticDeploy", "automaticReleasePromotion"]) {
  if (policy[key] !== false) fail(`${key} habilitado`);
}
if (phase.nextPhase?.phase !== phaseNumber + 1) fail("próxima fase divergente");
const scripts = readJson("package.json").scripts ?? {};
for (const suffix of ["assess", "check"]) if (!scripts[`evolution:phase-${phaseNumber}:${suffix}`]) fail(`script ${suffix} ausente`);
if (readJson("config/evolution-program-3000.json").currentPhase < phaseNumber) fail("programa principal não avançou");
console.log(`[phase-${phaseNumber}] PASS — gate ${expectedStage} implementado, ordenado e seguro; nenhuma evidência operacional ou ação externa foi inventada.`);
