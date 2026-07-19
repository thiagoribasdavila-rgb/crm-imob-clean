import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const read = (path) => readFileSync(resolve(process.cwd(), path), "utf8"); const contract = JSON.parse(read("config/canonical-pipeline-stages.json"));
const core = read(contract.contract); const api = read(contract.api); const settingsApi = read(contract.settingsApi); const board = read(contract.board); const settingsPage = read(contract.settingsPage); const migration = read(contract.migration); const dataContracts = read("lib/atlas/data-contracts.ts"); const failures = [];
for (const key of contract.canonicalKeys) if (!core.includes(`key: "${key}"`) || !migration.includes(`'${key}'`)) failures.push(`etapa canônica ausente: ${key}`);
for (const field of contract.editableFields) if (!settingsApi.includes(field) || !settingsPage.includes(field)) failures.push(`campo editável ausente: ${field}`);
if (!api.includes("canonicalPipelineStage") || !api.includes("mergePipelineStageSettings") || !api.includes('stageContract: "canonical-v1"')) failures.push("API do pipeline não aplica contrato canônico");
if (!dataContracts.includes("PIPELINE_STAGE_KEYS") || !dataContracts.includes("canonicalPipelineStage")) failures.push("contratos de fronteira mantêm uma lista concorrente");
if (!board.includes("payload.stages") || !board.includes("Configurar etapas") || !settingsPage.includes('data-phase="31-stage-settings"')) failures.push("Kanban não consome ou não permite configurar etapas");
if (!settingsApi.includes('["admin", "director", "superintendent"]') || !migration.includes("enable row level security")) failures.push("edição sem governança de gestão e tenant");
if (!core.includes('negociacao: "proposta"') || !core.includes('vend') && !core.includes('venda: "ganho"')) failures.push("aliases históricos não são normalizados");
if (failures.length) { console.error("ETAPAS CANÔNICAS Fase 31: REPROVADO"); for (const failure of failures) console.error(`- ${failure}`); process.exit(1); }
console.log(`ETAPAS CANÔNICAS Fase 31: aprovado — ${contract.canonicalKeys.length} chaves, ${contract.editableFields.length} campos editáveis e ${contract.consumers.length} consumidores alinhados.`);
