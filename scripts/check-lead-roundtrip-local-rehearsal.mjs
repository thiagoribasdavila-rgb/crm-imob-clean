import { existsSync, readFileSync } from "node:fs";
import { runLeadRoundtripLocalRehearsal } from "./run-lead-roundtrip-local-rehearsal.mjs";

const root = process.cwd();
const read = (file) => readFileSync(`${root}/${file}`, "utf8");
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const required = [
  "config/fixtures/lead-roundtrip-homologation-template.json",
  "docs/LEAD_ROUNDTRIP_LOCAL_REHEARSAL_STAGE_2.md",
  "lib/atlas/pipeline-stages.ts",
  "lib/meta/conversions.ts"
];
for (const file of required) expect(existsSync(`${root}/${file}`), `arquivo ausente: ${file}`);

if (!failures.length) {
  const plan = JSON.parse(read("config/fixtures/lead-roundtrip-homologation-template.json"));
  const receipt = runLeadRoundtripLocalRehearsal(plan);
  const pipeline = read("lib/atlas/pipeline-stages.ts");
  const conversions = read("lib/meta/conversions.ts");
  const report = read("docs/LEAD_ROUNDTRIP_LOCAL_REHEARSAL_STAGE_2.md");

  expect(receipt.status === "local_rehearsal_passed_real_evidence_pending", "ensaio local nao foi aprovado");
  expect(Object.values(receipt.assertions).every((value) => value === true), "uma ou mais garantias do percurso falharam");
  expect(receipt.audit.length === 7, "trilha local incompleta");
  expect(Object.values(receipt.safety).every((value) => value === false), "ensaio alegou uso de dado ou ambiente externo");
  expect(Object.values(receipt.release).every((value) => value === false), "release liberado sem evidencia real");
  for (const stage of ["novo", "contato", "qualificacao"]) expect(pipeline.includes(`\"${stage}\"`), `etapa canonica ausente: ${stage}`);
  for (const marker of ['config.mode !== "test"', "consent_required", 'qualificacao: "QualifiedLead"', "ignoreDuplicates: true"]) expect(conversions.includes(marker), `governanca Meta ausente: ${marker}`);
  for (const marker of ["Etapa 2", "ensaio determinístico em memória", "duplicata foi bloqueada", "QualifiedLead", "não é evidência operacional real", "Nenhum banco, ambiente Hostinger, campanha ou conta Meta foi alterado"]) expect(report.includes(marker), `documentacao incompleta: ${marker}`);
}

if (failures.length) {
  console.error("HOMOLOGAÇÃO LEAD ROUNDTRIP Etapa 2: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log("HOMOLOGAÇÃO LEAD ROUNDTRIP Etapa 2: aprovada — fluxo sintético passou em memória; banco, Hostinger, Meta e produção permaneceram intocados.");
