import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assessDisposableWorkspacePlan,
  cleanupDisposableWorkspace,
  createDisposableWorkspace,
  DISPOSABLE_WORKSPACE_MARKER,
} from "../../lib/testing/disposable-workspace.mjs";

function write(path, content = "fixture") {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "atlas-one-source-fixture-"));
  write(join(root, "package.json"), "{}\n");
  write(join(root, "playwright.config.mjs"), "export default {};\n");
  write(join(root, "scripts/dev.mjs"));
  write(join(root, "supabase/config.toml"));
  write(join(root, "tests/e2e/authenticated-journeys.spec.mjs"));
  write(join(root, "node_modules/.bin/playwright"));
  write(join(root, "app/page.tsx"), "export default function Page() {}\n");
  return root;
}

test("creates an isolated disposable copy and removes it safely", () => {
  const root = fixture();
  const outside = mkdtempSync(join(tmpdir(), "atlas-one-outside-secret-"));
  let disposable;
  try {
    write(join(root, ".env.local"), "SECRET=production\n");
    write(join(root, "nested/.env.production"), "SECRET=production\n");
    write(join(root, ".npmrc"), "//registry.example/:_authToken=secret\n");
    write(join(root, "certificates/private.pem"), "private-key-material\n");
    write(join(root, ".git/config"));
    write(join(root, ".next/cache/data"));
    write(join(root, "dist/release.zip"));
    write(join(root, "supabase/.temp/project-ref"));
    write(join(outside, "secret.txt"), "do-not-copy");
    symlinkSync(join(outside, "secret.txt"), join(root, "nested/secret-link"));

    disposable = createDisposableWorkspace(root);
    assert.equal(disposable.inspection.isolated, true);
    assert.equal(disposable.inspection.nodeModulesReused, true);
    assert.deepEqual(disposable.inspection.environmentFiles, []);
    assert.deepEqual(disposable.inspection.forbiddenArtifacts, []);
    assert.deepEqual(disposable.inspection.unexpectedSymlinks, []);
    assert.equal(existsSync(join(disposable.path, "app/page.tsx")), true);
    assert.equal(existsSync(join(disposable.path, ".env.local")), false);
    assert.equal(existsSync(join(disposable.path, ".npmrc")), false);
    assert.equal(existsSync(join(disposable.path, "certificates/private.pem")), false);
    assert.equal(existsSync(join(disposable.path, ".git")), false);
    assert.equal(existsSync(join(disposable.path, "nested/secret-link")), false);
    const marker = JSON.parse(
      readFileSync(join(disposable.path, DISPOSABLE_WORKSPACE_MARKER), "utf8"),
    );
    assert.equal(marker.kind, "atlas-one-disposable-e2e-workspace");

    const disposablePath = disposable.path;
    cleanupDisposableWorkspace(disposablePath);
    disposable = undefined;
    assert.equal(existsSync(disposablePath), false);
  } finally {
    if (disposable?.path && existsSync(disposable.path)) {
      cleanupDisposableWorkspace(disposable.path);
    }
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test("reports source requirements without reading secret values", () => {
  const root = fixture();
  try {
    write(join(root, ".env.local"), "SHOULD_NOT_BE_READ=secret\n");
    const plan = assessDisposableWorkspacePlan(root);
    assert.equal(plan.ready, true);
    assert.deepEqual(plan.sourceEnvironmentPresent, [".env.local"]);
    assert.equal(JSON.stringify(plan).includes("SHOULD_NOT_BE_READ"), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses an incomplete source workspace", () => {
  const root = mkdtempSync(join(tmpdir(), "atlas-one-incomplete-fixture-"));
  try {
    const plan = assessDisposableWorkspacePlan(root);
    assert.equal(plan.ready, false);
    assert.ok(plan.missing.includes("package.json"));
    assert.throws(() => createDisposableWorkspace(root), /origem incompleto/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("refuses cleanup outside the Atlas disposable namespace", () => {
  const root = mkdtempSync(join(tmpdir(), "ordinary-directory-"));
  try {
    assert.throws(
      () => cleanupDisposableWorkspace(root),
      /fora do espaço temporário Atlas/,
    );
    assert.equal(existsSync(root), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
