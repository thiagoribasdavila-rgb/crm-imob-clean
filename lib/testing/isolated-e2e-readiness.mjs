const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const FORBIDDEN_HOST_PARTS = ["atlasaios.com.br", "hostingersite.com"];
const FORBIDDEN_PROJECT_REFS = ["pozbrcsfthnhmnebfoxv"];

export const ISOLATED_E2E_ENV = Object.freeze({
  baseUrl: "ATLAS_E2E_ISOLATED_BASE_URL",
  supabaseUrl: "ATLAS_E2E_ISOLATED_SUPABASE_URL",
  publishableKey: "ATLAS_E2E_ISOLATED_SUPABASE_PUBLISHABLE_KEY",
  adminEmail: "ATLAS_E2E_ISOLATED_ADMIN_EMAIL",
  adminPassword: "ATLAS_E2E_ISOLATED_ADMIN_PASSWORD",
  directorEmail: "ATLAS_E2E_ISOLATED_DIRECTOR_EMAIL",
  directorPassword: "ATLAS_E2E_ISOLATED_DIRECTOR_PASSWORD",
  managerEmail: "ATLAS_E2E_ISOLATED_MANAGER_EMAIL",
  managerPassword: "ATLAS_E2E_ISOLATED_MANAGER_PASSWORD",
  brokerEmail: "ATLAS_E2E_ISOLATED_BROKER_EMAIL",
  brokerPassword: "ATLAS_E2E_ISOLATED_BROKER_PASSWORD",
});

const REQUIRED_NAMES = Object.values(ISOLATED_E2E_ENV);
const ROLE_EMAIL_NAMES = [
  ISOLATED_E2E_ENV.adminEmail,
  ISOLATED_E2E_ENV.directorEmail,
  ISOLATED_E2E_ENV.managerEmail,
  ISOLATED_E2E_ENV.brokerEmail,
];

function parseUrl(name, value, errors) {
  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      errors.push(`${name} deve usar HTTP ou HTTPS`);
      return null;
    }
    return parsed;
  } catch {
    errors.push(`${name} possui URL inválida`);
    return null;
  }
}

function validateLocalUrl(name, value, errors) {
  const parsed = parseUrl(name, value, errors);
  if (!parsed) return;
  const host = parsed.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) {
    errors.push(`${name} deve apontar exclusivamente para loopback local`);
  }
  if (FORBIDDEN_HOST_PARTS.some((part) => host.includes(part))) {
    errors.push(`${name} aponta para domínio operacional proibido`);
  }
  if (FORBIDDEN_PROJECT_REFS.some((ref) => value.includes(ref))) {
    errors.push(`${name} aponta para o projeto Supabase operacional proibido`);
  }
}

export function evaluateIsolatedE2EEnvironment(values, runtime = {}) {
  const errors = [];
  const missing = REQUIRED_NAMES.filter((name) => !values[name]?.trim());
  for (const name of missing) errors.push(`${name} ausente`);

  if (values.ATLAS_E2E_ISOLATED_SERVICE_ROLE_KEY?.trim()) {
    errors.push("ATLAS_E2E_ISOLATED_SERVICE_ROLE_KEY é proibida neste executor");
  }

  if (values[ISOLATED_E2E_ENV.baseUrl]) {
    validateLocalUrl(
      ISOLATED_E2E_ENV.baseUrl,
      values[ISOLATED_E2E_ENV.baseUrl],
      errors,
    );
  }
  if (values[ISOLATED_E2E_ENV.supabaseUrl]) {
    validateLocalUrl(
      ISOLATED_E2E_ENV.supabaseUrl,
      values[ISOLATED_E2E_ENV.supabaseUrl],
      errors,
    );
  }

  const roleEmails = ROLE_EMAIL_NAMES.map((name) =>
    values[name]?.trim().toLowerCase(),
  ).filter(Boolean);
  if (new Set(roleEmails).size !== roleEmails.length) {
    errors.push("cada papel E2E precisa utilizar uma conta isolada distinta");
  }

  const contractReady = errors.length === 0;
  const dockerAvailable = runtime.dockerAvailable === true;
  const localSupabaseAvailable = runtime.localSupabaseAvailable === true;
  const workspaceEnvIsolated = runtime.workspaceEnvIsolated === true;
  const runtimeReady =
    contractReady &&
    dockerAvailable &&
    localSupabaseAvailable &&
    workspaceEnvIsolated;

  return {
    contractReady,
    runtimeReady,
    missing,
    errors,
    runtime: {
      dockerAvailable,
      localSupabaseAvailable,
      workspaceEnvIsolated,
    },
  };
}

const SAFE_CHILD_ENV_NAMES = new Set([
  "CI",
  "COLORTERM",
  "HOME",
  "LANG",
  "LC_ALL",
  "NODE_OPTIONS",
  "PATH",
  "PLAYWRIGHT_BROWSERS_PATH",
  "SHELL",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
]);

export function createIsolatedPlaywrightEnvironment(values, base = {}) {
  const result = {};
  for (const name of SAFE_CHILD_ENV_NAMES) {
    if (base[name] !== undefined) result[name] = base[name];
  }

  Object.assign(result, {
    ATLAS_E2E_BASE_URL: values[ISOLATED_E2E_ENV.baseUrl],
    NEXT_PUBLIC_SUPABASE_URL: values[ISOLATED_E2E_ENV.supabaseUrl],
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      values[ISOLATED_E2E_ENV.publishableKey],
    ATLAS_E2E_ADMIN_EMAIL: values[ISOLATED_E2E_ENV.adminEmail],
    ATLAS_E2E_ADMIN_PASSWORD: values[ISOLATED_E2E_ENV.adminPassword],
    ATLAS_E2E_DIRECTOR_EMAIL: values[ISOLATED_E2E_ENV.directorEmail],
    ATLAS_E2E_DIRECTOR_PASSWORD: values[ISOLATED_E2E_ENV.directorPassword],
    ATLAS_E2E_MANAGER_EMAIL: values[ISOLATED_E2E_ENV.managerEmail],
    ATLAS_E2E_MANAGER_PASSWORD: values[ISOLATED_E2E_ENV.managerPassword],
    ATLAS_E2E_BROKER_EMAIL: values[ISOLATED_E2E_ENV.brokerEmail],
    ATLAS_E2E_BROKER_PASSWORD: values[ISOLATED_E2E_ENV.brokerPassword],
  });

  return result;
}
