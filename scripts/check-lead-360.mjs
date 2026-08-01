import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const contract = JSON.parse(read("config/lead-360.json"));
const route = read(contract.route);
const timeline = read(contract.timelineRoute);
const page = read(contract.page);
const failures = [];
const markers = { identity: "storedLead", origin: "origin:", history: "activities", score: "lead.score", activities: "eventResult", development: "projectResult", owner: "ownerResult", communications: "communications:", pipeline: "opportunities:", nextAction: "contactBriefing" };
for (const area of contract.requiredAreas) if (!route.includes(markers[area]) && !page.includes(markers[area])) failures.push(`área ausente: ${area}`);
if (!route.includes("requireLeadAccess(identity, id)") || !route.includes('eq("organization_id", identity.organizationId)')) failures.push("Lead 360 sem escopo canônico");
if (!timeline.includes('const db = identity.supabase') || !timeline.includes('db.from("messages")') || !timeline.includes('db.from("conversations")')) failures.push("comunicações não respeitam RLS do usuário");
if (!route.includes("relationshipContext") || !route.includes("ownerResult.data") || !route.includes("projectResult.data") || !timeline.includes('db.from("campaign_events")')) failures.push("contexto relacional incompleto");
for (const marker of ['data-phase="26-lead-360"', "Nenhuma seção abaixo repete", "Sem responsável", "Projeto de interesse", "Comunicações", "Preparar próxima ação", "Cada tile aponta para o registro canônico"]) if (!page.includes(marker)) failures.push(`experiência ausente: ${marker}`);
if (!page.includes("Cada tile aponta para o registro canônico") || !page.includes("registro canônico")) failures.push("interface não explica a fonte única");
if (failures.length) { console.error("LEAD 360 Fase 26: REPROVADO"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log(`LEAD 360 Fase 26: aprovado — ${contract.requiredAreas.length} áreas unificadas; registro canônico; RLS; mapa de contexto e próxima ação.`);
