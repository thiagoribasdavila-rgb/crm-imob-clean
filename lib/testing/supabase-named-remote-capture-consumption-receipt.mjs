import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { NAMED_REMOTE_CAPTURE_HANDOFF_SCHEMA } from "./supabase-named-remote-capture-handoff.mjs";

export const NAMED_REMOTE_CAPTURE_CONSUMPTION_RECEIPT_SCHEMA =
  "atlas.named_remote_capture_consumption_receipt.v1";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function isoTimestamp(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function insideRoot(root, candidate) {
  const path = relative(root, candidate);
  return path !== "" && path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith(sep);
}

function fail(reason, extra = {}) {
  return {
    ok: false,
    reason,
    receiptPersisted: false,
    idempotentReplay: false,
    remoteContacted: false,
    remoteWriteExecuted: false,
    migrationApplied: false,
    buildExecuted: false,
    zipGenerated: false,
    deployExecuted: false,
    ...extra,
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, canonical(value[key])]),
  );
}

function serialized(value) {
  return `${JSON.stringify(canonical(value), null, 2)}\n`;
}

function validManifest(manifest) {
  if (manifest?.schemaVersion !== NAMED_REMOTE_CAPTURE_HANDOFF_SCHEMA) return false;
  for (const key of [
    "handoffIdSha256",
    "authorizationReviewSha256",
    "operationFingerprintSha256",
    "targetProjectRefSha256",
    "querySha256",
    "localFingerprintSetSha256",
  ]) {
    if (!SHA256_PATTERN.test(manifest[key] ?? "")) return false;
  }
  return Boolean(isoTimestamp(manifest.issuedAt) && isoTimestamp(manifest.expiresAt));
}

function safeCode(value, fallback = "unclassified") {
  return typeof value === "string" && /^[a-z0-9_.-]{1,96}$/.test(value)
    ? value
    : fallback;
}

export function buildNamedRemoteCaptureConsumptionReceipt({
  manifest,
  consumption,
  recordedAt = new Date(),
} = {}) {
  const recordedAtIso = isoTimestamp(recordedAt);
  if (!validManifest(manifest)) return fail("consumption_receipt_manifest_invalid");
  if (!recordedAtIso) return fail("consumption_receipt_timestamp_invalid");
  if (
    consumption?.handoffConsumed !== true ||
    consumption?.authorizationConsumed !== true ||
    !isoTimestamp(consumption?.consumedAt)
  ) {
    return fail("consumption_receipt_requires_consumed_handoff");
  }
  if (consumption.remoteWriteExecuted !== false) {
    return fail("consumption_receipt_remote_write_state_invalid");
  }

  const evidenceSummary = consumption.ok === true && consumption.evidence
    ? {
        schemaVersion: safeCode(consumption.evidence.schemaVersion, "unknown_schema"),
        mappingCount: Array.isArray(consumption.evidence.mappings)
          ? consumption.evidence.mappings.length
          : 0,
        evidenceSha256: sha256(serialized(consumption.evidence)),
      }
    : null;
  const receiptWithoutHash = {
    schemaVersion: NAMED_REMOTE_CAPTURE_CONSUMPTION_RECEIPT_SCHEMA,
    phase: 187,
    status: consumption.ok === true
      ? "consumed_capture_adapted"
      : "consumed_capture_rejected",
    recordedAt: recordedAtIso,
    handoff: {
      handoffIdSha256: manifest.handoffIdSha256,
      authorizationReviewSha256: manifest.authorizationReviewSha256,
      operationFingerprintSha256: manifest.operationFingerprintSha256,
      targetProjectRefSha256: manifest.targetProjectRefSha256,
      querySha256: manifest.querySha256,
      localFingerprintSetSha256: manifest.localFingerprintSetSha256,
      issuedAt: isoTimestamp(manifest.issuedAt),
      expiresAt: isoTimestamp(manifest.expiresAt),
      consumedAt: isoTimestamp(consumption.consumedAt),
    },
    outcome: {
      accepted: consumption.ok === true,
      reason: safeCode(consumption.reason),
      adapterReason: consumption.adapterReason
        ? safeCode(consumption.adapterReason)
        : null,
      evidenceSummary,
    },
    privacy: {
      rawCaptureIncluded: false,
      sqlBodiesIncluded: false,
      migrationNamesIncluded: false,
      rawProjectRefIncluded: false,
      credentialsIncluded: false,
      personalDataIncluded: false,
    },
    execution: {
      remoteContactedByReceipt: false,
      remoteWriteExecuted: false,
      migrationApplied: false,
      migrationHistoryRepaired: false,
      databaseReset: false,
      buildExecuted: false,
      zipGenerated: false,
      deployExecuted: false,
    },
  };
  const receipt = Object.freeze({
    ...receiptWithoutHash,
    receiptSha256: sha256(serialized(receiptWithoutHash)),
  });
  return {
    ok: true,
    reason: "consumption_receipt_built",
    receipt,
    receiptPersisted: false,
    idempotentReplay: false,
    remoteContacted: false,
    remoteWriteExecuted: false,
    migrationApplied: false,
    buildExecuted: false,
    zipGenerated: false,
    deployExecuted: false,
  };
}

