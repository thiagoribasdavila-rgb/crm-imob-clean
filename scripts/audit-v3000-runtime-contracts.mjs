import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const configPath = "config/v3000-runtime-contracts.json";
const outputPath = "docs/evidence/V3000_PHASE_381_RUNTIME_CONTRACTS.json";
const online = process.argv.includes("--online");
const writeEvidence = process.argv.includes("--write");
const config = JSON.parse(readFileSync(resolve(root, configPath), "utf8"));

const read = (file) => readFileSync(resolve(root, file), "utf8");
const has = (source, pattern) => pattern.test(source);
const checks = [];
const expect = (id, condition, evidence) => {
  checks.push({ id, passed: Boolean(condition), evidence });
};

const proxy = read(config.contractFiles.proxy);
const authMe = read(config.contractFiles.authMe);
const access = read(config.contractFiles.accessContext);
const bearer = read(config.contractFiles.bearerIdentity);

expect("proxy_login_public", has(proxy, /["']\/login["']/), config.contractFiles.proxy);
expect("proxy_setup_public", has(proxy, /["']\/setup["']/) && has(proxy, /setup\(\?:\/\|\$\)/), config.contractFiles.proxy);
expect("proxy_protects_non_public_routes", has(proxy, /const isProtected = !publicPages\.has\(pathname\)/), config.contractFiles.proxy);
expect("proxy_preserves_intended_destination", has(proxy, /searchParams\.set\(["']next["']/), config.contractFiles.proxy);
expect("auth_me_rate_limited", has(authMe, /enforceRateLimit/), config.contractFiles.authMe);
expect("auth_me_requires_access_context", has(authMe, /requireAccessContext/), config.contractFiles.authMe);
expect("auth_me_returns_profile_and_organization", has(authMe, /profile:\s*access\.access\.profile/) && has(authMe, /organization:\s*access\.access\.organization/), config.contractFiles.authMe);
expect("cookie_or_bearer_uses_verified_user", has(access, /auth\.getUser/) && has(access, /createClient\(\)/), config.contractFiles.accessContext);
expect("active_profile_required", has(access, /PROFILE_REQUIRED/) && has(access, /PROFILE_INACTIVE/), config.contractFiles.accessContext);
expect("organization_required_and_active", has(access, /PROFILE_ORGANIZATION_REQUIRED/) && has(access, /ORGANIZATION_INACTIVE/), config.contractFiles.accessContext);
expect("fallback_limited_to_homologation", has(access, /ATLAS_ENV === ["']homologation["']/) && has(access, /ATLAS_DEFAULT_ORGANIZATION_ID/), config.contractFiles.accessContext);
expect("role_authorization_enforced", has(access, /accessRoles\?\.length/) && has(access, /options\.roles\?\.length/) && has(access, /FORBIDDEN/), config.contractFiles.accessContext);
expect("bearer_identity_verifies_user", has(bearer, /auth\.getUser\(token\)/) && has(bearer, /Token de autenticação ausente/), config.contractFiles.bearerIdentity);
expect("bearer_identity_scopes_lead", has(bearer, /\.eq\(["']organization_id["'], identity\.organizationId\)/), config.contractFiles.bearerIdentity);
expect("real_env_files_ignored", has(read(".gitignore"), /^\.env\*/m), ".gitignore");

function runCheck(script) {
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
  });
  return {
    script,
    passed: result.status === 0,
    exitCode: result.status,
    summary: `${result.stdout}${result.stderr}`.trim().split("\n").at(-1) ?? "",
  };
}

const rlsChecks = [
  runCheck(config.contractFiles.rlsAudit),
  runCheck(config.contractFiles.rlsMatrix),
];

function normalizeLocation(location) {
  if (!location) return null;
  try {
    const url = new URL(location, config.baseUrl);
    return `${url.pathname}${url.search}`;
  } catch {
    return location;
  }
}

async function probe(specification) {
  const response = await fetch(new URL(specification.path, config.baseUrl), {
    redirect: "manual",
    headers: { "user-agent": "Atlas-V3000-Runtime-Audit/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  const contentType = response.headers.get("content-type")?.split(";")[0] ?? null;
  const location = normalizeLocation(response.headers.get("location"));
  let errorCode = null;
  if (specification.expectedErrorCode) {
    const body = await response.json().catch(() => null);
    errorCode = body?.error?.code ?? null;
  } else {
    await response.body?.cancel();
  }
  const passed =
    response.status === specification.expectedStatus &&
    (!specification.expectedContentType || contentType === specification.expectedContentType) &&
    (!specification.expectedLocation || location === specification.expectedLocation) &&
    (!specification.expectedErrorCode || errorCode === specification.expectedErrorCode);
  return {
    id: specification.id,
    path: specification.path,
    status: response.status,
    contentType,
    location,
    errorCode,
    passed,
  };
}

let probes = [];
let onlineError = null;
if (online) {
  try {
    probes = await Promise.all(config.publicProbes.map(probe));
  } catch (error) {
    onlineError = error instanceof Error ? error.name : "UnknownError";
  }
}

const trackedEnv = spawnSync("git", ["ls-files", "--", ".env", ".env.*"], {
  cwd: root,
  encoding: "utf8",
});
const trackedRealEnvFiles = trackedEnv.stdout
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line && !line.endsWith(".example") && !line.endsWith(".template"));

const staticPassed = checks.filter(({ passed }) => passed).length;
const rlsPassed = rlsChecks.filter(({ passed }) => passed).length;
const onlinePassed = probes.filter(({ passed }) => passed).length;
const evidence = {
  schemaVersion: config.schemaVersion,
  phase: config.phase,
  consolidationGate: config.consolidationGate,
  generatedAt: new Date().toISOString(),
  scope: "runtime-auth-tenant-authorization-boundaries",
  mutationPolicy: {
    remoteWritesExecuted: false,
    bootstrapExecuted: false,
    migrationsApplied: false,
    usersChanged: false,
    organizationChanged: false,
  },
  staticContracts: {
    status: staticPassed === checks.length ? "PROVED" : "FAILED",
    passed: staticPassed,
    total: checks.length,
    checks,
  },
  rlsContracts: {
    status: rlsPassed === rlsChecks.length ? "STATIC_PROOF_PASSED" : "FAILED",
    dynamicCrossTenantProof: "PENDING_AUTHENTICATED_SESSION",
    checks: rlsChecks,
  },
  anonymousOnlineBoundary: {
    requested: online,
    status: !online
      ? "NOT_REQUESTED"
      : onlineError || onlinePassed !== config.publicProbes.length
        ? "FAILED"
        : "PROVED",
    errorType: onlineError,
    passed: onlinePassed,
    total: config.publicProbes.length,
    probes,
  },
  authenticatedRuntimeProof: config.authenticatedRuntimeProof,
  secretSafety: {
    envFilesIgnored: checks.find(({ id }) => id === "real_env_files_ignored")?.passed === true,
    trackedRealEnvFiles,
    passed: trackedRealEnvFiles.length === 0,
  },
  gate: {
    status: "IN_PROGRESS",
    completedProofs: [
      "static_auth_contracts",
      "static_tenant_contracts",
      "static_role_contracts",
      "static_rls_contracts",
      ...(online && !onlineError && onlinePassed === config.publicProbes.length
        ? ["anonymous_online_boundary"]
        : []),
    ],
    remainingProofs: config.authenticatedRuntimeProof.requiredEvidence,
    releaseAllowed: false,
    zipAllowed: false,
  },
  summary: {
    staticChecks: checks.length,
    staticPassed,
    rlsChecks: rlsChecks.length,
    rlsPassed,
    onlineRequested: online,
    onlineProbes: config.publicProbes.length,
    onlinePassed,
    authenticatedRuntimeStatus: config.authenticatedRuntimeProof.status,
    gateStatus: "IN_PROGRESS",
  },
};

evidence.digest = createHash("sha256")
  .update(JSON.stringify({ ...evidence, generatedAt: undefined, digest: undefined }))
  .digest("hex");

const failed =
  staticPassed !== checks.length ||
  rlsPassed !== rlsChecks.length ||
  trackedRealEnvFiles.length > 0 ||
  (online && (onlineError || onlinePassed !== config.publicProbes.length));

if (writeEvidence) {
  mkdirSync(dirname(resolve(root, outputPath)), { recursive: true });
  writeFileSync(resolve(root, outputPath), `${JSON.stringify(evidence, null, 2)}\n`);
}

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
if (failed) process.exitCode = 1;
