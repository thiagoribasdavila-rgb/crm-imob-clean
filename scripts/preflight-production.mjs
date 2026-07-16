import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

const baseUrl = (process.env.ATLAS_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const envPath = new URL("../.env.local", import.meta.url);

function loadLocalEnv() {
  if (!existsSync(envPath)) return {};
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  return Object.fromEntries(
    lines
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "")];
      }),
  );
}

const localEnv = loadLocalEnv();
const value = (key) => process.env[key] || localEnv[key] || "";
const results = [];

function check(name, ok, detail, required = true) {
  results.push({ name, ok, detail, required });
  console.log(`${ok ? "✅" : required ? "❌" : "⚠️"} ${name}: ${detail}`);
}

console.log("\nATLAS AI — Production Preflight\n");

check("NEXT_PUBLIC_SUPABASE_URL", Boolean(value("NEXT_PUBLIC_SUPABASE_URL")), "configurada");
check("NEXT_PUBLIC_SUPABASE_ANON_KEY", Boolean(value("NEXT_PUBLIC_SUPABASE_ANON_KEY")), "configurada");
check("SUPABASE_SERVICE_ROLE_KEY", Boolean(value("SUPABASE_SERVICE_ROLE_KEY")), "configurada");
check("ATLAS_CRON_SECRET", Boolean(value("ATLAS_CRON_SECRET")), "configurada");
const aiCredential = Boolean(
  value("AI_GATEWAY_API_KEY")
  || value("VERCEL_OIDC_TOKEN"),
);
check("Credencial da IA", aiCredential, aiCredential ? "AI Gateway disponível" : "configure AI_GATEWAY_API_KEY ou VERCEL_OIDC_TOKEN");
check("ATLAS_BOOTSTRAP_SECRET", Boolean(value("ATLAS_BOOTSTRAP_SECRET")), "necessária somente até criar o primeiro admin", false);
check("META_APP_SECRET", Boolean(value("META_APP_SECRET")), "opcional para teste inicial", false);
check("WHATSAPP_ACCESS_TOKEN", Boolean(value("WHATSAPP_ACCESS_TOKEN")), "opcional para teste inicial", false);

const routes = [
  ["Login", "/login", [200]],
  ["Health", "/api/health", [200]],
  ["Readiness", "/api/ready", [200]],
  ["V1/V2 status", "/api/v1-v2/status", [200, 503]],
  ["V3 status", "/api/v3/status", [200, 401, 503]],
  ["Dashboard protection", "/dashboard", [200, 307, 308]],
  ["Launch OS protection", "/developments", [200, 307, 308]],
];

for (const [name, path, expected] of routes) {
  try {
    const startedAt = Date.now();
    const response = await fetch(`${baseUrl}${path}`, { redirect: "manual" });
    const duration = Date.now() - startedAt;
    check(name, expected.includes(response.status), `HTTP ${response.status} · ${duration} ms`);
  } catch (error) {
    check(name, false, error instanceof Error ? error.message : String(error));
  }
}

const requiredFailures = results.filter((item) => item.required && !item.ok);
console.log("\nResumo\n");
console.log(`Base URL: ${baseUrl}`);
console.log(`Obrigatórios aprovados: ${results.filter((item) => item.required && item.ok).length}`);
console.log(`Obrigatórios pendentes: ${requiredFailures.length}`);

if (requiredFailures.length) {
  console.error("\n❌ Preflight bloqueado. Corrija os itens obrigatórios antes do teste real.\n");
  process.exit(1);
}

console.log("\n✅ Ambiente pronto para iniciar a homologação funcional.\n");
