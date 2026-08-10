import { createHash, createHmac } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, relative, resolve, sep } from "node:path";
import {
  NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_SCHEMA,
  inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot,
} from "./supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index-snapshot.mjs";

export const NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_EXPORT_AUTHORIZATION_SCHEMA =
  "atlas.named_remote_capture_receipt_ledger_checkpoint_chain_proof_custody_index_snapshot_export_authorization.v1";
export const SNAPSHOT_EXPORT_APPROVAL_PHRASE = "AUTORIZO EXPORTAR ESTE SNAPSHOT";
export const SNAPSHOT_EXPORT_PURPOSE_CODES = Object.freeze([
  "disaster_recovery_validation",
  "migration_reconciliation_review",
  "regulatory_evidence_review",
  "security_audit",
]);

const HASH = /^[a-f0-9]{64}$/;
const FILE = /^([a-f0-9]{64})\.json$/;
const MAX_BYTES = 64 * 1024;
const MAX_VALIDITY_MS = 15 * 60 * 1000;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const hmac = (key, value) => createHmac("sha256", key).update(value).digest("hex");
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const serialized = (value) => `${JSON.stringify(canonical(value))}\n`;
const validIso = (value) => {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
};
const exactKeys = (value, expected) => value && typeof value === "object" && !Array.isArray(value) &&
  Object.keys(value).sort().join("|") === [...expected].sort().join("|");
const inside = (root, candidate, allowRoot = false) => {
  const path = relative(root, candidate);
  return path === "" ? allowRoot : path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith(sep);
};
const validIdentity = (value) => typeof value === "string" && value === value.trim() &&
  value.length >= 3 && value.length <= 320 && !/[\u0000-\u001f\u007f]/u.test(value);
const validKey = (value) => typeof value === "string" && value.length >= 32 && value.length <= 4096;

function result(reason, extra = {}) {
  return {
    ok: false,
    reason,
    authorizationVerified: false,
    snapshotVerified: false,
    exportAuthorized: false,
    exportExecuted: false,
    localAuthorizationWritten: false,
    remoteContacted: false,
    remoteWriteExecuted: false,
    databaseWriteExecuted: false,
    migrationApplied: false,
    buildExecuted: false,
    zipGenerated: false,
    deployExecuted: false,
    ...extra,
  };
}

function directory(root, requested, create = false) {
  if (!requested) return result("snapshot_export_authorization_directory_required");
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, requested);
  if (!inside(absoluteRoot, target)) return result("snapshot_export_authorization_directory_outside_root");
  try {
    const physicalRoot = realpathSync(absoluteRoot);
    if (create) {
      const parent = realpathSync(dirname(target));
      if (!inside(physicalRoot, parent, true)) return result("snapshot_export_authorization_directory_symlink_escape");
      try {
        const stat = lstatSync(target);
        if (stat.isSymbolicLink() || !stat.isDirectory()) return result("snapshot_export_authorization_directory_invalid");
      } catch (error) {
        if (error?.code !== "ENOENT") return result("snapshot_export_authorization_directory_unreadable");
        mkdirSync(target, { mode: 0o700 });
        chmodSync(target, 0o700);
      }
    }
    const physical = realpathSync(target);
    if (!inside(physicalRoot, physical)) return result("snapshot_export_authorization_directory_symlink_escape");
    const stat = lstatSync(physical);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return result("snapshot_export_authorization_directory_invalid");
    if ((stat.mode & 0o777) !== 0o700) return result("snapshot_export_authorization_directory_mode_invalid");
    return { ok: true, physical };
  } catch {
    return result("snapshot_export_authorization_directory_unreadable");
  }
}

