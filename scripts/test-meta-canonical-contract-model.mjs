import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const fixture = JSON.parse(readFileSync(resolve(root, "config/fixtures/meta-canonical-migration-local-tests.json"), "utf8"));
const value = (input) => fixture.sentinels[input] ?? input ?? null;

export function syncPair(input) {
  let legacy = value(input.legacy);
  let canonical = value(input.canonical);

  if (input.operation === "insert") {
    if (legacy !== null && canonical !== null && legacy !== canonical) throw new Error("contract_conflict");
    canonical ??= legacy;
    legacy ??= canonical;
    return { legacy, canonical };
  }

  const oldLegacy = value(input.oldLegacy);
  const oldCanonical = value(input.oldCanonical);
  const legacyChanged = legacy !== oldLegacy;
  const canonicalChanged = canonical !== oldCanonical;

  if (legacyChanged && canonicalChanged && legacy !== canonical) throw new Error("contract_conflict");
  if (legacyChanged) canonical = legacy;
  else if (canonicalChanged) legacy = canonical;
  else if (legacy !== canonical) throw new Error("contract_conflict");

  return { legacy, canonical };
}

export function syncScore(input) {
  let legacy = input.legacy ?? null;
  let canonical = input.canonical ?? null;

  if (input.operation === "insert") {
    if (legacy !== null && canonical !== null && legacy !== canonical) {
      if (canonical === 0) canonical = legacy;
      else if (legacy === 0) legacy = canonical;
      else throw new Error("score_conflict");
    }
    canonical ??= legacy ?? 0;
    legacy ??= canonical ?? 0;
  } else {
    const legacyChanged = legacy !== (input.oldLegacy ?? null);
    const canonicalChanged = canonical !== (input.oldCanonical ?? null);
    if (legacyChanged && canonicalChanged && legacy !== canonical) throw new Error("score_conflict");
    if (legacyChanged) canonical = legacy;
    else if (canonicalChanged) legacy = canonical;
    else if (legacy !== canonical) throw new Error("score_conflict");
  }

  if (legacy === null || canonical === null || legacy < 0 || legacy > 100 || canonical < 0 || canonical > 100) {
    throw new Error("score_range");
  }
  return { legacy, canonical };
}

export function mapCommercialRole(input) {
  const mapping = { admin: "director", manager: "manager", broker: "broker" };
  const role = mapping[String(input).trim().toLowerCase()];
  if (!role) throw new Error("unknown_role");
  return role;
}

function executeCase(item, handler) {
  try {
    const output = handler(item);
    if (item.expectedError) return { id: item.id, passed: false, detail: "expected_error_not_thrown" };
    const passed = output.legacy === value(item.expectedLegacy) && output.canonical === value(item.expectedCanonical);
    return { id: item.id, passed, detail: passed ? "ok" : "unexpected_pair" };
  } catch (error) {
    const passed = error instanceof Error && error.message === item.expectedError;
    return { id: item.id, passed, detail: passed ? "expected_rejection" : String(error) };
  }
}

function executeRoleCase(item) {
  try {
    const output = mapCommercialRole(item.legacy);
    return { id: item.id, passed: !item.expectedError && output === item.expected, detail: output };
  } catch (error) {
    const passed = error instanceof Error && error.message === item.expectedError;
    return { id: item.id, passed, detail: passed ? "expected_rejection" : String(error) };
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const tests = [
    ...fixture.pairCases.map((item) => executeCase(item, syncPair)),
    ...fixture.scoreCases.map((item) => executeCase(item, syncScore)),
    ...fixture.roleCases.map(executeRoleCase)
  ];
  const passed = fixture.sanitized === true && fixture.containsPersonalData === false && tests.every((item) => item.passed);
  console.log(JSON.stringify({ passed, sanitized: fixture.sanitized, testCount: tests.length, tests }, null, 2));
  if (!passed) process.exit(1);
}
