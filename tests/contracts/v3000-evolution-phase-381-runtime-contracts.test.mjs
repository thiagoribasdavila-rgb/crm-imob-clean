import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const evidence = JSON.parse(
  read("docs/evidence/V3000_PHASE_381_RUNTIME_CONTRACTS.json"),
);
const progress = JSON.parse(read("config/v3000-progress.json"));

test("auditoria reexecutável prova contratos estáticos sem mutação remota", () => {
  const current = JSON.parse(
    execFileSync("node", ["scripts/audit-v3000-runtime-contracts.mjs"], {
      cwd: root,
      encoding: "utf8",
    }),
  );
  assert.equal(current.staticContracts.status, "PROVED");
  assert.equal(current.staticContracts.passed, current.staticContracts.total);
  assert.equal(current.rlsContracts.status, "STATIC_PROOF_PASSED");
  assert.equal(current.rlsContracts.checks.every((check) => check.passed), true);
  assert.equal(current.secretSafety.passed, true);
  assert.deepEqual(current.secretSafety.trackedRealEnvFiles, []);
  assert.deepEqual(current.mutationPolicy, {
    remoteWritesExecuted: false,
    bootstrapExecuted: false,
    migrationsApplied: false,
    usersChanged: false,
    organizationChanged: false,
  });
});

test("ambiente online prova somente a fronteira anônima observada", () => {
  assert.equal(evidence.anonymousOnlineBoundary.requested, true);
  assert.equal(evidence.anonymousOnlineBoundary.status, "PROVED");
  assert.equal(evidence.anonymousOnlineBoundary.passed, 4);
  assert.equal(evidence.anonymousOnlineBoundary.total, 4);
  assert.equal(
    evidence.anonymousOnlineBoundary.probes.every((probe) => probe.passed),
    true,
  );
  assert.deepEqual(
    evidence.anonymousOnlineBoundary.probes.map(({ id, status }) => ({ id, status })),
    [
      { id: "login_public", status: 200 },
      { id: "setup_public", status: 200 },
      { id: "dashboard_requires_session", status: 307 },
      { id: "auth_me_rejects_anonymous", status: 401 },
    ],
  );
});

test("prova autenticada permanece pendente sem atalho inseguro", () => {
  assert.equal(evidence.authenticatedRuntimeProof.status, "PENDING");
  assert.equal(
    evidence.authenticatedRuntimeProof.reasonCode,
    "SAFE_SESSION_UNAVAILABLE",
  );
  assert.equal(evidence.authenticatedRuntimeProof.requiredEvidence.length, 5);
  assert.ok(
    evidence.authenticatedRuntimeProof.forbiddenShortcuts.includes(
      "copy_browser_cookies",
    ),
  );
  assert.equal(evidence.rlsContracts.dynamicCrossTenantProof, "PENDING_AUTHENTICATED_SESSION");
  assert.equal(evidence.gate.status, "IN_PROGRESS");
  assert.equal(evidence.gate.releaseAllowed, false);
  assert.equal(evidence.gate.zipAllowed, false);
});

test("governança registra a fase histórica 381 sem promover o gate 8", () => {
  assert.ok(progress.program.verifiedHistoricalPhases >= 381);
  assert.ok(progress.program.phaseContractsFound >= 61);
  assert.ok(progress.program.lastVerifiedPhase >= 381);
  assert.equal(progress.consolidation.currentPhase, 8);
  assert.equal(
    progress.consolidation.phases.find((phase) => phase.id === 8)?.status,
    "in_progress",
  );
  assert.equal(
    progress.consolidation.phases.find((phase) => phase.id === 9)?.status,
    "pending",
  );
});
