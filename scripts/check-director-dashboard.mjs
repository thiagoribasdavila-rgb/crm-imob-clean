import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const contract = JSON.parse(read("config/director-dashboard.json"));
const endpoint = read(contract.endpoint);
const page = read(contract.page);
const failures = [];
const markers = { commercial: "commercial:", financial: "financial:", forecast: "forecastWeighted", campaigns: "campaignRanking", developers: "developerMap", ai: "aiUsage", risks: "risks", hierarchy: "superintendents" };
for (const area of contract.requiredAreas) if (!endpoint.includes(markers[area])) failures.push(`área ausente: ${area}`);
if (!endpoint.includes('roles: ["admin", "director"]') || !endpoint.includes("exclusivo da diretoria")) failures.push("endpoint não é exclusivo da diretoria");
if (!endpoint.includes('.eq("organization_id", organizationId)')) failures.push("consolidação não está limitada à organização");
if (!endpoint.includes("money(item.value) *") || !endpoint.includes('forecastMethod: "crm_probability_weighted"')) failures.push("forecast não é explicável");
if (!endpoint.includes("money(item.leads_count) >= 30") || !endpoint.includes("portfolio.length >= 50")) failures.push("comparações não possuem amostra mínima");
if (/\.(insert|update|delete|upsert)\(/.test(endpoint) || !endpoint.includes("noAutomaticBudgetChange: true") || !endpoint.includes("noAutomaticPeopleDecision: true")) failures.push("painel pode executar decisão sensível");
if (!page.includes('data-phase="24-director-command-center"')) failures.push("Command Center da fase 24 não está visível");
if (!page.includes("Sem snapshot anterior") || !page.includes("APROVAÇÃO HUMANA")) failures.push("interface não explica confiança e governança");
if (failures.length) { console.error("DIRECTOR DASHBOARD Fase 24: REPROVADO"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log(`DIRECTOR DASHBOARD Fase 24: aprovado — ${contract.requiredAreas.length} áreas; organização isolada; forecast explicável; amostras mínimas; decisão humana.`);
