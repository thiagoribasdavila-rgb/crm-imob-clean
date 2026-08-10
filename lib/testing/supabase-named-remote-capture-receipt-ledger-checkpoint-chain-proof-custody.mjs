import { createHash, createHmac, timingSafeEqual } from "node:crypto";
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
import { dirname, relative, resolve, sep } from "node:path";
import {
  NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_SCHEMA,
  inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProof,
} from "./supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof.mjs";

export const NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_SCHEMA =
  "atlas.named_remote_capture_receipt_ledger_checkpoint_chain_proof_custody.v1";

const HASH = /^[a-f0-9]{64}$/;
const FILE = /^([a-f0-9]{64})\.json$/;
const MAX_BYTES = 64 * 1024;
const MAX_CLAIM_BYTES = 512;
const MIN_KEY_BYTES = 32;
const MAX_KEY_BYTES = 4096;
const DOMAIN = "atlas.named_remote_capture_receipt_ledger_checkpoint_chain_proof_custody.v1";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const canonical = (value) => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]))
    : value;
const serialized = (value) => `${JSON.stringify(canonical(value), null, 2)}\n`;
const validIso = (value) => {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
};
const inside = (root, candidate, allowRoot = false) => {
  const path = relative(root, candidate);
  return path === "" ? allowRoot : path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith(sep);
};

function result(reason, extra = {}) {
  return {
    ok: false,
    reason,
    custodyVerified: false,
    sourceProofMatched: false,
    claimMatched: false,
    localCustodyWritten: false,
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
  if (!requested) return result("proof_custody_directory_required");
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, requested);
  if (!inside(absoluteRoot, target)) return result("proof_custody_directory_outside_root");
  try {
    const physicalRoot = realpathSync(absoluteRoot);
    if (create) {
      const parent = realpathSync(dirname(target));
      if (!inside(physicalRoot, parent, true)) return result("proof_custody_directory_symlink_escape");
      try {
        const stat = lstatSync(target);
        if (stat.isSymbolicLink() || !stat.isDirectory()) return result("proof_custody_directory_invalid");
      } catch (error) {
        if (error?.code !== "ENOENT") return result("proof_custody_directory_unreadable");
        mkdirSync(target, { mode: 0o700 });
        chmodSync(target, 0o700);
      }
    }
    const physical = realpathSync(target);
    if (!inside(physicalRoot, physical)) return result("proof_custody_directory_symlink_escape");
    const stat = lstatSync(physical);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return result("proof_custody_directory_invalid");
    if ((stat.mode & 0o777) !== 0o700) return result("proof_custody_directory_mode_invalid");
    return { ok: true, physical };
  } catch {
    return result("proof_custody_directory_unreadable");
  }
}

function claim(value, name) {
  if (typeof value !== "string") return result(`proof_custody_${name}_required`);
  const normalized = value.trim();
  const size = Buffer.byteLength(normalized, "utf8");
  if (size < 1 || size > MAX_CLAIM_BYTES) return result(`proof_custody_${name}_invalid`);
  return { ok: true, normalized };
}

function keyBytes(value) {
  let key;
  if (typeof value === "string") key = Buffer.from(value, "utf8");
  else if (Buffer.isBuffer(value) || value instanceof Uint8Array) key = Buffer.from(value);
  else return result("proof_custody_pseudonymization_key_required");
  if (key.length < MIN_KEY_BYTES || key.length > MAX_KEY_BYTES) {
    return result("proof_custody_pseudonymization_key_invalid");
  }
  return { ok: true, key };
}

function pseudonym(kind, value, key) {
  return createHmac("sha256", key).update(`${DOMAIN}:${kind}:`).update(value, "utf8").digest("hex");
}

function equalHash(left, right) {
  return HASH.test(left ?? "") && HASH.test(right ?? "") &&
    timingSafeEqual(Buffer.from(left, "hex"), Buffer.from(right, "hex"));
}

