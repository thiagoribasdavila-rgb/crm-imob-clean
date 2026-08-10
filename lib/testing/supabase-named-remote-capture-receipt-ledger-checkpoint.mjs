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
  NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_SCHEMA,
  verifyNamedRemoteCaptureReceiptLedger,
} from "./supabase-named-remote-capture-receipt-ledger.mjs";

export const NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_SCHEMA =
  "atlas.named_remote_capture_receipt_ledger_checkpoint.v1";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const CHECKPOINT_FILE_PATTERN = /^([a-f0-9]{64})\.json$/;
const MAX_CHECKPOINT_BYTES = 16 * 1024;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
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

function validIso(value) {
  if (typeof value !== "string") return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString() === value;
}

function insideRoot(root, candidate, { allowRoot = false } = {}) {
  const path = relative(root, candidate);
  if (path === "") return allowRoot;
  return path !== ".." && !path.startsWith(`..${sep}`) && !path.startsWith(sep);
}

function result(reason, extra = {}) {
  return {
    ok: false,
    reason,
    checkpointVerified: false,
    currentLedgerMatched: false,
    localCheckpointWritten: false,
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

function safeCheckpointRead(path) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(descriptor);
    if (!stat.isFile()) return result("checkpoint_path_not_regular_file");
    if ((stat.mode & 0o777) !== 0o600) return result("checkpoint_file_mode_invalid");
    if (stat.size > MAX_CHECKPOINT_BYTES) return result("checkpoint_file_too_large");
    const raw = readFileSync(descriptor, "utf8");
    try {
      return { ok: true, raw, checkpoint: JSON.parse(raw) };
    } catch {
      return result("checkpoint_json_invalid");
    }
  } catch (error) {
    if (error?.code === "ELOOP") return result("checkpoint_path_symlink_refused");
    return result("checkpoint_read_failed");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validateCheckpoint(checkpoint, hashFromFile) {
  if (
    !checkpoint ||
    checkpoint.schemaVersion !== NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_SCHEMA ||
    checkpoint.phase !== 189 ||
    !validIso(checkpoint.generatedAt) ||
    !SHA256_PATTERN.test(checkpoint.checkpointSha256 ?? "") ||
    checkpoint.checkpointSha256 !== hashFromFile
  ) return "checkpoint_envelope_invalid";

  const ledger = checkpoint.ledger;
  if (
    ledger?.schemaVersion !== NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_SCHEMA ||
    !SHA256_PATTERN.test(ledger?.ledgerSha256 ?? "") ||
    !Number.isSafeInteger(ledger?.receiptCount) || ledger.receiptCount < 0 ||
    !Number.isSafeInteger(ledger?.acceptedCount) || ledger.acceptedCount < 0 ||
    !Number.isSafeInteger(ledger?.rejectedCount) || ledger.rejectedCount < 0 ||
    ledger.acceptedCount + ledger.rejectedCount !== ledger.receiptCount ||
    (ledger.firstRecordedAt !== null && !validIso(ledger.firstRecordedAt)) ||
    (ledger.lastRecordedAt !== null && !validIso(ledger.lastRecordedAt)) ||
    (ledger.receiptCount === 0 &&
      (ledger.firstRecordedAt !== null || ledger.lastRecordedAt !== null)) ||
    (ledger.receiptCount > 0 &&
      (!ledger.firstRecordedAt || !ledger.lastRecordedAt ||
        ledger.firstRecordedAt > ledger.lastRecordedAt))
  ) return "checkpoint_ledger_summary_invalid";

  if (
    checkpoint.privacy?.rawReceiptsIncluded !== false ||
    checkpoint.privacy?.credentialsIncluded !== false ||
    checkpoint.privacy?.personalDataIncluded !== false
  ) return "checkpoint_privacy_contract_invalid";
  if (
    checkpoint.execution?.remoteContacted !== false ||
    checkpoint.execution?.remoteWriteExecuted !== false ||
    checkpoint.execution?.databaseWriteExecuted !== false ||
    checkpoint.execution?.migrationApplied !== false ||
    checkpoint.execution?.buildExecuted !== false ||
    checkpoint.execution?.zipGenerated !== false ||
    checkpoint.execution?.deployExecuted !== false
  ) return "checkpoint_execution_contract_invalid";

  const { checkpointSha256, ...withoutHash } = checkpoint;
  if (sha256(serialized(withoutHash)) !== checkpointSha256) {
    return "checkpoint_hash_mismatch";
  }
  return null;
}

function resolvePrivateDirectory(root, directory, { create = false } = {}) {
  if (!directory) return result("checkpoint_directory_required");
  const absoluteRoot = resolve(root);
  const absoluteDirectory = resolve(absoluteRoot, directory);
  if (!insideRoot(absoluteRoot, absoluteDirectory, { allowRoot: false })) {
    return result("checkpoint_directory_outside_root");
  }

  try {
    const physicalRoot = realpathSync(absoluteRoot);
    if (create) {
      const physicalParent = realpathSync(dirname(absoluteDirectory));
      if (!insideRoot(physicalRoot, physicalParent, { allowRoot: true })) {
        return result("checkpoint_directory_symlink_escape");
      }
      try {
        const stat = lstatSync(absoluteDirectory);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          return result("checkpoint_directory_invalid");
        }
      } catch (error) {
        if (error?.code !== "ENOENT") return result("checkpoint_directory_unreadable");
        mkdirSync(absoluteDirectory, { mode: 0o700 });
        chmodSync(absoluteDirectory, 0o700);
      }
    }
    const physicalDirectory = realpathSync(absoluteDirectory);
    if (!insideRoot(physicalRoot, physicalDirectory, { allowRoot: false })) {
      return result("checkpoint_directory_symlink_escape");
    }
    const stat = lstatSync(physicalDirectory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return result("checkpoint_directory_invalid");
    if ((stat.mode & 0o777) !== 0o700) return result("checkpoint_directory_mode_invalid");
    return { ok: true, physicalDirectory };
  } catch {
    return result("checkpoint_directory_unreadable");
  }
}

function successfulResult(reason, checkpoint, extra = {}) {
  return {
    ok: true,
    reason,
    checkpointVerified: true,
    currentLedgerMatched: true,
    checkpointSha256: checkpoint.checkpointSha256,
    ledgerSha256: checkpoint.ledger.ledgerSha256,
    checkpointFileName: `${checkpoint.checkpointSha256}.json`,
    summary: {
      receiptCount: checkpoint.ledger.receiptCount,
      acceptedCount: checkpoint.ledger.acceptedCount,
      rejectedCount: checkpoint.ledger.rejectedCount,
      firstRecordedAt: checkpoint.ledger.firstRecordedAt,
      lastRecordedAt: checkpoint.ledger.lastRecordedAt,
    },
    localCheckpointWritten: false,
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

export function inspectNamedRemoteCaptureReceiptLedgerCheckpoint({
  root = process.cwd(),
  checkpointDirectory,
  checkpointFileName,
} = {}) {
  if (!CHECKPOINT_FILE_PATTERN.test(checkpointFileName ?? "")) {
    return result("checkpoint_file_name_invalid");
  }
  const directory = resolvePrivateDirectory(root, checkpointDirectory);
  if (!directory.ok) return directory;
  const checkpointPath = resolve(directory.physicalDirectory, checkpointFileName);
  if (!insideRoot(directory.physicalDirectory, checkpointPath, { allowRoot: false })) {
    return result("checkpoint_path_outside_directory");
  }
  const read = safeCheckpointRead(checkpointPath);
  if (!read.ok) return read;
  const hashFromFile = CHECKPOINT_FILE_PATTERN.exec(basename(checkpointPath))[1];
  const invalidReason = validateCheckpoint(read.checkpoint, hashFromFile);
  if (invalidReason) return result(invalidReason);
  return successfulResult("receipt_ledger_checkpoint_integrity_verified", read.checkpoint, {
    currentLedgerMatched: false,
  });
}

export function createNamedRemoteCaptureReceiptLedgerCheckpoint({
  root = process.cwd(),
  receiptDirectory,
  checkpointDirectory,
  generatedAt = new Date().toISOString(),
  maxReceipts,
} = {}) {
  if (!validIso(generatedAt)) return result("checkpoint_generated_at_invalid");
  const ledger = verifyNamedRemoteCaptureReceiptLedger({
    root,
    receiptDirectory,
    ...(maxReceipts === undefined ? {} : { maxReceipts }),
  });
  if (!ledger.ok) return result(ledger.reason);

  const directory = resolvePrivateDirectory(root, checkpointDirectory, { create: true });
  if (!directory.ok) return directory;
  const withoutHash = {
    schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_SCHEMA,
    phase: 189,
    generatedAt,
    ledger: {
      schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_SCHEMA,
      ledgerSha256: ledger.ledgerSha256,
      ...ledger.summary,
    },
    privacy: {
      rawReceiptsIncluded: false,
      credentialsIncluded: false,
      personalDataIncluded: false,
    },
    execution: {
      remoteContacted: false,
      remoteWriteExecuted: false,
      databaseWriteExecuted: false,
      migrationApplied: false,
      buildExecuted: false,
      zipGenerated: false,
      deployExecuted: false,
    },
  };
  const checkpoint = {
    ...withoutHash,
    checkpointSha256: sha256(serialized(withoutHash)),
  };
  const content = serialized(checkpoint);
  const checkpointPath = resolve(
    directory.physicalDirectory,
    `${checkpoint.checkpointSha256}.json`,
  );

  let descriptor;
  try {
    descriptor = openSync(
      checkpointPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    writeFileSync(descriptor, content, "utf8");
    return successfulResult("receipt_ledger_checkpoint_created", checkpoint, {
      localCheckpointWritten: true,
    });
  } catch (error) {
    if (error?.code !== "EEXIST") return result("checkpoint_write_failed");
    const existing = safeCheckpointRead(checkpointPath);
    if (!existing.ok || existing.raw !== content) return result("checkpoint_collision_refused");
    return successfulResult("receipt_ledger_checkpoint_already_exists", checkpoint);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function verifyNamedRemoteCaptureReceiptLedgerCheckpoint({
  root = process.cwd(),
  receiptDirectory,
  checkpointDirectory,
  checkpointFileName,
  maxReceipts,
} = {}) {
  const inspected = inspectNamedRemoteCaptureReceiptLedgerCheckpoint({
    root,
    checkpointDirectory,
    checkpointFileName,
  });
  if (!inspected.ok) return inspected;

  const ledger = verifyNamedRemoteCaptureReceiptLedger({
    root,
    receiptDirectory,
    expectedLedgerSha256: inspected.ledgerSha256,
    ...(maxReceipts === undefined ? {} : { maxReceipts }),
  });
  if (!ledger.ok) {
    return result(
      ledger.reason === "receipt_ledger_replay_mismatch"
        ? "checkpoint_current_ledger_mismatch"
        : ledger.reason,
      ledger.ledgerSha256 ? { currentLedgerSha256: ledger.ledgerSha256 } : {},
    );
  }
  return successfulResult("receipt_ledger_checkpoint_verified", {
    checkpointSha256: inspected.checkpointSha256,
    ledger: {
      ledgerSha256: inspected.ledgerSha256,
      ...inspected.summary,
    },
  });
}
