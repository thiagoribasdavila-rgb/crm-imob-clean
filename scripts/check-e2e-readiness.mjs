import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const failures = [];

let playwrightAvailable = false;
try {
  require.resolve("@playwright/test/package.json");
  playwrightAvailable = true;
} catch {
  failures.push(
    "@playwright/test ainda não está instalado; execute npm install --save-dev @playwright/test e npx playwright install chromium quando o acesso ao registry estiver disponível",
  );
}

const envPath = ".env.local";
if (!existsSync(envPath)) {
  failures.push(
    ".env.local ausente; execute npm run prepare:test e preencha somente no ambiente local seguro",
  );
}

function parseEnvFile(path) {
  if (!existsSync(path)) return {};
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const separator = line.indexOf("=");
        const name = line.slice(0, separator).trim();
        const value = line
          .slice(separator + 1)
          .trim()
          .replace(/^['"]|['"]$/g, "");
        return [name, value];
      }),
  );
}

const values = { ...parseEnvFile(envPath), ...process.env };
const requiredRoles = ["DIRECTOR", "MANAGER", "BROKER"];
const baseUrl = values.ATLAS_E2E_BASE_URL || values.ATLAS_BASE_URL;
let runsLocally = false;
if (!baseUrl) {
  failures.push("ATLAS_E2E_BASE_URL/ATLAS_BASE_URL não configurada");
} else {
  try {
    const parsed = new URL(baseUrl);
    runsLocally = ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
    if (parsed.protocol !== "https:" && !runsLocally) {
      failures.push("a URL E2E remota precisa usar HTTPS");
    }
  } catch {
    failures.push("ATLAS_E2E_BASE_URL/ATLAS_BASE_URL inválida");
  }
}

if (runsLocally) {
  if (!values.NEXT_PUBLIC_SUPABASE_URL) {
    failures.push("NEXT_PUBLIC_SUPABASE_URL ausente para o teste local");
  }
  if (
    !values.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY &&
    !values.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    failures.push(
      "chave pública do Supabase ausente para o teste local (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY)",
    );
  }
  if (!values.SUPABASE_SERVICE_ROLE_KEY) {
    failures.push("SUPABASE_SERVICE_ROLE_KEY ausente para o teste local");
  }
}

const adminEmail = values.ATLAS_E2E_ADMIN_EMAIL || values.ATLAS_TEST_EMAIL;
const adminPassword =
  values.ATLAS_E2E_ADMIN_PASSWORD || values.ATLAS_TEST_PASSWORD;
if (!adminEmail || !adminPassword) {
  failures.push(
    "credenciais E2E do ADMIN ausentes (ATLAS_E2E_ADMIN_* ou ATLAS_TEST_*)",
  );
}
for (const role of requiredRoles) {
  if (!values[`ATLAS_E2E_${role}_EMAIL`]) {
    failures.push(`ATLAS_E2E_${role}_EMAIL ausente`);
  }
  if (!values[`ATLAS_E2E_${role}_PASSWORD`]) {
    failures.push(`ATLAS_E2E_${role}_PASSWORD ausente`);
  }
}

if (failures.length) {
  console.error("ATLAS E2E: ambiente ainda não está pronto.");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(
  `ATLAS E2E: ambiente e quatro papéis preparados (${playwrightAvailable ? "Playwright disponível" : "runner indisponível"}).`,
);
