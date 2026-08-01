import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const environmentContract = JSON.parse(readFileSync(resolve(root, "config/environment-variables.json"), "utf8"));
const governance = JSON.parse(readFileSync(resolve(root, "config/secret-governance.json"), "utf8"));
const route = readFileSync(resolve(root, "app/api/v1/governance/secrets/route.ts"), "utf8");
const gitignore = readFileSync(resolve(root, ".gitignore"), "utf8");
const errors = [];
const secretNames = new Set(environmentContract.variables.filter((variable) => variable.secret).map((variable) => variable.name));
const governed = new Map();

for (const profile of governance.profiles || []) {
  if (!profile.ownerRole) errors.push(`perfil sem responsável: ${profile.key}`);
  if (!Number.isInteger(profile.rotationDays) || profile.rotationDays < 1 || profile.rotationDays > 180) errors.push(`prazo de rotação inválido: ${profile.key}`);
  for (const name of profile.variables || []) {
    if (governed.has(name)) errors.push(`segredo com dois responsáveis: ${name}`);
    governed.set(name, profile);
    if (!secretNames.has(name)) errors.push(`política aplicada a variável não secreta: ${name}`);
  }
}
for (const name of secretNames) if (!governed.has(name)) errors.push(`segredo sem responsável ou rotação: ${name}`);
if (governance.storage?.valuesReturnedByApi !== false) errors.push("API deve proibir retorno de valores");
for (const forbidden of ["browser bundle", "source control", "logs", "AI prompts"]) if (!governance.storage?.forbidden?.includes(forbidden)) errors.push(`destino proibido ausente: ${forbidden}`);
if ((governance.incidentProcedure || []).length < 6) errors.push("procedimento de incidente incompleto");
if (!route.includes('valuesReturned: false') || !route.includes('source: "config/environment-variables.json"')) errors.push("API de governança não comprova inventário sanitizado");
if (!gitignore.includes(".env*")) errors.push("arquivos .env não estão bloqueados no Git");

const ignoredDirectories = new Set([".git", ".next", "node_modules", "outputs", "tmp", "app/generated"]);
function inspect(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const relative = path.slice(root.length + 1);
    if ([...ignoredDirectories].some((ignored) => relative === ignored || relative.startsWith(`${ignored}/`))) continue;
    const stats = statSync(path);
    if (stats.isDirectory()) { inspect(path); continue; }
    if (!/\.(?:ts|tsx|js|mjs|cjs)$/.test(entry)) continue;
    const source = readFileSync(path, "utf8");
    if (!/^\s*["']use client["'];/m.test(source)) continue;
    for (const name of secretNames) if (source.includes(name)) errors.push(`componente cliente referencia segredo privado: ${relative} -> ${name}`);
    for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) if (!match[1].startsWith("NEXT_PUBLIC_")) errors.push(`componente cliente acessa variável de servidor: ${relative} -> ${match[1]}`);
  }
}
for (const directory of ["app", "components", "lib"]) inspect(resolve(root, directory));

if (errors.length) {
  console.error("ATLAS SECRET GOVERNANCE: FAILED");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`ATLAS SECRET GOVERNANCE: PASSED (${secretNames.size} segredos; ${governance.profiles.length} responsáveis; cliente sem acesso privado)`);