function validateCustody(record, fileHash) {
  if (
    record?.schemaVersion !== NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_SCHEMA ||
    record.phase !== 192 || !validIso(record.recordedAt) ||
    record.pseudonymization?.algorithm !== "HMAC-SHA256" ||
    record.pseudonymization?.domain !== DOMAIN ||
    !HASH.test(record.pseudonymization?.reviewerHmacSha256 ?? "") ||
    !HASH.test(record.pseudonymization?.purposeHmacSha256 ?? "") ||
    record.sourceProof?.schemaVersion !== NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_SCHEMA ||
    !HASH.test(record.sourceProof?.proofSha256 ?? "") ||
    record.sourceProof?.fileName !== `${record.sourceProof?.proofSha256}.json` ||
    !HASH.test(record.sourceProof?.chainDigestSha256 ?? "") ||
    !HASH.test(record.sourceProof?.headEntrySha256 ?? "") ||
    !Number.isSafeInteger(record.sourceProof?.entryCount) || record.sourceProof.entryCount < 1 ||
    !HASH.test(record.custodyRecordSha256 ?? "") || record.custodyRecordSha256 !== fileHash
  ) return "proof_custody_envelope_invalid";
  if (
    record.privacy?.rawReviewerIncluded !== false ||
    record.privacy?.rawPurposeIncluded !== false ||
    record.privacy?.pseudonymizationKeyIncluded !== false ||
    record.privacy?.credentialsIncluded !== false ||
    record.privacy?.personalDataIncluded !== false
  ) return "proof_custody_privacy_contract_invalid";
  if (
    record.execution?.remoteContacted !== false ||
    record.execution?.remoteWriteExecuted !== false ||
    record.execution?.databaseWriteExecuted !== false ||
    record.execution?.migrationApplied !== false ||
    record.execution?.buildExecuted !== false ||
    record.execution?.zipGenerated !== false ||
    record.execution?.deployExecuted !== false
  ) return "proof_custody_execution_contract_invalid";
  const { custodyRecordSha256, ...withoutHash } = record;
  return sha256(serialized(withoutHash)) === custodyRecordSha256 ? null : "proof_custody_hash_mismatch";
}

