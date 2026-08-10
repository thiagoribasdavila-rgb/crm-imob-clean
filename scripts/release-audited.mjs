import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const date = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date()).replaceAll("-", "");
const explicitName = process.argv.find((arg) => arg.startsWith("--name="))?.slice(7);
const outputRoot = resolve(root, "dist/hostinger");
mkdirSync(outputRoot, { recursive: true });
let sequence = 1;
while (existsSync(resolve(outputRoot, `atlas-one-audited-${date}-r${String(sequence).padStart(3, "0")}.zip`)))
  sequence += 1;
const packageName = explicitName || `atlas-one-audited-${date}-r${String(sequence).padStart(3, "0")}.zip`;
if (!/^atlas-one-audited-\d{8}-r\d{3}\.zip$/.test(packageName))
  throw new Error("Nome inválido. Use atlas-one-audited-AAAAMMDD-rNNN.zip.");
const zipPath = resolve(outputRoot, packageName);
if (existsSync(zipPath)) throw new Error("A release já existe e não será sobrescrita.");

try { process.loadEnvFile?.(resolve(root, ".env.local")); } catch {}

const gates = [];
const run = (name, command, args, extraEnv = {}) => {
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    encoding: "utf8",
    stdio: "inherit",
  });
  gates.push({ name, status: result.status === 0 ? "passed" : "failed", durationMs: Date.now() - started });
  if (result.status !== 0) throw new Error(`Gate reprovado: ${name}`);
};

run("unit-and-contract-tests", "npm", ["test"]);
run("dependency-audit-high", "npm", ["audit", "--omit=dev", "--audit-level=high"]);
run("release-check-including-production-build", "npm", ["run", "release:check"]);

const requiredRuntimeVariables = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DATABASE_URL",
  "ATLAS_CRON_SECRET",
];
const runtime = {
  configured: requiredRuntimeVariables.filter((name) => Boolean(process.env[name])),
  missing: requiredRuntimeVariables.filter((name) => !process.env[name]),
  authenticatedE2EReady: ["ATLAS_E2E_ADMIN_EMAIL", "ATLAS_E2E_ADMIN_PASSWORD"].every((name) => Boolean(process.env[name])),
};
const evidencePath = resolve(root, ".tmp", `release-test-report-${Date.now()}.json`);
mkdirSync(resolve(root, ".tmp"), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify({
  schemaVersion: 1,
  packageName,
  createdAt: new Date().toISOString(),
  gates,
  runtime,
  note: runtime.missing.length
    ? "Código aprovado; configuração real e E2E autenticado ainda dependem das variáveis listadas."
    : "Configuração mínima detectada; credenciais nunca são incluídas no relatório.",
}, null, 2)}\n`);

try {
  run(
    "immutable-package-and-integrity-verification",
    "npm",
    ["run", "package:hostinger"],
    { ATLAS_PACKAGE_NAME: packageName, ATLAS_RELEASE_EVIDENCE_FILE: evidencePath },
  );
} finally {
  rmSync(evidencePath, { force: true });
}

const bytes = readFileSync(zipPath);
const sha256 = createHash("sha256").update(bytes).digest("hex");
const releaseSummary = {
  packageName,
  zipPath,
  bytes: bytes.length,
  sha256,
  gates,
  runtime,
  status: runtime.missing.length || !runtime.authenticatedE2EReady
    ? "configuration-pending"
    : "ready-for-authenticated-homologation",
};
writeFileSync(`${zipPath}.release.json`, `${JSON.stringify(releaseSummary, null, 2)}\n`);
console.log(JSON.stringify(releaseSummary));
