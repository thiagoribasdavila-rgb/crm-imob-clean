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

console.log("\nATLAS AI — Diagnóstico local\n");

const packagePath = new URL("../package.json", import.meta.url);
const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const branch = run("git branch --show-current");
const remote = run("git remote get-url origin");
const nodeVersion = process.version;
const npmVersion = run("npm --version");
const hasReleaseCheck = Boolean(packageJson.scripts?.["release:check"]);
const hasEnvFile = existsSync(new URL("../.env.local", import.meta.url));
const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);
const hasSupabaseKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

ok("Projeto", `${packageJson.name}@${packageJson.version}`);
branch === "atlas-v3-auth" ? ok("Branch", branch) : warn("Branch", `${branch} — esperado: atlas-v3-auth`);
ok("Remote", remote);
ok("Node", nodeVersion);
ok("npm", npmVersion);
hasReleaseCheck ? ok("Script release:check", "disponível") : warn("Script release:check", "ausente");
hasEnvFile ? ok("Arquivo .env.local", "encontrado") : warn("Arquivo .env.local", "não encontrado");
hasSupabaseUrl ? ok("NEXT_PUBLIC_SUPABASE_URL", "carregada no processo") : warn("NEXT_PUBLIC_SUPABASE_URL", "não carregada no processo atual");
hasSupabaseKey ? ok("NEXT_PUBLIC_SUPABASE_ANON_KEY", "carregada no processo") : warn("NEXT_PUBLIC_SUPABASE_ANON_KEY", "não carregada no processo atual");

console.log("\nSequência recomendada:\n");
console.log("git fetch origin");
console.log("git switch atlas-v3-auth");
console.log("git pull --ff-only origin atlas-v3-auth");
console.log("npm ci");
console.log("npm run doctor");
console.log("npm run release:check");
console.log("npm run dev\n");

if (!hasReleaseCheck || branch !== "atlas-v3-auth") {
  process.exitCode = 1;
}
