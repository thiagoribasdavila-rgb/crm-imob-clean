import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const contract = JSON.parse(read("config/smart-search.json"));
const endpoint = read(contract.endpoint);
const page = read(contract.page);
const palette = read(contract.palette);
const failures = [];
for (const marker of ["name", "phone", "email", "developments", "developer_name", "profiles", "source", "purpose"]) if (!endpoint.includes(marker)) failures.push(`campo de busca ausente: ${marker}`);
if (!endpoint.includes("requireAccessContext") || !endpoint.includes("const db = access.supabase") || !endpoint.includes('.eq("organization_id", organizationId)')) failures.push("busca não usa escopo autenticado e RLS");
if (!endpoint.includes("hiddenResultsExcluded: true") || !endpoint.includes("hierarchicalRls: true")) failures.push("resposta não explicita resultados ocultos");
if (!endpoint.includes('replace(/[\\u0300-\\u036f]/g') || !endpoint.includes('normalize("NFKC")')) failures.push("normalização de texto incompleta");
if (!endpoint.includes("matchedBy") || !endpoint.includes("nextAction") || !endpoint.includes("rank")) failures.push("resultado não é explicado ou priorizado");
for (const marker of ['data-phase="27-smart-search"', "Encontre a lead pelo que você lembra", "Resultados sob seu escopo", "result.matchedBy", "result.nextAction"]) if (!page.includes(marker)) failures.push(`experiência ausente: ${marker}`);
if (!palette.includes("/api/v1/search?q=") || !palette.includes("ArrowDown") || !palette.includes("ArrowUp")) failures.push("paleta não compartilha a busca inteligente ou teclado");
if (failures.length) { console.error("SMART SEARCH Fase 27: REPROVADO"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log(`SMART SEARCH Fase 27: aprovado — ${contract.searchFields.length} campos; RLS hierárquico; busca explicável; paleta e página unificadas.`);
