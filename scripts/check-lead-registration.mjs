import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(resolve(root, path), "utf8");
const contract = JSON.parse(read("config/lead-registration.json"));
const route = read(contract.route);
const page = read(contract.page);
const migration = read(contract.migration);
const failures = [];
for (const marker of ["emailPattern", "phone.length < 10", "allowedSources", "allowedPurposes", "1_000_000_000", "body.bedrooms", "uuidPattern", "body.notes?.length"]) if (!route.includes(marker)) failures.push(`validação ausente: ${marker}`);
if (!route.includes('rpc("create_lead_atomic"')) failures.push("criação não é atômica");
if (!migration.includes("pg_advisory_xact_lock") || !migration.includes("phone_normalized=normalized_phone") || !migration.includes("lower(email)=normalized_email")) failures.push("duplicidade concorrente não está protegida");
if (!migration.includes("p_organization_id <> public.current_organization_id()") || !migration.includes("p_assigned_to <> auth.uid()")) failures.push("função atômica não protege organização e carteira");
if (!route.includes("visibleDuplicate") || !route.includes("duplicateLeadId")) failures.push("duplicidade lateral pode vazar identificação");
if (!migration.includes("invalid_phone_suppressed") || !route.includes("histórico de qualidade inválida")) failures.push("histórico de telefone inválido não bloqueia recadastro");
for (const marker of ['data-phase="25-lead-registration"', "Cadastro rápido", "Adicionar qualificação agora", "errorField", "min-h-12", "Score previsto"]) if (!page.includes(marker)) failures.push(`experiência ausente: ${marker}`);
if (failures.length) { console.error("LEAD REGISTRATION Fase 25: REPROVADO"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log(`LEAD REGISTRATION Fase 25: aprovado — ${contract.validationAreas.length} validações; deduplicação atômica; histórico de qualidade; cadastro progressivo.`);
