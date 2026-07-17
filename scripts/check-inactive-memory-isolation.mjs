import { existsSync, readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const dashboard = read("app/(crm)/dashboard/page.tsx");
const pipeline = read("app/api/v1/pipeline/route.ts");
const leads = read("app/api/v1/crm/leads/route.ts");
const context = read("lib/ai/real-estate-context.ts");
const importer = read("scripts/import-prepared-lead-memory.mjs");
const failures = [];

if (!dashboard.includes('title="Perfil aguardando ativação"')) failures.push("perfil inativo não possui diagnóstico próprio");
if (dashboard.includes('.from("profiles").select("*").eq("active", true)')) failures.push("dashboard ainda oculta o perfil inativo antes do diagnóstico");
if (!pipeline.includes('.neq("status", "arquivado")')) failures.push("pipeline ainda mistura memória fria");
if (!leads.includes('.neq("status", "arquivado")')) failures.push("carteira diária ainda mistura memória fria");
if (!context.includes('status(item.status) !== "arquivado"')) failures.push("contexto operacional da IA ainda contabiliza memória fria");
for (const marker of ['status:"arquivado"', 'atlas-local-reactivation-v1', 'humanApprovalRequired: true', 'automaticContact: false']) {
  if (!importer.includes(marker)) failures.push(`classificação protegida ausente: ${marker}`);
}

const qualityPath = new URL("../tmp/lead-memory/quality-summary.json", import.meta.url);
let prepared = null;
if (existsSync(qualityPath)) {
  const quality = JSON.parse(readFileSync(qualityPath, "utf8"));
  prepared = { sourceRows: quality.source_rows, usableRows: quality.usable_rows, uniqueContacts: quality.unique_contacts, duplicateRows: quality.duplicate_rows, invalidRows: quality.invalid_rows };
  if (Number(quality.unique_contacts || 0) < 16_000) failures.push("inventário local não confirma a base inativa informada");
}

if (failures.length) {
  console.error("ATLAS INACTIVE MEMORY: REPROVADO");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`ATLAS INACTIVE MEMORY: APROVADO — memória fria isolada, classificação local em tempo real e promoção somente humana.${prepared ? ` Base confirmada: ${prepared.uniqueContacts} contatos únicos em ${prepared.usableRows} registros utilizáveis.` : " Inventário local não incluído no pacote."}`);
