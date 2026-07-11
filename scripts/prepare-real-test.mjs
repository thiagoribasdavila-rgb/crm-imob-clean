import { existsSync, copyFileSync, readFileSync } from "node:fs";
import process from "node:process";

const root = new URL("../", import.meta.url);
const envExample = new URL("../.env.example", import.meta.url);
const envLocal = new URL("../.env.local", import.meta.url);

if (!existsSync(envLocal)) {
  if (!existsSync(envExample)) {
    console.error("❌ .env.example não encontrado.");
    process.exit(1);
  }
  copyFileSync(envExample, envLocal);
  console.log("✅ .env.local criado a partir de .env.example");
  console.log("⚠️  Preencha os valores antes de continuar. Nenhuma chave foi gerada automaticamente.\n");
  process.exit(2);
}

const content = readFileSync(envLocal, "utf8");
const values = Object.fromEntries(
  content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const index = line.indexOf("=");
      return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^['\"]|['\"]$/g, "")];
    }),
);

const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ATLAS_CRON_SECRET",
  "ATLAS_TEST_EMAIL",
  "ATLAS_TEST_PASSWORD",
];

const missing = required.filter((key) => !values[key]);
console.log("\nATLAS AI — Preparação do teste real\n");
for (const key of required) console.log(`${values[key] ? "✅" : "❌"} ${key}`);

if (missing.length) {
  console.error(`\n❌ Preencha ${missing.length} variável(is) obrigatória(s) no .env.local.`);
  console.error("Não compartilhe os valores das chaves.\n");
  process.exit(1);
}

const baseUrl = values.ATLAS_BASE_URL || "http://localhost:3000";
console.log(`\n✅ Ambiente preenchido. URL de teste: ${baseUrl}`);
console.log("\nPróxima sequência:");
console.log("1. npm run release:check");
console.log("2. npm run dev");
console.log("3. Em outro terminal: npm run test:real\n");
void root;
