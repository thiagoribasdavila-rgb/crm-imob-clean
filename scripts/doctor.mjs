import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import process from "node:process";

function run(command) {
  try {
    return execSync(command, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  } catch {
    return "indisponível";
  }
}

function ok(label, value) {
  console.log(`✅ ${label}: ${value}`);
}

function warn(label, value) {
  console.log(`⚠️  ${label}: ${value}`);
}

function report(condition, label, successValue, warningValue) {
  if (condition) {
    ok(label, successValue);
    return;
  }
  warn(label, warningValue);
}

console.log("\nATLAS AI — Diagnóstico local\n");

const packagePath = new URL("../package.json", import.meta.url);
const envPath = new URL("../.env.local", import.meta.url);
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const branch = run("git branch --show-current");
const remote = run("git remote get-url origin");
const nodeVersion = process.version;
const npmVersion = run("npm --version");
const hasReleaseCheck = Boolean(packageJson.scripts?.["release:check"]);
const hasEnvFile = existsSync(envPath);
const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const hasSupabaseKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

ok("Projeto", `${packageJson.name}@${packageJson.version}`);
report(branch === "develop/atlas-v3", "Branch", branch, `${branch} — esperado: develop/atlas-v3`);
ok("Remote", remote);
ok("Node", nodeVersion);
ok("npm", npmVersion);
report(hasReleaseCheck, "Script release:check", "disponível", "ausente");
report(hasEnvFile, "Arquivo .env.local", "encontrado", "não encontrado");
report(hasSupabaseUrl, "NEXT_PUBLIC_SUPABASE_URL", "carregada no processo", "não carregada no processo atual");
report(hasSupabaseKey, "NEXT_PUBLIC_SUPABASE_ANON_KEY", "carregada no processo", "não carregada no processo atual");

console.log("\nSequência recomendada:\n");
console.log("git fetch origin");
console.log("git switch develop/atlas-v3");
console.log("git pull --ff-only origin develop/atlas-v3");
console.log("npm ci");
console.log("npm run doctor");
console.log("npm run release:check");
console.log("npm run dev\n");

if (!hasReleaseCheck || branch !== "develop/atlas-v3") {
  process.exitCode = 1;
}
