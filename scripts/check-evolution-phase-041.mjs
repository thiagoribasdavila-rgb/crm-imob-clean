import fs from "node:fs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-041-customer-relationship-workspace.json", "utf8"));
const phaseForty = JSON.parse(fs.readFileSync("config/evolution-phase-040-activity-explainable-history.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
const customers = fs.readFileSync("app/(crm)/customers/page.tsx", "utf8");
const customersApi = fs.readFileSync("app/api/v1/customers/route.ts", "utf8");
const liveRepositories = fs.readFileSync("lib/atlas/core-v2/live-repositories.ts", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_041_CUSTOMER_RELATIONSHIP_WORKSPACE.md", "utf8");

const checks = [
  ["Fase 041 concluída sem mutação de dados ou schema", config.status === "completed" && config.productionDataModified === false && config.databaseSchemaChanged === false],
  ["Fase anterior encaminha Clientes 360", phaseForty.nextPhase.phase === 41 && phaseForty.nextPhase.status === "planned"],
  // CC-6: banner "FASE 41 ..." deu lugar ao herói com h1; layout-attr preservado.
  ["Clientes 360 declara relacionamento como primeira leitura", customers.includes('data-evolution-phase="41"') && customers.includes('data-customers-layout="relationship-first"') && customers.includes("Cada cliente com contexto para o próximo atendimento")],
  // CC-6: os 4 tiles de sinal foram redistribuídos — "visíveis" e "exigem ação"
  // no herói (cc6-metric-value); "em atendimento" e "compra concluída" nas
  // contagens dos filtros de segmento (SEGMENT_ORDER). Nenhum sinal perdido.
  ["Primeira visão mostra os quatro sinais observados", customers.includes("Relacionamentos visíveis") && customers.includes("exigem próxima") && customers.includes("cc6-metric-value") && customers.includes("SEGMENT_ORDER.map") && config.customerContract.primarySignals === 4],
  ["Revisão humana limita três relacionamentos", customersApi.includes(".slice(0, 3)") && customers.includes("Até três situações objetivas") && config.customerContract.visibleReviewLimit === 3],
  ["Cinco vínculos permanecem pesquisáveis e paginados", config.customerContract.segments.length === 5 && customers.includes("Buscar cliente") && customers.includes("Paginação de clientes") && customersApi.includes("clampLimit")],
  // CC-6: rótulos de contexto agora em minúsculas (projeto/objetivo/responsável/faixa)
  // e o acesso ao Lead 360 é o próprio nome clicável -> /leads/${customer.id}.
  ["Cada linha expõe contexto e acesso ao Lead 360", customers.includes('"projeto"') && customers.includes('"objetivo"') && customers.includes('"responsável"') && customers.includes('"faixa"') && customers.includes("/leads/${customer.id}")],
  // CC-6: governança da base fria consolidada no <details> "Base de reativação:".
  ["Base fria permanece separada da carteira ativa", customers.includes("Base de reativação:") && customers.includes("contatos frios só entram após aprovação e vínculo comercial explícito.") && customersApi.includes("coldReactivationBaseExcluded: true") && config.customerContract.coldReactivationBaseExcluded === true],
  ["API usa contexto autenticado, organização e RLS", customersApi.includes("requireAccessContext") && customersApi.includes("readCompatibleCustomers") && liveRepositories.includes('from("leads")') && liveRepositories.includes('.eq("organization_id", organizationId)') && customersApi.includes('scope: "customer-relationship-read"')],
  ["Enriquecimento preserva perfis e projetos pela camada compatível", customersApi.includes('from("profiles")') && customersApi.includes('from("crm_projects")') && customersApi.includes("LIVE_PROFILE_SELECT") && customersApi.includes("mapLegacyProfile") && customersApi.includes("mapLegacyProject")],
  ["API é somente leitura e não devolve metadados brutos", !customersApi.includes(".insert(") && !customersApi.includes(".update(") && !customersApi.includes(".delete(") && !customersApi.includes("metadata:") && config.safetyPolicy.rawMetadataReturned === false],
  ["Cliente não consulta banco diretamente no navegador", !customers.includes('.from("customers")') && !customers.includes('.from("leads")') && customers.includes('fetch(`/api/v1/customers?${params}`') && config.structuralBaseline.directBrowserDatabaseQueriesAfter === 0],
  // CC-6: disclaimer anti-execução consolidado no <details> de governança.
  ["Nenhuma execução comercial automática foi adicionada", customers.includes("nenhum cliente é transferido, contatado, pontuado ou reativado") && config.executionPolicy.automaticCustomerContact === false && config.executionPolicy.automaticReactivation === false && config.executionPolicy.automaticDecision === false],
  ["Layout possui responsividade, toque e movimento reduzido", styles.includes("/* Fase 041 — Customer 360") && styles.includes(".atlas-customer-row") && styles.includes("min-height: 44px") && styles.includes("@media (prefers-reduced-motion: reduce)")],
  ["Relatório registra limites e próxima fase", report.includes("não publica alegação de produtividade") && report.includes("Fase 042") && config.nextPhase.phase === 42],
  ["RBAC, tenant, RLS e reativação foram preservados", config.safetyPolicy.rbacPreserved === true && config.safetyPolicy.tenantIsolationPreserved === true && config.safetyPolicy.hierarchicalRlsPreserved === true && config.safetyPolicy.reactivationGovernancePreserved === true],
  ["Gate de homologação não foi contornado", phaseTwenty.status === "blocked" && config.exitCriteria.phaseTwentyGateBypassed === false],
];

for (const [label, passed] of checks) {
  if (!passed) {
    console.error(`✗ ${label}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${label}`);
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log("Fase 041 verificada: Customer 360 unificado, hierárquico e orientado ao próximo atendimento.");