function readAuthorization(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile()) return result("snapshot_export_authorization_not_regular_file");
    if ((stat.mode & 0o777) !== 0o600) return result("snapshot_export_authorization_mode_invalid");
    if (stat.size > MAX_BYTES) return result("snapshot_export_authorization_too_large");
    const raw = readFileSync(fd, "utf8");
    try {
      return { ok: true, raw, authorization: JSON.parse(raw) };
    } catch {
      return result("snapshot_export_authorization_json_invalid");
    }
  } catch (error) {
    return result(error?.code === "ELOOP"
      ? "snapshot_export_authorization_symlink_refused"
      : "snapshot_export_authorization_read_failed");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function validateAuthorization(authorization, fileHash) {
  if (!exactKeys(authorization, ["schemaVersion", "phase", "issuedAt", "expiresAt", "snapshot", "authorization", "privacy", "execution", "authorizationSha256"])) {
    return "snapshot_export_authorization_envelope_invalid";
  }
  const issued = new Date(authorization.issuedAt).getTime();
  const expires = new Date(authorization.expiresAt).getTime();
  if (
    authorization.schemaVersion !== NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_EXPORT_AUTHORIZATION_SCHEMA ||
    authorization.phase !== 195 || !validIso(authorization.issuedAt) || !validIso(authorization.expiresAt) ||
    expires <= issued || expires - issued > MAX_VALIDITY_MS ||
    !HASH.test(authorization.authorizationSha256 ?? "") || authorization.authorizationSha256 !== fileHash ||
    !exactKeys(authorization.snapshot, ["schemaVersion", "snapshotSha256", "snapshotFileName"]) ||
    authorization.snapshot.schemaVersion !== NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_SCHEMA ||
    !HASH.test(authorization.snapshot.snapshotSha256 ?? "") ||
    authorization.snapshot.snapshotFileName !== `${authorization.snapshot.snapshotSha256}.json`
  ) return "snapshot_export_authorization_envelope_invalid";
  if (!exactKeys(authorization.authorization, ["purposeCode", "recipientIdHmacSha256", "approverIdHmacSha256", "approvalPhrase", "approved"]) ||
    !SNAPSHOT_EXPORT_PURPOSE_CODES.includes(authorization.authorization.purposeCode) ||
    !HASH.test(authorization.authorization.recipientIdHmacSha256 ?? "") ||
    !HASH.test(authorization.authorization.approverIdHmacSha256 ?? "") ||
    authorization.authorization.recipientIdHmacSha256 === authorization.authorization.approverIdHmacSha256 ||
    authorization.authorization.approvalPhrase !== SNAPSHOT_EXPORT_APPROVAL_PHRASE || authorization.authorization.approved !== true) {
    return "snapshot_export_authorization_approval_contract_invalid";
  }
  if (!exactKeys(authorization.privacy, ["recipientIncluded", "approverIncluded", "credentialsIncluded", "personalDataIncluded"]) ||
    Object.values(authorization.privacy).some((value) => value !== false)) {
    return "snapshot_export_authorization_privacy_contract_invalid";
  }
  if (!exactKeys(authorization.execution, ["exportExecuted", "remoteContacted", "remoteWriteExecuted", "databaseWriteExecuted", "migrationApplied", "buildExecuted", "zipGenerated", "deployExecuted"]) ||
    Object.values(authorization.execution).some((value) => value !== false)) {
    return "snapshot_export_authorization_execution_contract_invalid";
  }
  const { authorizationSha256, ...withoutHash } = authorization;
  return sha256(serialized(withoutHash)) === authorizationSha256
    ? null
    : "snapshot_export_authorization_hash_mismatch";
}

function success(reason, authorization, extra = {}) {
  return {
    ok: true,
    reason,
    authorizationVerified: true,
    authorizationSha256: authorization.authorizationSha256,
    authorizationFileName: `${authorization.authorizationSha256}.json`,
    snapshotSha256: authorization.snapshot.snapshotSha256,
    snapshotFileName: authorization.snapshot.snapshotFileName,
    purposeCode: authorization.authorization.purposeCode,
    issuedAt: authorization.issuedAt,
    expiresAt: authorization.expiresAt,
    exportAuthorized: false,
    exportExecuted: false,
    snapshotVerified: false,
    localAuthorizationWritten: false,
    remoteContacted: false,
    remoteWriteExecuted: false,
    databaseWriteExecuted: false,
    migrationApplied: false,
    buildExecuted: false,
    zipGenerated: false,
    deployExecuted: false,
    ...extra,
  };
}

export function inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization({
  root = process.cwd(), authorizationDirectory, authorizationFileName,
} = {}) {
  if (!FILE.test(authorizationFileName ?? "")) return result("snapshot_export_authorization_file_name_invalid");
  const target = directory(root, authorizationDirectory);
  if (!target.ok) return target;
  const path = resolve(target.physical, authorizationFileName);
  if (!inside(target.physical, path)) return result("snapshot_export_authorization_path_outside_directory");
  const read = readAuthorization(path);
  if (!read.ok) return read;
  const fileHash = FILE.exec(basename(path))[1];
  const invalid = validateAuthorization(read.authorization, fileHash);
  return invalid ? result(invalid) : success("snapshot_export_authorization_valid", read.authorization);
}

export function createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization({
  root = process.cwd(), snapshotDirectory, snapshotFileName, authorizationDirectory,
  recipientId, approverId, authorizationKey, purposeCode, approvalPhrase,
  issuedAt = new Date().toISOString(), expiresAt,
} = {}) {
  if (!validIdentity(recipientId)) return result("snapshot_export_authorization_recipient_invalid");
  if (!validIdentity(approverId)) return result("snapshot_export_authorization_approver_invalid");
  if (!validKey(authorizationKey)) return result("snapshot_export_authorization_key_invalid");
  if (!SNAPSHOT_EXPORT_PURPOSE_CODES.includes(purposeCode)) return result("snapshot_export_authorization_purpose_invalid");
  if (approvalPhrase !== SNAPSHOT_EXPORT_APPROVAL_PHRASE) return result("snapshot_export_authorization_phrase_invalid");
  if (!validIso(issuedAt) || !validIso(expiresAt)) return result("snapshot_export_authorization_time_invalid");
  const issued = new Date(issuedAt).getTime();
  const expires = new Date(expiresAt).getTime();
  if (expires <= issued || expires - issued > MAX_VALIDITY_MS) return result("snapshot_export_authorization_validity_invalid");
  const recipientIdHmacSha256 = hmac(authorizationKey, `recipient:${recipientId}`);
  const approverIdHmacSha256 = hmac(authorizationKey, `approver:${approverId}`);
  if (recipientId === approverId) return result("snapshot_export_authorization_separation_of_duties_required");
  const snapshot = inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
    root, snapshotDirectory, snapshotFileName,
  });
  if (!snapshot.ok) return result("snapshot_export_authorization_snapshot_invalid", { cause: snapshot.reason });
  const target = directory(root, authorizationDirectory, true);
  if (!target.ok) return target;
  const withoutHash = {
    schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_EXPORT_AUTHORIZATION_SCHEMA,
    phase: 195,
    issuedAt,
    expiresAt,
    snapshot: {
      schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_SCHEMA,
      snapshotSha256: snapshot.snapshotSha256,
      snapshotFileName: snapshot.snapshotFileName,
    },
    authorization: {
      purposeCode,
      recipientIdHmacSha256,
      approverIdHmacSha256,
      approvalPhrase,
      approved: true,
    },
    privacy: { recipientIncluded: false, approverIncluded: false, credentialsIncluded: false, personalDataIncluded: false },
    execution: {
      exportExecuted: false, remoteContacted: false, remoteWriteExecuted: false, databaseWriteExecuted: false,
      migrationApplied: false, buildExecuted: false, zipGenerated: false, deployExecuted: false,
    },
  };
  const authorization = { ...withoutHash, authorizationSha256: sha256(serialized(withoutHash)) };
  const content = serialized(authorization);
  const path = resolve(target.physical, `${authorization.authorizationSha256}.json`);
  let fd;
  try {
    fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeFileSync(fd, content, "utf8");
    return success("snapshot_export_authorization_created", authorization, { localAuthorizationWritten: true });
  } catch (error) {
    if (error?.code !== "EEXIST") return result("snapshot_export_authorization_write_failed");
    const existing = readAuthorization(path);
    if (!existing.ok || existing.raw !== content) return result("snapshot_export_authorization_collision_refused");
    return success("snapshot_export_authorization_already_exists", authorization);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization({
  root = process.cwd(), authorizationDirectory, authorizationFileName, snapshotDirectory, snapshotFileName,
  recipientId, approverId, authorizationKey, expectedPurposeCode, now = new Date().toISOString(),
} = {}) {
  const inspected = inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshotExportAuthorization({
    root, authorizationDirectory, authorizationFileName,
  });
  if (!inspected.ok) return inspected;
  if (!validIso(now)) return result("snapshot_export_authorization_now_invalid");
  const current = new Date(now).getTime();
  if (current < new Date(inspected.issuedAt).getTime()) return result("snapshot_export_authorization_not_yet_valid");
  if (current >= new Date(inspected.expiresAt).getTime()) return result("snapshot_export_authorization_expired");
  if (!validIdentity(recipientId) || !validIdentity(approverId) || !validKey(authorizationKey)) {
    return result("snapshot_export_authorization_identity_proof_incomplete");
  }
  if (!SNAPSHOT_EXPORT_PURPOSE_CODES.includes(expectedPurposeCode)) {
    return result("snapshot_export_authorization_expected_purpose_invalid");
  }
  const target = directory(root, authorizationDirectory);
  if (!target.ok) return target;
  const read = readAuthorization(resolve(target.physical, authorizationFileName));
  if (!read.ok) return read;
  if (
    hmac(authorizationKey, `recipient:${recipientId}`) !== read.authorization.authorization.recipientIdHmacSha256 ||
    hmac(authorizationKey, `approver:${approverId}`) !== read.authorization.authorization.approverIdHmacSha256 ||
    expectedPurposeCode !== read.authorization.authorization.purposeCode
  ) return result("snapshot_export_authorization_identity_or_purpose_mismatch");
  const snapshot = inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
    root, snapshotDirectory, snapshotFileName,
  });
  if (!snapshot.ok) return result("snapshot_export_authorization_snapshot_invalid", { cause: snapshot.reason });
  if (snapshot.snapshotSha256 !== inspected.snapshotSha256 || snapshot.snapshotFileName !== inspected.snapshotFileName) {
    return result("snapshot_export_authorization_snapshot_mismatch");
  }
  return success("snapshot_export_authorization_verified", read.authorization, {
    exportAuthorized: true,
    snapshotVerified: true,
  });
}
