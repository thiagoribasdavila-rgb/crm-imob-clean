import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8");
const contract = JSON.parse(read("config/data-completeness.json"));
const engine = read(contract.engine); const endpoint = read(contract.endpoint); const page = read(contract.page); const failures = [];
for (const dimension of contract.dimensions) if (!engine.includes(`key: "${dimension}"`)) failures.push(`dimensão ausente: ${dimension}`);
for (const priority of contract.priorities) if (!engine.includes(`"${priority}"`)) failures.push(`prioridade ausente: ${priority}`);
for (const action of contract.actions) if (!engine.includes(`"${action}"`)) failures.push(`ação ausente: ${action}`);
if (!endpoint.includes("assessLeadCompleteness") || !endpoint.includes("requireLeadAccess")) failures.push("avaliação não está ligada ao Lead 360 seguro");
for (const marker of ['data-phase="30-data-gaps"', "Dados que faltam", "pergunte agora", "qualifyLead", "actOnGap", "sem custo de IA"]) if (!page.includes(marker)) failures.push(`experiência ausente: ${marker}`);
if (!engine.includes("completedWeight") || !engine.includes("weight:")) failures.push("completude não é ponderada por valor comercial");
if (engine.toLowerCase().includes("cpf") || engine.toLowerCase().includes("cnpj")) failures.push("dado documental entrou no cálculo comercial");
if (failures.length) { console.error("DADOS INCOMPLETOS Fase 30: REPROVADO"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log(`DADOS INCOMPLETOS Fase 30: aprovado — ${contract.dimensions.length} dimensões, priorização comercial e custo LLM zero.`);
