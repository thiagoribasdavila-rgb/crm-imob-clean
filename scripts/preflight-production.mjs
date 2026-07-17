import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

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
const baseUrl = (value("ATLAS_BASE_URL") || "http://localhost:3000").replace(/\/$/, "");
const results = [];

function check(name, ok, detail, required = true) {
  results.push({ name, ok, detail, required });
  console.log(`${ok ? "✅" : required ? "❌" : "⚠️"} ${name}: ${detail}`);
}

console.log("\nATLAS AI — Production Preflight\n");

check("NEXT_PUBLIC_SUPABASE_URL", Boolean(value("NEXT_PUBLIC_SUPABASE_URL")), "configurada");
const publicSupabaseKey = value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || value("NEXT_PUBLIC_SUPABASE_ANON_KEY");
check("Chave pública Supabase", Boolean(publicSupabaseKey), publicSupabaseKey ? "publishable/anon configurada" : "configure NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ou NEXT_PUBLIC_SUPABASE_ANON_KEY");
check("SUPABASE_SERVICE_ROLE_KEY", Boolean(value("SUPABASE_SERVICE_ROLE_KEY")), "configurada");
check("ATLAS_CRON_SECRET", Boolean(value("ATLAS_CRON_SECRET")), "configurada");
const aiCredential = Boolean(value("OPENAI_API_KEY"));
check("IA comercial", aiCredential, aiCredential ? "OpenAI direta disponível" : "configure OPENAI_API_KEY");
check("Pesquisa web", Boolean(value("PERPLEXITY_API_KEY")), value("PERPLEXITY_API_KEY") ? "Perplexity disponível" : "opcional: configure PERPLEXITY_API_KEY", false);
const economyProviders = ["DEEPSEEK", "QWEN", "KIMI", "GLM"].filter((provider) => Boolean(value(`${provider}_API_KEY`) && value(`ATLAS_${provider}_MODEL`)));
check("IAs econômicas", economyProviders.length > 0, economyProviders.length ? `${economyProviders.join(", ")} pronta(s) para roteamento` : "opcional: configure chave e modelo de ao menos um provedor", false);
check("Roteamento de modelos", Boolean(value("ATLAS_AI_FAST_MODEL") && value("ATLAS_AI_MODEL") && value("ATLAS_RESEARCH_MODEL")), "modelos rápido, comercial e pesquisa definidos");
const pricingReady = ["FAST", "COMMERCIAL", "REASONING", "RESEARCH"].every((tier) => Number(value(`ATLAS_AI_${tier}_INPUT_USD_PER_MILLION`)) > 0 && Number(value(`ATLAS_AI_${tier}_OUTPUT_USD_PER_MILLION`)) > 0);
check("Custos de IA", pricingReady, pricingReady ? "preços por milhão configurados" : "configure preços atuais para medir custo real", false);
check("Ambiente Hostinger", value("ATLAS_HOSTING_PROVIDER") === "hostinger", "ATLAS_HOSTING_PROVIDER=hostinger");
check("ATLAS_BOOTSTRAP_SECRET", Boolean(value("ATLAS_BOOTSTRAP_SECRET")), "necessária somente até criar o primeiro admin", false);
check("META_APP_SECRET", Boolean(value("META_APP_SECRET")), "opcional para teste inicial", false);
check("Meta Conversions", Boolean(value("META_CONVERSIONS_ACCESS_TOKEN") && value("META_AD_ACCOUNT_ID")), "necessária para fechar o ciclo CRM → Andromeda", false);
check("Meta Insights", Boolean(value("META_ADS_ACCESS_TOKEN") && value("META_AD_ACCOUNT_ID")), "necessária para custo e ranking real", false);
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
