import { readFileSync } from "node:fs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const config = JSON.parse(read("config/meta-intelligence-phase-005.json"));
const audit = read("scripts/audit-meta-compatibility-bridge.mjs");
const report = read("docs/META_COMPATIBILITY_BRIDGE_AND_ACCESS_MATRIX.md");
const packageJson = JSON.parse(read("package.json"));
const failures = [];
const expect = (condition, message) => { if (!condition) failures.push(message); };
const writePrivileges = new Set(["insert", "update", "delete"]);

expect(config.phase === 5 && config.mode === "specification_only", "configuracao da Fase 5 invalida");
expect(config.status === "blocked" && config.safeToApply === false, "implantacao deve permanecer bloqueada");
expect(config.canonicalSources.projects === "public.crm_projects", "fonte canonica de projetos incorreta");
expect(config.canonicalSources.campaigns === "public.marketing_campaigns", "fonte canonica de campanhas incorreta");
expect(config.bridgeContracts.length === 6, "contratos do bridge incompletos");
expect(config.bridgeContracts.every((item) => item.applyNow === false), "nenhum contrato pode ser aplicado nesta fase");
expect(config.bridgeContracts.filter((item) => item.kind === "security_invoker_view").every((item) => item.securityInvoker && item.readOnly), "views de compatibilidade devem ser security invoker e somente leitura");
expect(config.accessMatrix.length === 10, "matriz de acesso incompleta");
expect(config.accessMatrix.every((item) => item.anonPrivileges.length === 0), "anon deve permanecer sem privilegios");
expect(config.accessMatrix.every((item) => !item.authenticatedPrivileges.some((privilege) => writePrivileges.has(privilege))), "authenticated nao pode escrever diretamente");
expect(config.accessMatrix.filter((item) => item.dataApiExposed && item.kind === "table").every((item) => item.rlsRequired), "toda tabela exposta precisa de RLS");
expect(config.accessMatrix.filter((item) => item.object.startsWith("private.")).every((item) => !item.dataApiExposed && item.authenticatedPrivileges.length === 0), "objetos privados nao podem ser expostos");
expect(config.functionHardening.emptySearchPathRequired && config.functionHardening.publicExecuteRevoked, "funcoes security definer nao estao endurecidas");
expect(config.governance.databaseMutation === false && config.governance.migrationCreated === false && config.governance.migrationApplication === false, "fase nao pode criar nem aplicar migration");
expect(config.governance.realEventDelivery === false && config.governance.campaignMutation === false, "fase nao pode enviar evento nem alterar campanha");
expect(config.governance.buildExecuted === false, "build deve ficar reservado aos checkpoints");
for (const url of [
  "https://supabase.com/docs/guides/database/postgres/row-level-security",
  "https://supabase.com/docs/guides/database/secure-data",
  "https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically",
]) {
  expect(config.officialReferences.includes(url), `referencia oficial ausente: ${url}`);
}
for (const marker of [
  "targetSpecificationValid",
  "publicOutboxDefinitionFound",
  "authenticatedWritesDenied",
  "currentSourceMatchesTarget: false",
  "deploymentReady: false",
  "databaseMutation: false",
  "identifiersPrinted: false",
]) {
  expect(audit.includes(marker), `controle de auditoria ausente: ${marker}`);
}
for (const marker of [
  "Fase 5/100",
  "crm_projects",
  "marketing_campaigns",
  "security_invoker",
  "integration_credentials",
  "RLS + grants",
  "Fase 6/100",
]) {
  expect(report.includes(marker), `documentacao incompleta: ${marker}`);
}
expect(packageJson.scripts["meta:phase-005:audit"]?.includes("audit-meta-compatibility-bridge.mjs"), "comando de auditoria ausente");
expect(packageJson.scripts["meta:phase-005:check"]?.includes("check-meta-intelligence-phase-005.mjs"), "gate da Fase 5 ausente");

if (failures.length) {
  console.error("META INTELLIGENCE Fase 5: REPROVADA");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("META INTELLIGENCE Fase 5: aprovada — bridge e matriz RLS/grants especificados sem alterar o banco.");
