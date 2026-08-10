import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateOperationalUxRelease } from "../../lib/analytics/operational-ux-release-gate.ts";
import { OPERATIONAL_UX_VERSION } from "../../lib/analytics/operational-ux-measurement.ts";

const api = readFileSync(
  "app/api/v1/analytics/operational-ux-release-gate/route.ts",
  "utf8",
);
const panel = readFileSync(
  "components/decision-center/OperationalUxReleaseGate.tsx",
  "utf8",
);
const page = readFileSync("app/(crm)/decision-center/page.tsx", "utf8");
const config = JSON.parse(
  readFileSync("config/operational-ux-phase-060-release-gate.json", "utf8"),
);
const row = (payload) => ({ payload });

function approvedEvidence() {
  const before = Array.from({ length: 10 }, () =>
    row({ clickCount: 5, errorCount: 1, completionCount: 1 }),
  );
  const after = Array.from({ length: 10 }, () =>
    row({
      experienceVersion: OPERATIONAL_UX_VERSION,
      clickCount: 3,
      errorCount: 0,
      completionCount: 1,
      decisionQualityAverage: 4.4,
    }),
  );
  return [...before, ...after];
}

test("gate só fica pronto com todas as evidências", () => {
  const ready = evaluateOperationalUxRelease(approvedEvidence());
  assert.equal(ready.evidenceReady, true);
  assert.equal(ready.recommendedStatus, "ready_for_director");
  assert.equal(
    ready.checklist.every((item) => item.passed),
    true,
  );
  const blocked = evaluateOperationalUxRelease([
    row({}),
    row({ experienceVersion: OPERATIONAL_UX_VERSION }),
  ]);
  assert.equal(blocked.evidenceReady, false);
  assert.equal(blocked.recommendedStatus, "blocked");
});

test("aprovação exige Diretoria, utilidade e confirmação explícita", () => {
  assert.match(api, /isDirector/);
  assert.match(api, /checklistAcknowledged !== true/);
  assert.match(api, /rating < 4/);
  assert.match(panel, /Revisei evidências e checklist/);
});

test("rollback é persistido no feature flag canônico", () => {
  assert.equal(config.canonicalGateStore, "feature_flags");
  assert.match(api, /from\("feature_flags"\)/);
  assert.match(api, /rolled_back/);
  assert.match(api, /rollout_percentage: enabled \? 100 : 0/);
});

test("centro de decisão mostra gate e não altera ambiente nesta fase", () => {
  assert.match(page, /OperationalUxReleaseGate/);
  assert.match(panel, /function isGate/);
  assert.match(panel, /function isChecklist/);
  assert.match(panel, /const latestLoad = useRef\(0\)/);
  assert.match(panel, /isCurrentLoad/);
  assert.match(panel, /const isMounted = useRef\(false\)/);
  assert.match(panel, /if \(!isMounted\.current\) return/);
  assert.equal(config.remoteDataChangedDuringPhase, false);
  assert.equal(config.buildExecuted, false);
  assert.equal(config.zipGenerated, false);
  assert.equal(config.deploymentExecuted, false);
});
