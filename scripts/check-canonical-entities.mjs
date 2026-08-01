import { readFileSync } from "node:fs";

const contract = JSON.parse(readFileSync(new URL("../config/canonical-entities.json", import.meta.url), "utf8"));
const errors = [];
const keys = new Set();
const tables = new Set();
const aliases = new Set();

if (contract.tenantKey !== "organization_id") errors.push("tenantKey deve ser organization_id");
if (!Array.isArray(contract.entities) || contract.entities.length < 10) errors.push("contrato precisa cobrir o núcleo operacional");

for (const entity of contract.entities || []) {
  if (!entity.key || !entity.table || !entity.purpose) errors.push(`entidade incompleta: ${entity.key || "sem-chave"}`);
  if (keys.has(entity.key)) errors.push(`chave duplicada: ${entity.key}`);
  if (tables.has(entity.table)) errors.push(`tabela canônica duplicada: ${entity.table}`);
  if (aliases.has(entity.table)) errors.push(`tabela canônica reutiliza alias histórico: ${entity.table}`);
  keys.add(entity.key);
  tables.add(entity.table);
  for (const alias of entity.legacyAliases || []) {
    if (tables.has(alias) || aliases.has(alias)) errors.push(`alias ambíguo: ${alias}`);
    aliases.add(alias);
  }
}

for (const required of ["lead", "customer", "user", "project", "task", "campaign", "commercialActivity", "systemEvent", "material"]) {
  if (!keys.has(required)) errors.push(`entidade obrigatória ausente: ${required}`);
}

if (errors.length) {
  console.error("ATLAS CANONICAL ENTITIES: FAILED");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

console.log(`ATLAS CANONICAL ENTITIES: PASSED (${keys.size} entidades, ${tables.size} tabelas únicas, tenant ${contract.tenantKey})`);
