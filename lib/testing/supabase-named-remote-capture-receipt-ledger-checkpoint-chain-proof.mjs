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
import { dirname, relative, resolve, sep } from "node:path";
import {
  NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_SCHEMA,
  verifyNamedRemoteCaptureReceiptLedgerCheckpointChain,
} from "./supabase-named-remote-capture-receipt-ledger-checkpoint-chain.mjs";

export const NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_SCHEMA =
  "atlas.named_remote_capture_receipt_ledger_checkpoint_chain_proof.v1";

const HASH = /^[a-f0-9]{64}$/;
const FILE = /^([a-f0-9]{64})\.json$/;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ENTRIES = 10_000;
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
    proofVerified: false,
    sourceChainMatched: false,
    localProofWritten: false,
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
  if (!requested) return result("checkpoint_chain_proof_directory_required");
  const absoluteRoot = resolve(root);
  const target = resolve(absoluteRoot, requested);
  if (!inside(absoluteRoot, target)) return result("checkpoint_chain_proof_directory_outside_root");
  try {
    const physicalRoot = realpathSync(absoluteRoot);
    if (create) {
      const parent = realpathSync(dirname(target));
      if (!inside(physicalRoot, parent, true)) return result("checkpoint_chain_proof_directory_symlink_escape");
      try {
        const stat = lstatSync(target);
        if (stat.isSymbolicLink() || !stat.isDirectory()) return result("checkpoint_chain_proof_directory_invalid");
      } catch (error) {
        if (error?.code !== "ENOENT") return result("checkpoint_chain_proof_directory_unreadable");
        mkdirSync(target, { mode: 0o700 });
        chmodSync(target, 0o700);
      }
    }
    const physical = realpathSync(target);
    if (!inside(physicalRoot, physical)) return result("checkpoint_chain_proof_directory_symlink_escape");
    const stat = lstatSync(physical);
    if (!stat.isDirectory() || stat.isSymbolicLink()) return result("checkpoint_chain_proof_directory_invalid");
    if ((stat.mode & 0o777) !== 0o700) return result("checkpoint_chain_proof_directory_mode_invalid");
    return { ok: true, physical };
  } catch {
    return result("checkpoint_chain_proof_directory_unreadable");
  }
}

function validateProof(proof, fileHash) {
  const entryHashes = proof?.chain?.entryHashes;
  const checkpointHashes = proof?.chain?.checkpointHashes;
  if (
    proof?.schemaVersion !== NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_SCHEMA ||
    proof.phase !== 191 || !validIso(proof.generatedAt) ||
    !HASH.test(proof.proofSha256 ?? "") || proof.proofSha256 !== fileHash ||
    proof.chain?.schemaVersion !== NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_SCHEMA ||
    !HASH.test(proof.chain?.headEntrySha256 ?? "") ||
    !HASH.test(proof.chain?.genesisEntrySha256 ?? "") ||
    !HASH.test(proof.chain?.chainDigestSha256 ?? "") ||
    !Number.isSafeInteger(proof.chain?.entryCount) || proof.chain.entryCount < 1 ||
    proof.chain.entryCount > MAX_ENTRIES ||
    proof.chain.firstSequence !== 0 ||
    proof.chain.lastSequence !== proof.chain.entryCount - 1 ||
    !Array.isArray(entryHashes) || !Array.isArray(checkpointHashes) ||
    entryHashes.length !== proof.chain.entryCount || checkpointHashes.length !== proof.chain.entryCount ||
    entryHashes.some((hash) => !HASH.test(hash)) || checkpointHashes.some((hash) => !HASH.test(hash)) ||
    new Set(entryHashes).size !== entryHashes.length ||
    entryHashes[0] !== proof.chain.headEntrySha256 ||
    entryHashes.at(-1) !== proof.chain.genesisEntrySha256
  ) return "checkpoint_chain_proof_envelope_invalid";
  if (
    proof.privacy?.rawReceiptsIncluded !== false ||
    proof.privacy?.checkpointPayloadsIncluded !== false ||
    proof.privacy?.credentialsIncluded !== false ||
    proof.privacy?.personalDataIncluded !== false
  ) return "checkpoint_chain_proof_privacy_contract_invalid";
  if (
    proof.execution?.remoteContacted !== false ||
    proof.execution?.remoteWriteExecuted !== false ||
    proof.execution?.databaseWriteExecuted !== false ||
    proof.execution?.migrationApplied !== false ||
    proof.execution?.buildExecuted !== false ||
    proof.execution?.zipGenerated !== false ||
    proof.execution?.deployExecuted !== false
  ) return "checkpoint_chain_proof_execution_contract_invalid";
  const chainSummary = {
    schemaVersion: proof.chain.schemaVersion,
    headEntrySha256: proof.chain.headEntrySha256,
    genesisEntrySha256: proof.chain.genesisEntrySha256,
    entryCount: proof.chain.entryCount,
    entryHashes,
    checkpointHashes,
  };
  if (sha256(serialized(chainSummary)) !== proof.chain.chainDigestSha256) {
    return "checkpoint_chain_proof_digest_mismatch";
  }
  const { proofSha256, ...withoutHash } = proof;
  return sha256(serialized(withoutHash)) === proofSha256 ? null : "checkpoint_chain_proof_hash_mismatch";
}

