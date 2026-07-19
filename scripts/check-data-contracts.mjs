import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../lib/atlas/data-contracts.ts", import.meta.url), "utf8");
const pipelineStages = readFileSync(new URL("../lib/atlas/pipeline-stages.ts", import.meta.url), "utf8");
const errors = [];
const requiredExports = ["normalizeUuid", "normalizeEmail", "normalizePhoneE164", "normalizeIsoDateTime", "moneyToCents", "centsToMoney", "normalizeBrazilianDocument", "normalizeLeadStage"];
for (const name of requiredExports) if (!source.includes(`export function ${name}`)) errors.push(`normalizador ausente: ${name}`);
for (const stage of ["novo", "contato", "qualificacao", "visita", "proposta", "contrato", "ganho", "perdido", "comprou_outro"]) if (!pipelineStages.includes(`key: "${stage}"`)) errors.push(`etapa canônica ausente: ${stage}`);
if (!source.includes("PIPELINE_STAGE_KEYS") || !source.includes("canonicalPipelineStage")) errors.push("contrato de dados não delega etapas à fonte canônica");
if (!source.includes("Number.isSafeInteger")) errors.push("dinheiro precisa preservar limite seguro em centavos");
if (!source.includes("254")) errors.push("e-mail precisa de limite de tamanho");
if (!source.includes("10,15")) errors.push("telefone precisa respeitar o comprimento E.164");
if (!source.includes("^\\d{11}$|^\\d{14}$")) errors.push("documento precisa aceitar somente CPF/CNPJ normalizado");

if (errors.length) {
  console.error("ATLAS DATA CONTRACTS: FAILED");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}
console.log(`ATLAS DATA CONTRACTS: PASSED (${requiredExports.length} normalizadores, 9 etapas canônicas)`);