function readCustody(path, fileHash) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile()) return result("proof_custody_not_regular_file");
    if ((stat.mode & 0o777) !== 0o600) return result("proof_custody_file_mode_invalid");
    if (stat.size > MAX_BYTES) return result("proof_custody_too_large");
    let record;
    try {
      record = JSON.parse(readFileSync(fd, "utf8"));
    } catch {
      return result("proof_custody_json_invalid");
    }
    const invalid = validateCustody(record, fileHash);
    return invalid ? result(invalid) : { ok: true, record };
  } catch (error) {
    return result(error?.code === "ELOOP" ? "proof_custody_symlink_refused" : "proof_custody_read_failed");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function success(reason, record, extra = {}) {
  return {
    ok: true,
    reason,
    custodyVerified: true,
    custodyRecordSha256: record.custodyRecordSha256,
    custodyFileName: `${record.custodyRecordSha256}.json`,
    sourceProofSha256: record.sourceProof.proofSha256,
    sourceProofMatched: false,
    claimMatched: false,
    localCustodyWritten: false,
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

function locateCustody({ root, custodyDirectory, custodyFileName }) {
  if (!FILE.test(custodyFileName ?? "")) return result("proof_custody_file_name_invalid");
  const target = directory(root, custodyDirectory);
  if (!target.ok) return target;
  const path = resolve(target.physical, custodyFileName);
  if (!inside(target.physical, path)) return result("proof_custody_path_outside_directory");
  return readCustody(path, FILE.exec(custodyFileName)[1]);
}

export function inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody({
  root = process.cwd(), custodyDirectory, custodyFileName,
} = {}) {
  const read = locateCustody({ root, custodyDirectory, custodyFileName });
  return read.ok ? success("proof_custody_verified", read.record) : read;
}

export function createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustody({
  root = process.cwd(), proofDirectory, proofFileName, custodyDirectory,
  reviewer, purpose, pseudonymizationKey, recordedAt = new Date().toISOString(),
} = {}) {
  if (!validIso(recordedAt)) return result("proof_custody_recorded_at_invalid");
  const reviewerClaim = claim(reviewer, "reviewer");
  if (!reviewerClaim.ok) return reviewerClaim;
  const purposeClaim = claim(purpose, "purpose");
  if (!purposeClaim.ok) return purposeClaim;
  const secret = keyBytes(pseudonymizationKey);
  if (!secret.ok) return secret;
  const proof = inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProof({ root, proofDirectory, proofFileName });
  if (!proof.ok) return result(proof.reason);
  const target = directory(root, custodyDirectory, true);
  if (!target.ok) return target;
  const withoutHash = {
    schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_SCHEMA,
    phase: 192,
    recordedAt,
    sourceProof: {
      schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_SCHEMA,
      proofSha256: proof.proofSha256,
      fileName: proof.proofFileName,
      chainDigestSha256: proof.chainDigestSha256,
      headEntrySha256: proof.headEntrySha256,
      entryCount: proof.entryCount,
    },
    pseudonymization: {
      algorithm: "HMAC-SHA256",
      domain: DOMAIN,
      reviewerHmacSha256: pseudonym("reviewer", reviewerClaim.normalized, secret.key),
      purposeHmacSha256: pseudonym("purpose", purposeClaim.normalized, secret.key),
    },
    privacy: {
      rawReviewerIncluded: false,
      rawPurposeIncluded: false,
      pseudonymizationKeyIncluded: false,
      credentialsIncluded: false,
      personalDataIncluded: false,
    },
    execution: {
      remoteContacted: false, remoteWriteExecuted: false, databaseWriteExecuted: false,
      migrationApplied: false, buildExecuted: false, zipGenerated: false, deployExecuted: false,
    },
  };
  const record = { ...withoutHash, custodyRecordSha256: sha256(serialized(withoutHash)) };
  const content = serialized(record);
  const path = resolve(target.physical, `${record.custodyRecordSha256}.json`);
  let fd;
  try {
    fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeFileSync(fd, content, "utf8");
    return success("proof_custody_created", record, { localCustodyWritten: true });
  } catch (error) {
    if (error?.code !== "EEXIST") return result("proof_custody_write_failed");
    const existing = readCustody(path, record.custodyRecordSha256);
    if (!existing.ok || serialized(existing.record) !== content) return result("proof_custody_collision_refused");
    return success("proof_custody_already_exists", record);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyAgainstProof({
  root = process.cwd(), custodyDirectory, custodyFileName, proofDirectory, proofFileName,
} = {}) {
  const custody = locateCustody({ root, custodyDirectory, custodyFileName });
  if (!custody.ok) return custody;
  const proof = inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProof({ root, proofDirectory, proofFileName });
  if (!proof.ok) return result("proof_custody_source_proof_invalid", { cause: proof.reason });
  const record = custody.record;
  if (
    record.sourceProof.proofSha256 !== proof.proofSha256 ||
    record.sourceProof.fileName !== proof.proofFileName ||
    record.sourceProof.chainDigestSha256 !== proof.chainDigestSha256 ||
    record.sourceProof.headEntrySha256 !== proof.headEntrySha256 ||
    record.sourceProof.entryCount !== proof.entryCount
  ) return result("proof_custody_source_proof_mismatch");
  return success("proof_custody_source_proof_matched", record, { sourceProofMatched: true });
}

export function verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyClaim({
  root = process.cwd(), custodyDirectory, custodyFileName,
  reviewer, purpose, pseudonymizationKey,
} = {}) {
  const reviewerClaim = claim(reviewer, "reviewer");
  if (!reviewerClaim.ok) return reviewerClaim;
  const purposeClaim = claim(purpose, "purpose");
  if (!purposeClaim.ok) return purposeClaim;
  const secret = keyBytes(pseudonymizationKey);
  if (!secret.ok) return secret;
  const custody = locateCustody({ root, custodyDirectory, custodyFileName });
  if (!custody.ok) return custody;
  const record = custody.record;
  const matched = equalHash(
    record.pseudonymization.reviewerHmacSha256,
    pseudonym("reviewer", reviewerClaim.normalized, secret.key),
  ) && equalHash(
    record.pseudonymization.purposeHmacSha256,
    pseudonym("purpose", purposeClaim.normalized, secret.key),
  );
  return matched
    ? success("proof_custody_claim_matched", record, { claimMatched: true })
    : result("proof_custody_claim_mismatch");
}
