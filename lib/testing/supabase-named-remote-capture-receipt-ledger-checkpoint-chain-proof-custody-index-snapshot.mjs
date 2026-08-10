import { createHash } from "node:crypto";
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
  NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SCHEMA,
  inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexEntry,
  verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex,
} from "./supabase-named-remote-capture-receipt-ledger-checkpoint-chain-proof-custody-index.mjs";

export const NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_SCHEMA =
  "atlas.named_remote_capture_receipt_ledger_checkpoint_chain_proof_custody_index_snapshot.v1";

const HASH = /^[a-f0-9]{64}$/;
const FILE = /^([a-f0-9]{64})\.json$/;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_ENTRIES = 10_000;

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
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

function result(reason, extra = {}) {
  return {
    ok: false,
    reason,
    snapshotVerified: false,
    sourceIndexVerified: false,
    localSnapshotWritten: false,
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
  if (!requested) return result("proof_custody_index_snapshot_directory_required");
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, requested);
  if (!inside(absoluteRoot, target)) return result("proof_custody_index_snapshot_directory_outside_root");
  try {
    const physicalRoot = realpathSync(absoluteRoot);
    if (create) {
      const parent = realpathSync(dirname(target));
      if (!inside(physicalRoot, parent, true)) return result("proof_custody_index_snapshot_directory_symlink_escape");
      try {
        const stat = lstatSync(target);
        if (stat.isSymbolicLink() || !stat.isDirectory()) return result("proof_custody_index_snapshot_directory_invalid");
      } catch (error) {
        if (error?.code !== "ENOENT") return result("proof_custody_index_snapshot_directory_unreadable");
        mkdirSync(target, { mode: 0o700 });
        chmodSync(target, 0o700);
      }
    }
    const physical = realpathSync(target);
    if (!inside(physicalRoot, physical)) return result("proof_custody_index_snapshot_directory_symlink_escape");
    const stat = lstatSync(physical);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return result("proof_custody_index_snapshot_directory_invalid");
    if ((stat.mode & 0o777) !== 0o700) return result("proof_custody_index_snapshot_directory_mode_invalid");
    return { ok: true, physical };
  } catch {
    return result("proof_custody_index_snapshot_directory_unreadable");
  }
}

