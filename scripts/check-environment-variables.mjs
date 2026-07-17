import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const root = process.cwd();
const contract = JSON.parse(readFileSync(resolve(root, "config/environment-variables.json"), "utf8"));
const envExample = readFileSync(resolve(root, ".env.example"), "utf8");
const errors = [];
const variables = contract.variables || [];
const byName = new Map();

for (const variable of variables) {
  if (byName.has(variable.name)) errors.push(`variável duplicada no contrato: ${variable.name}`);
  byName.set(variable.name, variable);
  if (!/^[A-Z][A-Z0-9_]+$/.test(variable.name)) errors.push(`nome inválido: ${variable.name}`);
  if (!variable.purpose) errors.push(`finalidade ausente: ${variable.name}`);
  if (variable.scope === "public" && !variable.name.startsWith("NEXT_PUBLIC_")) errors.push(`variável pública sem prefixo seguro: ${variable.name}`);
  if (variable.scope !== "public" && variable.name.startsWith("NEXT_PUBLIC_")) errors.push(`variável não pública com prefixo público: ${variable.name}`);
  if (variable.secret && variable.scope !== "server") errors.push(`segredo fora do servidor: ${variable.name}`);
}

for (const [groupName, group] of Object.entries(contract.alternativeGroups || {})) {
  if (!group.minimumConfigured || !group.members?.length) errors.push(`grupo alternativo inválido: ${groupName}`);
  for (const name of group.members || []) {
    const variable = byName.get(name);
    if (!variable || variable.requirement !== "alternative" || variable.group !== groupName) errors.push(`membro alternativo inconsistente: ${name}`);
  }
}

const exampleNames = [...envExample.matchAll(/^([A-Z][A-Z0-9_]+)=/gm)].map((match) => match[1]);
for (const name of exampleNames) if (!byName.has(name)) errors.push(`variável do .env.example sem classificação: ${name}`);

const ignoredDirectories = new Set([".git", ".next", "node_modules", "outputs", "tmp"]);
const sourceExtensions = new Set([".js", ".cjs", ".mjs", ".ts", ".tsx"]);
const discovered = new Set();
function scan(directory) {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (!ignoredDirectories.has(entry)) scan(path);
      continue;
    }
    if (![...sourceExtensions].some((extension) => entry.endsWith(extension))) continue;
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) discovered.add(match[1]);
    for (const match of source.matchAll(/process\.env\[\s*["']([A-Z][A-Z0-9_]+)["']\s*\]/g)) discovered.add(match[1]);
  }
}
for (const directory of ["app", "components", "lib", "scripts", "utils"]) scan(resolve(root, directory));
for (const name of discovered) if (!byName.has(name)) errors.push(`variável usada no código sem classificação: ${name}`);

for (const name of ["ATLAS_BOOTSTRAP_SECRET", "ATLAS_TEST_EMAIL", "ATLAS_TEST_PASSWORD", "ATLAS_IMPORT_ORGANIZATION_ID", "ATLAS_IMPORT_OWNER_ID", "ATLAS_IMPORT_ACTOR_ID"]) {
  if (byName.get(name)?.requirement !== "temporary") errors.push(`variável temporária sem política temporária: ${name}`);
}
for (const name of ["SUPABASE_SERVICE_ROLE_KEY", "ATLAS_CRON_SECRET"]) {
  const variable = byName.get(name);
  if (!variable?.secret || variable.scope !== "server" || variable.requirement !== "required") errors.push(`segredo obrigatório mal classificado: ${name}`);
}

if (errors.length) {
  console.error("ATLAS ENVIRONMENT VARIABLES: FAILED");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

const counts = variables.reduce((summary, variable) => ({ ...summary, [variable.requirement]: (summary[variable.requirement] || 0) + 1 }), {});
console.log(`ATLAS ENVIRONMENT VARIABLES: PASSED (${variables.length} classificadas; ${discovered.size} usos estáticos; ${counts.required || 0} obrigatórias; ${counts.temporary || 0} temporárias)`);
