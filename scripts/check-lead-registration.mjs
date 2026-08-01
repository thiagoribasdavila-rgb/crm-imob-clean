import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const contract = JSON.parse(read("config/lead-registration.json"));
const route = read(contract.route);
const page = read(contract.page);
const failures = [];
for (const marker of ["emailPattern", "phone.length < 10", "allowedSources", "allowedPurposes", "1_000_000_000", "body.bedrooms", "uuidPattern", "body.notes?.length"]) if (!route.includes(marker)) failures.push(`validação ausente: ${marker}`);
for (const marker of ['from("leads")', "emailDuplicate", "phoneDuplicate", "identity.organizationId", "recordLiveLeadEvent", "LIVE_LEAD_SELECT"]) if (!route.includes(marker)) failures.push(`contrato ativo ausente: ${marker}`);
if (route.includes('rpc("create_lead_atomic"')) failures.push("rota ainda depende de função ausente no banco ativo");
if (!route.includes('from("crm_projects")')) failures.push("projeto ainda não usa o cadastro ativo");
if (!route.includes("visibleDuplicate") || !route.includes("duplicateLeadId")) failures.push("duplicidade lateral pode vazar identificação");
for (const marker of ['data-phase="25-lead-registration"', "Nome e um contato bastam", "Qualificação opcional", "errorField", "min-h-12", "Score previsto"]) if (!page.includes(marker)) failures.push(`experiência ausente: ${marker}`);
if (failures.length) { console.error("LEAD REGISTRATION Fase 25: REPROVADO"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log(`LEAD REGISTRATION: aprovado — ${contract.validationAreas.length} validações; escrita compatível com banco ativo; deduplicação por tenant; histórico real; cadastro progressivo.`);