function readProof(path, fileHash) {
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = fstatSync(fd);
    if (!stat.isFile()) return result("checkpoint_chain_proof_not_regular_file");
    if ((stat.mode & 0o777) !== 0o600) return result("checkpoint_chain_proof_file_mode_invalid");
    if (stat.size > MAX_BYTES) return result("checkpoint_chain_proof_too_large");
    let proof;
    try {
      proof = JSON.parse(readFileSync(fd, "utf8"));
    } catch {
      return result("checkpoint_chain_proof_json_invalid");
    }
    const invalid = validateProof(proof, fileHash);
    return invalid ? result(invalid) : { ok: true, proof };
  } catch (error) {
    return result(error?.code === "ELOOP" ? "checkpoint_chain_proof_symlink_refused" : "checkpoint_chain_proof_read_failed");
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

function success(reason, proof, extra = {}) {
  return {
    ok: true,
    reason,
    proofVerified: true,
    proofSha256: proof.proofSha256,
    proofFileName: `${proof.proofSha256}.json`,
    chainDigestSha256: proof.chain.chainDigestSha256,
    headEntrySha256: proof.chain.headEntrySha256,
    entryCount: proof.chain.entryCount,
    sourceChainMatched: false,
    localProofWritten: false,
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

export function inspectNamedRemoteCaptureReceiptLedgerCheckpointChainProof({
  root = process.cwd(), proofDirectory, proofFileName,
} = {}) {
  if (!FILE.test(proofFileName ?? "")) return result("checkpoint_chain_proof_file_name_invalid");
  const target = directory(root, proofDirectory);
  if (!target.ok) return target;
  const path = resolve(target.physical, proofFileName);
  if (!inside(target.physical, path)) return result("checkpoint_chain_proof_path_outside_directory");
  const read = readProof(path, FILE.exec(proofFileName)[1]);
  return read.ok ? success("checkpoint_chain_proof_verified", read.proof) : read;
}

export function createNamedRemoteCaptureReceiptLedgerCheckpointChainProof({
  root = process.cwd(), checkpointDirectory, chainDirectory, headEntryFileName,
  proofDirectory, generatedAt = new Date().toISOString(),
} = {}) {
  if (!validIso(generatedAt)) return result("checkpoint_chain_proof_generated_at_invalid");
  const chain = verifyNamedRemoteCaptureReceiptLedgerCheckpointChain({
    root, checkpointDirectory, chainDirectory, headEntryFileName,
  });
  if (!chain.ok) return result(chain.reason);
  const target = directory(root, proofDirectory, true);
  if (!target.ok) return target;
  const withoutHash = {
    schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_PROOF_SCHEMA,
    phase: 191,
    generatedAt,
    chain: {
      schemaVersion: NAMED_REMOTE_CAPTURE_RECEIPT_LEDGER_CHECKPOINT_CHAIN_SCHEMA,
      headEntrySha256: chain.headEntrySha256,
      genesisEntrySha256: chain.genesisEntrySha256,
      entryCount: chain.entryCount,
      firstSequence: 0,
      lastSequence: chain.entryCount - 1,
      entryHashes: chain.entryHashes,
      checkpointHashes: chain.checkpointHashes,
      chainDigestSha256: chain.chainDigestSha256,
    },
    privacy: {
      rawReceiptsIncluded: false,
      checkpointPayloadsIncluded: false,
      credentialsIncluded: false,
      personalDataIncluded: false,
    },
    execution: {
      remoteContacted: false, remoteWriteExecuted: false, databaseWriteExecuted: false,
      migrationApplied: false, buildExecuted: false, zipGenerated: false, deployExecuted: false,
    },
  };
  const proof = { ...withoutHash, proofSha256: sha256(serialized(withoutHash)) };
  const content = serialized(proof);
  const path = resolve(target.physical, `${proof.proofSha256}.json`);
  let fd;
  try {
    fd = openSync(path, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
    writeFileSync(fd, content, "utf8");
    return success("checkpoint_chain_proof_created", proof, { localProofWritten: true });
  } catch (error) {
    if (error?.code !== "EEXIST") return result("checkpoint_chain_proof_write_failed");
    const existing = readProof(path, proof.proofSha256);
    if (!existing.ok || serialized(existing.proof) !== content) {
      return result("checkpoint_chain_proof_collision_refused");
    }
    return success("checkpoint_chain_proof_already_exists", proof);
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function verifyNamedRemoteCaptureReceiptLedgerCheckpointChainProofAgainstSource({
  root = process.cwd(), proofDirectory, proofFileName,
  checkpointDirectory, chainDirectory, headEntryFileName,
} = {}) {
  if (!FILE.test(proofFileName ?? "")) return result("checkpoint_chain_proof_file_name_invalid");
  const target = directory(root, proofDirectory);
  if (!target.ok) return target;
  const path = resolve(target.physical, proofFileName);
  if (!inside(target.physical, path)) return result("checkpoint_chain_proof_path_outside_directory");
  const inspected = readProof(path, FILE.exec(proofFileName)[1]);
  if (!inspected.ok) return inspected;
  const proof = inspected.proof;
  const chain = verifyNamedRemoteCaptureReceiptLedgerCheckpointChain({
    root, checkpointDirectory, chainDirectory, headEntryFileName,
  });
  if (!chain.ok) return result("checkpoint_chain_proof_source_invalid", { cause: chain.reason });
  if (
    proof.chain.chainDigestSha256 !== chain.chainDigestSha256 ||
    proof.chain.headEntrySha256 !== chain.headEntrySha256 ||
    proof.chain.entryCount !== chain.entryCount
  ) return result("checkpoint_chain_proof_source_mismatch");
  return success("checkpoint_chain_proof_source_matched", proof, { sourceChainMatched: true });
}
