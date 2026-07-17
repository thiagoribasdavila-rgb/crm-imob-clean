import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const contract = JSON.parse(read("config/unified-timeline.json"));
const endpoint = read(contract.endpoint);
const page = read(contract.page);
const failures = [];
for (const source of contract.canonicalSources) if (!endpoint.includes(`from("${source}")`)) failures.push(`fonte canônica ausente: ${source}`);
for (const category of contract.categories) if (!endpoint.includes(`"${category}"`) || !page.includes(`"${category}"`)) failures.push(`categoria incompleta: ${category}`);
if (!endpoint.includes("requireApiIdentity") || !endpoint.includes("requireLeadAccess") || !endpoint.includes('eq("organization_id", identity.organizationId)')) failures.push("timeline sem autenticação, escopo da lead ou tenant");
if (!endpoint.includes("hiddenEventsExcluded: true") || !endpoint.includes("hierarchicalRls: true")) failures.push("resposta não declara exclusão hierárquica");
if (endpoint.includes('select("id,conversation_id,direction,channel,status,content')) failures.push("timeline expõe conteúdo de mensagem");
if (endpoint.includes("external_message_id") || endpoint.includes("external_event_id") || endpoint.includes("payload).eq")) failures.push("timeline expõe identificador ou payload externo");
for (const marker of ['data-phase="29-unified-timeline"', "HISTÓRICO ÚNICO", "quem agiu", "Filtrar eventos da timeline", "actorName", "categoryLabel"]) if (!page.includes(marker)) failures.push(`experiência ausente: ${marker}`);
if (!endpoint.includes("representedSimulationIds")) failures.push("simulações podem aparecer duplicadas");
if (failures.length) { console.error("TIMELINE Fase 29: REPROVADO"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log(`TIMELINE Fase 29: aprovado — ${contract.categories.length} categorias, ${contract.canonicalSources.length} fontes canônicas, autoria e privacidade preservadas.`);
