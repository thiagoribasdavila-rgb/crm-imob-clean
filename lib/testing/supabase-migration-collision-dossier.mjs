import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { scanLocalMigrationCatalog } from "./local-supabase-migration-gate.mjs";

const OBJECT_PATTERNS = [
  ["table", /\b(?:create\s+table(?:\s+if\s+not\s+exists)?|alter\s+table|references|update|insert\s+into|from|join|on)\s+((?:public|private|auth|storage)\.[a-z_][\w]*)/gi],
  ["function", /\b(?:create\s+or\s+replace\s+function|function|perform)\s+((?:public|private)\.[a-z_][\w]*)\s*\(/gi],
  ["trigger", /\b(?:create|drop)\s+trigger(?:\s+if\s+exists)?\s+([a-z_][\w]*)/gi],
  ["policy", /\bcreate\s+policy\s+([a-z_][\w]*)/gi],
  ["index", /\bcreate\s+(?:unique\s+)?index(?:\s+if\s+not\s+exists)?\s+([a-z_][\w]*)/gi],
  ["constraint", /\b(?:add|drop)\s+constraint(?:\s+if\s+exists)?\s+([a-z_][\w]*)/gi],
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function objectKey(type, name) {
  return `${type}:${name.toLowerCase()}`;
}

export function extractMigrationObjectEvidence(sql) {
  const objects = new Map();
  for (const [type, pattern] of OBJECT_PATTERNS) {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      const name = match[1].replace(/[;,]+$/, "").toLowerCase();
      objects.set(objectKey(type, name), { type, name });
    }
  }
  return [...objects.values()].sort((left, right) =>
    objectKey(left.type, left.name).localeCompare(objectKey(right.type, right.name)),
  );
}

function fileEvidence(root, filename) {
  const source = readFileSync(join(resolve(root), "supabase", "migrations", filename), "utf8");
  return {
    filename,
    sha256: sha256(source),
    bytes: Buffer.byteLength(source),
    statementEvidence: extractMigrationObjectEvidence(source),
  };
}

function compareFiles(left, right) {
  const leftKeys = new Set(left.statementEvidence.map(({ type, name }) => objectKey(type, name)));
  const rightKeys = new Set(right.statementEvidence.map(({ type, name }) => objectKey(type, name)));
  const sharedObjects = [...leftKeys]
    .filter((key) => rightKeys.has(key))
    .sort();
  return {
    files: [left.filename, right.filename],
    identicalContent: left.sha256 === right.sha256,
    sharedObjects,
    classification: sharedObjects.length > 0 ? "object_overlap" : "disjoint_but_order_ambiguous",
  };
}

export function buildMigrationCollisionDossier(root = process.cwd()) {
  const catalog = scanLocalMigrationCatalog(root);
  const collisions = catalog.duplicates.map(({ version, files }) => {
    const evidence = files.map((filename) => fileEvidence(root, filename));
    const comparisons = [];
    for (let left = 0; left < evidence.length; left += 1) {
      for (let right = left + 1; right < evidence.length; right += 1) {
        comparisons.push(compareFiles(evidence[left], evidence[right]));
      }
    }
    return {
      version,
      files: evidence,
      comparisons,
      status: "requires_remote_history_evidence",
      safeToRename: false,
      safeToApply: false,
      safeToRepairHistory: false,
    };
  });

  return {
    generatedFrom: "local_static_evidence",
    migrationCount: catalog.migrationCount,
    uniqueVersionCount: catalog.versionCount,
    collisionCount: collisions.length,
    collisions,
    resolved: collisions.length === 0,
    operationalEnvironmentTouched: false,
    sqlBodiesIncluded: false,
    forbiddenActions: [
      "rename_duplicate_without_remote_evidence",
      "apply_duplicate_without_remote_evidence",
      "repair_migration_history",
      "reset_operational_database",
    ],
    nextSafeAction: "collect_remote_migration_history_read_only_in_authorized_operator_session",
  };
}
