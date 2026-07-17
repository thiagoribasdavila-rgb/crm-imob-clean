import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const contract = JSON.parse(readFileSync(resolve(root, "config/command-center.json"), "utf8"));
const route = readFileSync(resolve(root, "app/api/v1/governance/command-center/route.ts"), "utf8");
const view = readFileSync(resolve(root, "app/(crm)/atlas-v3/CommandCenterOverview.tsx"), "utf8");
const page = readFileSync(resolve(root, "app/(crm)/atlas-v3/page.tsx"), "utf8");
const errors = [];

for (const area of ["health", "security", "integrations", "queues", "backup", "ai-cost", "homologation"]) if (!contract.areas?.includes(area)) errors.push(`área ausente: ${area}`);
if (contract.audience !== "director" || !route.includes("exclusivo da diretoria")) errors.push("Command Center sem restrição executiva");
if (contract.truthPolicy?.missingEvidence !== "pending" || contract.truthPolicy?.queryFailure !== "unknown") errors.push("política de verdade inválida");
if (contract.valuesReturned !== false || !route.includes("valuesReturned: false")) errors.push("proteção de valores sensíveis ausente");
if (!route.includes('queueFailed === null ? null') || !route.includes('restorePassed === null ? null')) errors.push("falha de consulta pode estar virando sucesso");
if (!route.includes('realTestRequired: true') || !view.includes("Ausência de evidência nunca aparece como aprovado")) errors.push("integração configurada pode parecer homologada");
if (!route.includes("estimatedCostUsd30d") || !view.includes("Custo IA · 30 dias")) errors.push("custo de IA ausente");
if (!view.includes("Backups e rollback") || !view.includes("Aprovações pendentes") || !page.includes("<CommandCenterOverview />")) errors.push("atalhos executivos não consolidados");

if (errors.length) { console.error("ATLAS COMMAND CENTER: FAILED"); errors.forEach((error) => console.error(`- ${error}`)); process.exit(1); }
console.log(`ATLAS COMMAND CENTER: PASSED (${contract.areas.length} áreas; ${contract.criticalGates.length} gates críticos; verdade por evidência)`);
