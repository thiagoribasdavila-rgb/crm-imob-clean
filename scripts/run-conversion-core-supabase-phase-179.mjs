import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assessRemoteMigrationLedgerCollection } from "../lib/testing/supabase-remote-migration-ledger-collector.mjs";

const result = assessRemoteMigrationLedgerCollection({ argv: process.argv.slice(2) });
if (result.status === "remote_ledger_collected_read_only") {
  const directory = join(process.cwd(), "artifacts", "runtime", "phase-179");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, "remote-migration-ledger-summary.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    { mode: 0o600 },
  );
}
console.log(JSON.stringify(result, null, 2));
if (result.status.startsWith("refused_") || result.status === "collection_failed_safely") {
  process.exitCode = 1;
}