function readSnapshot(path) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile()) return result("proof_custody_index_snapshot_not_regular_file");
    if ((stat.mode & 0o777) !== 0o600) return result("proof_custody_index_snapshot_mode_invalid");
    if (stat.size > MAX_BYTES) return result("proof_custody_index_snapshot_too_large");
    const raw = readFileSync(fd, "utf8");
    try {
      return { ok: true, raw, snapshot: JSON.parse(raw) };
    } catch {
      return result("proof_custody_index_snapshot_json_invalid");
    }
  } catch (error) {
    return result(error?.code === "ELOOP"
      ? "proof_custody_index_snapshot_symlink_refused"
      : "proof_custody_index_snapshot_read_failed");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function validateSnapshot(snapshot, fileHash) {
  if (!exactKeys(snapshot, ["schemaVersion", "phase", "createdAt", "source", "records", "privacy", "execution", "snapshotSha256"])) {
    return "proof_custody_index_snapshot_envelope_invalid";
  }
  if (
    snapshot.schemaVersion !== NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_SCHEMA ||
    snapshot.phase !== 194 || !validIso(snapshot.createdAt) ||
    !HASH.test(snapshot.snapshotSha256 ?? "") || snapshot.snapshotSha256 !== fileHash ||
    !exactKeys(snapshot.source, ["indexSchemaVersion", "indexDigestSha256", "headEntrySha256", "genesisEntrySha256", "entryCount"]) ||
    snapshot.source.indexSchemaVersion !== NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SCHEMA ||
    !HASH.test(snapshot.source.indexDigestSha256 ?? "") ||
    !HASH.test(snapshot.source.headEntrySha256 ?? "") ||
    !HASH.test(snapshot.source.genesisEntrySha256 ?? "") ||
    !Number.isSafeInteger(snapshot.source.entryCount) || snapshot.source.entryCount < 1 || snapshot.source.entryCount > MAX_ENTRIES ||
    !Array.isArray(snapshot.records) || snapshot.records.length !== snapshot.source.entryCount
  ) return "proof_custody_index_snapshot_envelope_invalid";
  if (!exactKeys(snapshot.privacy, ["claimsIncluded", "credentialsIncluded", "personalDataIncluded"]) ||
    snapshot.privacy.claimsIncluded !== false || snapshot.privacy.credentialsIncluded !== false ||
    snapshot.privacy.personalDataIncluded !== false) {
    return "proof_custody_index_snapshot_privacy_contract_invalid";
  }
  if (!exactKeys(snapshot.execution, ["remoteContacted", "remoteWriteExecuted", "databaseWriteExecuted", "migrationApplied", "buildExecuted", "zipGenerated", "deployExecuted"]) ||
    Object.values(snapshot.execution).some((value) => value !== false)) {
    return "proof_custody_index_snapshot_execution_contract_invalid";
  }
  const entries = new Set();
  const custody = new Set();
  for (let position = 0; position < snapshot.records.length; position += 1) {
    const record = snapshot.records[position];
    if (!exactKeys(record, ["positionFromHead", "sequence", "entrySha256", "custodyRecordSha256", "sourceProofSha256", "previousEntrySha256"]) ||
      record.positionFromHead !== position || record.sequence !== snapshot.records.length - position - 1 ||
      !HASH.test(record.entrySha256 ?? "") || !HASH.test(record.custodyRecordSha256 ?? "") ||
      !HASH.test(record.sourceProofSha256 ?? "") ||
      (record.previousEntrySha256 !== null && !HASH.test(record.previousEntrySha256 ?? "")) ||
      entries.has(record.entrySha256) || custody.has(record.custodyRecordSha256)) {
      return "proof_custody_index_snapshot_record_invalid";
    }
    const expectedPrevious = snapshot.records[position + 1]?.entrySha256 ?? null;
    if (record.previousEntrySha256 !== expectedPrevious) return "proof_custody_index_snapshot_chain_invalid";
    entries.add(record.entrySha256);
    custody.add(record.custodyRecordSha256);
  }
  if (snapshot.records[0].entrySha256 !== snapshot.source.headEntrySha256 ||
    snapshot.records.at(-1).entrySha256 !== snapshot.source.genesisEntrySha256) {
    return "proof_custody_index_snapshot_boundary_invalid";
  }
  const { snapshotSha256, ...withoutHash } = snapshot;
  return sha256(serialized(withoutHash)) === snapshotSha256
    ? null
    : "proof_custody_index_snapshot_hash_mismatch";
}

function success(reason, snapshot, extra = {}) {
  return {
    ok: true,
    reason,
    snapshotVerified: true,
    snapshotSha256: snapshot.snapshotSha256,
    snapshotFileName: `${snapshot.snapshotSha256}.json`,
    entryCount: snapshot.source.entryCount,
    headEntrySha256: snapshot.source.headEntrySha256,
    indexDigestSha256: snapshot.source.indexDigestSha256,
    source: snapshot.source,
    records: snapshot.records,
    sourceIndexVerified: false,
    localSnapshotWritten: false,
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

export function inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
  root = process.cwd(), snapshotDirectory, snapshotFileName,
} = {}) {
  if (!FILE.test(snapshotFileName ?? "")) return result("proof_custody_index_snapshot_file_name_invalid");
  const target = directory(root, snapshotDirectory);
  if (!target.ok) return target;
  const path = resolve(target.physical, snapshotFileName);
  if (!inside(target.physical, path)) return result("proof_custody_index_snapshot_path_outside_directory");
  const read = readSnapshot(path);
  if (!read.ok) return read;
  const fileHash = FILE.exec(basename(path))[1];
  const invalid = validateSnapshot(read.snapshot, fileHash);
  return invalid ? result(invalid) : success("proof_custody_index_snapshot_valid", read.snapshot);
}

export function createNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
  root = process.cwd(), custodyDirectory, indexDirectory, headEntryFileName, snapshotDirectory,
  createdAt = new Date().toISOString(), maxEntries = MAX_ENTRIES,
} = {}) {
  if (!validIso(createdAt)) return result("proof_custody_index_snapshot_created_at_invalid");
  const source = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex({
    root, custodyDirectory, indexDirectory, headEntryFileName, maxEntries,
  });
  if (!source.ok) return result("proof_custody_index_snapshot_source_invalid", { cause: source.reason });
  const target = directory(root, snapshotDirectory, true);
  if (!target.ok) return target;
  const records = [];
  for (const [positionFromHead, entrySha256] of source.entryHashes.entries()) {
    const inspected = inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexEntry({
      root, indexDirectory, entryFileName: `${entrySha256}.json`,
    });
    if (!inspected.ok) return result("proof_custody_index_snapshot_source_entry_invalid", { cause: inspected.reason });
    records.push({
      positionFromHead,
      sequence: inspected.sequence,
      entrySha256,
      custodyRecordSha256: inspected.custodyRecordSha256,
      sourceProofSha256: inspected.sourceProofSha256,
      previousEntrySha256: inspected.previousEntrySha256,
    });
  }
  const withoutHash = {
    schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SNAPSHOT_SCHEMA,
    phase: 194,
    createdAt,
    source: {
      indexSchemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_CUSTODY_INDEX_SCHEMA,
      indexDigestSha256: source.indexDigestSha256,
      headEntrySha256: source.headEntrySha256,
      genesisEntrySha256: source.genesisEntrySha256,
      entryCount: source.entryCount,
    },
    records,
    privacy: { claimsIncluded: false, credentialsIncluded: false, personalDataIncluded: false },
    execution: {
      remoteContacted: false, remoteWriteExecuted: false, databaseWriteExecuted: false,
      migrationApplied: false, buildExecuted: false, zipGenerated: false, deployExecuted: false,
    },
  };
  const snapshot = { ...withoutHash, snapshotSha256: sha256(serialized(withoutHash)) };
  const content = serialized(snapshot);
  const path = resolve(target.physical, `${snapshot.snapshotSha256}.json`);
  let fd;
  try {
    fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeFileSync(fd, content, "utf8");
    return success("proof_custody_index_snapshot_created", snapshot, {
      sourceIndexVerified: true, localSnapshotWritten: true,
    });
  } catch (error) {
    if (error?.code !== "EEXIST") return result("proof_custody_index_snapshot_write_failed");
    const existing = readSnapshot(path);
    if (!existing.ok || existing.raw !== content) return result("proof_custody_index_snapshot_collision_refused");
    return success("proof_custody_index_snapshot_already_exists", snapshot, { sourceIndexVerified: true });
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
  root = process.cwd(), snapshotDirectory, snapshotFileName, custodyDirectory, indexDirectory,
  headEntryFileName, maxEntries = MAX_ENTRIES,
} = {}) {
  const inspected = inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexSnapshot({
    root, snapshotDirectory, snapshotFileName,
  });
  if (!inspected.ok) return inspected;
  const sourceRequested = [custodyDirectory, indexDirectory, headEntryFileName].some((value) => value !== undefined);
  if (!sourceRequested) return { ...inspected, reason: "proof_custody_index_snapshot_portable_verified" };
  if (![custodyDirectory, indexDirectory, headEntryFileName].every(Boolean)) {
    return result("proof_custody_index_snapshot_source_arguments_incomplete");
  }
  const source = verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndex({
    root, custodyDirectory, indexDirectory, headEntryFileName, maxEntries,
  });
  if (!source.ok) return result("proof_custody_index_snapshot_source_invalid", { cause: source.reason });
  if (source.indexDigestSha256 !== inspected.indexDigestSha256 ||
    source.headEntrySha256 !== inspected.headEntrySha256 || source.entryCount !== inspected.entryCount) {
    return result("proof_custody_index_snapshot_source_mismatch");
  }
  if (
    source.genesisEntrySha256 !== inspected.source.genesisEntrySha256 ||
    source.entryHashes.some((hash, position) => hash !== inspected.records[position]?.entrySha256) ||
    source.custodyRecordHashes.some((hash, position) => hash !== inspected.records[position]?.custodyRecordSha256)
  ) return result("proof_custody_index_snapshot_source_mismatch");
  for (const record of inspected.records) {
    const entry = inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProofCustodyIndexEntry({
      root, indexDirectory, entryFileName: `${record.entrySha256}.json`,
    });
    if (!entry.ok || entry.sequence !== record.sequence ||
      entry.sourceProofSha256 !== record.sourceProofSha256 ||
      entry.previousEntrySha256 !== record.previousEntrySha256) {
      return result("proof_custody_index_snapshot_source_mismatch");
    }
  }
  return { ...inspected, reason: "proof_custody_index_snapshot_source_verified", sourceIndexVerified: true };
}
