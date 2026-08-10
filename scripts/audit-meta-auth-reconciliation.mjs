import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const runner = read("scripts/run-meta-auth-evidence-reconciliation.mjs");
const preflight = read("scripts/preflight-meta-auth-reconciliation.mjs");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };

for (const marker of [
  "ATLAS_AUTH_TEST_ENVIRONMENT",
  "ATLAS_AUTH_TEST_MUTATION_APPROVED",
  "ATLAS_AUTH_TEST_REQUIRE_EMPTY_CLONE",
  "run-meta-auth-isolated-rehearsal.mjs",
  "validateIsolatedRehearsalEvidence",
  "validateMetaAuthReconciliationEvidence",
]) expect(runner.includes(marker), `gate ou encadeamento ausente: ${marker}`);

for (const marker of [
  "canonicalJson",
  "sha256",
  "rawLogsPersisted: false",
  "containsSecrets: false",
  "containsPersonalData: false",
  "projectIdentifiersPersisted: false",
  "cleanup_not_reconciled",
  "residual_inventory_not_zero",
]) expect(runner.includes(marker), `evidencia/reconciliacao incompleta: ${marker}`);

for (const marker of [
  "ATLAS_AUTH_TEST_ARCHIVE_SANITIZED_EVIDENCE",
  "outputs/meta-phase-016",
  "mode: 0o700",
  "mode: 0o600",
  "flag: \"wx\"",
  "unapproved_or_residual_evidence_archive_forbidden",
  "atlas_meta_auth_reconciliation_manifest_v1",
]) expect(runner.includes(marker), `arquivo seguro incompleto: ${marker}`);

expect(!runner.includes("console.log(child.stdout") && !runner.includes("console.error(child.stderr"), "saida bruta do filho pode vazar");
expect(!runner.includes("SUPABASE_SECRET_KEY="), "segredo literal nao pode ser persistido");
expect(preflight.includes("forbidden_material_detected") && preflight.includes("residual_inventory_detected"), "preflight nao detecta material ou residuos");
expect(preflight.includes("productionAllowed: false"), "preflight abriu producao");

if (failures.length) {
  console.error("META AUTH RECONCILIATION AUDIT: REPROVADA");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("META AUTH RECONCILIATION AUDIT: aprovada — evidencia sanitizada, hash, deriva, limpeza zero e arquivo restrito estao protegidos.");
