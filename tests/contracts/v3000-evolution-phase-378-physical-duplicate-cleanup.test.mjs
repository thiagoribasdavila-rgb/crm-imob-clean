import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (file) => readFileSync(path.join(root, file), "utf8");
const policy = JSON.parse(read("config/v3000-physical-duplicate-cleanup.json"));
const progress = JSON.parse(read("config/v3000-progress.json"));

test("remove somente os doze stubs vazios comprovados", () => {
  assert.equal(policy.removedEmptyStubs.length, 12);
  for (const stub of policy.removedEmptyStubs) {
    assert.equal(existsSync(path.join(root, stub.path)), false, stub.path);
    assert.ok(stub.replacement.length > 0);
    assert.ok(stub.reason.length > 0);
  }
});

test("preserva o cockpit de IA canônico real", () => {
  const cockpit = read("app/(crm)/ai-dashboard/page.tsx");
  assert.match(cockpit, /module:\s*["']ai-dashboard["']/);
  assert.match(cockpit, /Atlas/);
  assert.ok(cockpit.trim().length > 1_000);
});

test("auditoria física comprova redução sem alterar superfície ativa", () => {
  const result = JSON.parse(
    execFileSync("node", ["scripts/audit-v3000-physical-duplicates.mjs"], {
      cwd: root,
      encoding: "utf8",
    }),
  );
  assert.equal(result.ok, true);
  assert.equal(result.removedEmptyStubs, 12);
  assert.equal(result.activeSurfacePreserved, true);
  assert.deepEqual(result.before, {
    routeFiles: 449,
    quarantinedRouteFiles: 181,
    allSourceCollisions: 17,
  });
  assert.deepEqual(result.after, {
    routeFiles: 448,
    quarantinedRouteFiles: 180,
    allSourceCollisions: 16,
  });
});

test("governança avança para a fase 378 e gate 5", () => {
  assert.equal(progress.program.verifiedHistoricalPhases, 378);
  assert.equal(progress.program.phaseContractsFound, 58);
  assert.equal(progress.program.lastVerifiedPhase, 378);
  assert.equal(progress.consolidation.currentPhase, 5);
  assert.deepEqual(
    progress.consolidation.phases.filter((phase) => phase.status === "complete").map((phase) => phase.id),
    [1, 2, 3, 4, 5],
  );
  assert.deepEqual(
    progress.consolidation.phases.filter((phase) => phase.status === "next").map((phase) => phase.id),
    [6],
  );
});
