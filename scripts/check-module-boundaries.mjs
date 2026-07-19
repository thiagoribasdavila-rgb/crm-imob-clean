import { readFileSync } from "node:fs";

const modules = JSON.parse(readFileSync(new URL("../config/module-boundaries.json", import.meta.url), "utf8"));
const canonical = JSON.parse(readFileSync(new URL("../config/canonical-entities.json", import.meta.url), "utf8"));
const errors = [];
const moduleKeys = new Set();
const entityOwners = new Map();
const ownedRoots = new Map();

for (const boundary of modules.modules || []) {
  if (!boundary.key || !boundary.purpose) errors.push("módulo sem chave ou propósito");
  if (moduleKeys.has(boundary.key)) errors.push(`módulo duplicado: ${boundary.key}`);
  moduleKeys.add(boundary.key);
  for (const entity of boundary.entities || []) {
    if (entityOwners.has(entity)) errors.push(`entidade ${entity} pertence a ${entityOwners.get(entity)} e ${boundary.key}`);
    entityOwners.set(entity, boundary.key);
  }
  for (const group of ["uiRoots", "apiRoots", "libraryRoots"]) for (const root of boundary[group] || []) {
    if (ownedRoots.has(root)) errors.push(`raiz ${root} pertence a ${ownedRoots.get(root)} e ${boundary.key}`);
    ownedRoots.set(root, boundary.key);
  }
}

for (const required of ["crm", "projects", "marketing", "ai", "integrations", "governance", "reports", "platform"]) if (!moduleKeys.has(required)) errors.push(`módulo obrigatório ausente: ${required}`);
for (const boundary of modules.modules || []) for (const dependency of boundary.dependsOn || []) {
  if (!moduleKeys.has(dependency)) errors.push(`${boundary.key} depende de módulo inexistente: ${dependency}`);
  if (dependency === boundary.key) errors.push(`${boundary.key} não pode depender de si mesmo`);
}
for (const entity of canonical.entities || []) {
  if (!entityOwners.has(entity.key)) errors.push(`entidade canônica sem módulo responsável: ${entity.key}`);
}
for (const owned of entityOwners.keys()) if (!(canonical.entities || []).some((entity) => entity.key === owned)) errors.push(`módulo declara entidade não canônica: ${owned}`);

if (errors.length) {
  console.error("ATLAS MODULE BOUNDARIES: FAILED");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`ATLAS MODULE BOUNDARIES: PASSED (${moduleKeys.size} módulos, ${entityOwners.size} entidades com dono único, ${ownedRoots.size} raízes)`);
