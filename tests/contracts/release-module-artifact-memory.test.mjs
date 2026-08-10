import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createModuleArtifactMemory,
  createModuleArtifactSnapshot,
  inspectModuleArtifactMemory,
  inspectModuleArtifactSnapshot,
} from "../../lib/release/module-artifact-memory.mjs";

function fixture() {
  const rootDir = mkdtempSync(join(tmpdir(), "atlas-module-artifacts-"));
  mkdirSync(join(rootDir, "src"));
  mkdirSync(join(rootDir, "evidence"));
  writeFileSync(join(rootDir, "src/module.ts"), "export const ready = true;\n");
  writeFileSync(join(rootDir, "evidence/module.test.mjs"), "// verified\n");
  const entry = {
    moduleId: "verified-module",
    revision: 1,
    entryHash: "a".repeat(64),
    sourcePaths: ["src/module.ts"],
    evidencePaths: ["evidence/module.test.mjs"],
  };
  return { rootDir, entry };
}

test("registra a impressão exata dos artefatos de um módulo", () => {
  const { rootDir, entry } = fixture();
  try {
    const snapshot = createModuleArtifactSnapshot({ rootDir, entry });
    assert.equal(snapshot.artifactCount, 2);
    assert.equal(snapshot.artifactSetHash.length, 64);
    assert.equal(inspectModuleArtifactSnapshot({ rootDir, entry, snapshot }).ok, true);
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("detecta alteração posterior em qualquer arquivo registrado", () => {
  const { rootDir, entry } = fixture();
  try {
    const snapshot = createModuleArtifactSnapshot({ rootDir, entry });
    writeFileSync(join(rootDir, "src/module.ts"), "export const ready = false;\n");
    assert.deepEqual(inspectModuleArtifactSnapshot({ rootDir, entry, snapshot }), {
      ok: false,
      reason: "artifact_set_mismatch",
    });
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("vincula snapshot à revisão e ao hash exatos da memória de conclusão", () => {
  const { rootDir, entry } = fixture();
  try {
    const snapshot = createModuleArtifactSnapshot({ rootDir, entry });
    const changedEntry = { ...entry, revision: 2 };
    assert.deepEqual(inspectModuleArtifactSnapshot({ rootDir, entry: changedEntry, snapshot }), {
      ok: false,
      reason: "completion_entry_mismatch",
    });
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("recusa caminho inseguro e link simbólico", () => {
  const { rootDir, entry } = fixture();
  try {
    assert.throws(
      () => createModuleArtifactSnapshot({ rootDir, entry: { ...entry, sourcePaths: ["../escape"] } }),
      /artifact_path_unsafe/,
    );
    symlinkSync(join(rootDir, "src/module.ts"), join(rootDir, "src/link.ts"));
    assert.throws(
      () => createModuleArtifactSnapshot({ rootDir, entry: { ...entry, sourcePaths: ["src/link.ts"] } }),
      /artifact_not_regular_file/,
    );
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

test("memória detecta adulteração e snapshots duplicados", () => {
  const { rootDir, entry } = fixture();
  try {
    const snapshot = createModuleArtifactSnapshot({ rootDir, entry });
    const memory = createModuleArtifactMemory([snapshot]);
    assert.deepEqual(inspectModuleArtifactMemory(memory), { ok: true, registeredSnapshots: 1 });
    assert.equal(inspectModuleArtifactMemory({ ...memory, memoryHash: "0".repeat(64) }).reason, "artifact_memory_hash_mismatch");
    const duplicate = createModuleArtifactMemory([snapshot, snapshot]);
    assert.equal(inspectModuleArtifactMemory(duplicate).reason, "artifact_snapshot_duplicate");
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});