export function persistNamedRemoteCaptureConsumptionReceipt({
  root = process.cwd(),
  receiptDirectory,
  manifest,
  consumption,
  recordedAt = new Date(),
  randomBytesFn = randomBytes,
} = {}) {
  if (!receiptDirectory) return fail("consumption_receipt_directory_required");
  const absoluteRoot = resolve(root);
  const absoluteDirectory = resolve(absoluteRoot, receiptDirectory);
  if (!insideRoot(absoluteRoot, absoluteDirectory)) {
    return fail("consumption_receipt_directory_outside_root");
  }

  const built = buildNamedRemoteCaptureConsumptionReceipt({ manifest, consumption, recordedAt });
  if (!built.ok) return built;
  mkdirSync(absoluteDirectory, { recursive: true, mode: 0o700 });
  const physicalRoot = realpathSync(absoluteRoot);
  const physicalDirectory = realpathSync(absoluteDirectory);
  if (!insideRoot(physicalRoot, physicalDirectory)) {
    return fail("consumption_receipt_directory_symlink_escape");
  }
  const receiptPath = resolve(absoluteDirectory, `${manifest.handoffIdSha256}.json`);
  if (dirname(receiptPath) !== absoluteDirectory) {
    return fail("consumption_receipt_path_invalid");
  }
  const payload = serialized(built.receipt);

  try {
    const existingStat = lstatSync(receiptPath);
    if (!existingStat.isFile() || existingStat.isSymbolicLink()) {
      return fail("consumption_receipt_existing_path_unsafe");
    }
    const existing = readFileSync(receiptPath, "utf8");
    if (existing !== payload) return fail("consumption_receipt_conflict");
    return {
      ...built,
      reason: "consumption_receipt_already_persisted",
      receiptPersisted: true,
      idempotentReplay: true,
      receiptPath,
    };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const temporaryPath = `${receiptPath}.${sha256(randomBytesFn(16)).slice(0, 16)}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporaryPath, "wx", 0o600);
    writeFileSync(descriptor, payload, "utf8");
    closeSync(descriptor);
    descriptor = undefined;
    try {
      linkSync(temporaryPath, receiptPath);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const existingStat = lstatSync(receiptPath);
      if (!existingStat.isFile() || existingStat.isSymbolicLink()) {
        return fail("consumption_receipt_existing_path_unsafe");
      }
      if (readFileSync(receiptPath, "utf8") !== payload) {
        return fail("consumption_receipt_conflict");
      }
      return {
        ...built,
        reason: "consumption_receipt_already_persisted",
        receiptPersisted: true,
        idempotentReplay: true,
        receiptPath,
      };
    }
    return {
      ...built,
      reason: "consumption_receipt_persisted",
      receiptPersisted: true,
      receiptPath,
    };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    try { unlinkSync(temporaryPath); } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}
