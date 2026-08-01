/**
 * ── RE-BASELINADO EM 2026-07-29 ──────────────────────────────────────────────
 *
 * A tela que esta fase construiu — "Clientes 360" (`app/(crm)/customers/page.tsx`
 * + `app/api/v1/customers/route.ts`) — foi APAGADA. Dois motivos:
 *
 *   1. FUSÃO: era a MESMA tabela `leads` lida pela MESMA função
 *      (`readCompatibleCustomers` era alias de `readCompatibleLeads`), sem SLA,
 *      sem filtros, sem lote e sem ordenação — tudo isso já existia em /leads.
 *   2. VAZAMENTO DE CARTEIRA: a rota chamava o repositório só com
 *      `{ organizationId, limit: 5000 }`, sem `ownerId`, delegando a fronteira
 *      ao RLS — cuja política `leads_org_access` é PERMISSIVE por organização e
 *      anula o recorte por dono. Um corretor via as 469 leads da imobiliária
 *      inteira, com telefone, e-mail e botão de copiar.
 *
 * As asserções abaixo NÃO foram removidas nem afrouxadas: cada propriedade que
 * esta fase garantia continua sendo afirmada, apenas ONDE ELA VIVE AGORA —
 * `app/(crm)/leads/page.tsx`, `app/api/v1/crm/leads/route.ts` e
 * `lib/crm/vinculo-do-cliente.ts`. O que a fusão tornou mais forte está anotado
 * na própria asserção. `app/(crm)/customers/page.tsx` continua existindo como
 * redirect permanente e é verificado como tal.
 */
import fs from "node:fs";
import { temAlvoDeToque } from "./lib/css-propriedade.mjs";

const config = JSON.parse(fs.readFileSync("config/evolution-phase-041-customer-relationship-workspace.json", "utf8"));
const phaseForty = JSON.parse(fs.readFileSync("config/evolution-phase-040-activity-explainable-history.json", "utf8"));
const phaseTwenty = JSON.parse(fs.readFileSync("config/evolution-phase-020-wave-homologation.json", "utf8"));
// A porta antiga: sobrevive só como redirect (a memória de workspace guarda
// "/customers" no localStorage e scripts/test-real-routes.mjs faz probe HTTP).
const customersRedirect = fs.readFileSync("app/(crm)/customers/page.tsx", "utf8");
// O destino: onde a capacidade vive desde 2026-07-29.
const leads = fs.readFileSync("app/(crm)/leads/page.tsx", "utf8");
const leadsApi = fs.readFileSync("app/api/v1/crm/leads/route.ts", "utf8");
const vinculo = fs.readFileSync("lib/crm/vinculo-do-cliente.ts", "utf8");
const liveRepositories = fs.readFileSync("lib/atlas/core-v2/live-repositories.ts", "utf8");
const styles = fs.readFileSync("app/globals.css", "utf8");
const report = fs.readFileSync("docs/EVOLUTION_PHASE_041_CUSTOMER_RELATIONSHIP_WORKSPACE.md", "utf8");

// Os quatro vínculos, contados na FONTE (não por grep de rótulo): a lista viva
// é `VINCULOS` em lib/crm/vinculo-do-cliente.ts.
const vinculosDeclarados = [...vinculo.matchAll(/^ {2}"(em_atendimento|compra_concluida|compra_externa|encerrado)",$/gm)].length;

const checks = [
  ["Fase 041 concluída sem mutação de dados ou schema", config.status === "completed" && config.productionDataModified === false && config.databaseSchemaChanged === false],
  ["Fase anterior encaminha Clientes 360", phaseForty.nextPhase.phase === 41 && phaseForty.nextPhase.status === "planned"],
  // ANTES: a tela própria declarava data-customers-layout="relationship-first".
  // AGORA: o destino antigo redireciona e o vínculo é uma faixa de filtro em
  // /leads. A propriedade "a relação comercial é uma leitura de primeira
  // classe" continua afirmada — em /leads, onde ela também respeita o piso de
  // carteira que a tela antiga não aplicava.
  ["Destino antigo continua alcançável por redirect permanente", customersRedirect.includes('from "next/navigation"') && customersRedirect.includes('redirect("/leads")') && !customersRedirect.includes('"use client"')],
  ["Relacionamento é leitura de primeira classe na carteira", leads.includes("VINCULOS.map") && leads.includes('aria-label="Filtrar por vínculo comercial"') && leads.includes("ROTULO_DO_VINCULO[chave]")],
  // ANTES: 4 sinais no herói + SEGMENT_ORDER.map. AGORA: os 4 vínculos são a
  // fonte única (lib/crm/vinculo-do-cliente.ts), consumidos pela tela E pela
  // rota — a mesma verdade calculada em um lugar só.
  ["Primeira visão mostra os quatro sinais observados", vinculosDeclarados === 4 && config.customerContract.primarySignals === 4 && leads.includes('from "@/lib/crm/vinculo-do-cliente"') && leadsApi.includes('from "@/lib/crm/vinculo-do-cliente"')],
  // ANTES: a API cortava as prioridades em .slice(0, 3) e a tela dizia "Até
  // três situações objetivas". AGORA: /leads corta a própria fila visível em 3.
  ["Revisão humana limita três relacionamentos", leads.includes("visiblePriorityQueue.slice(0, 3)") && config.customerContract.visibleReviewLimit === 3],
  // ANTES: 5 segmentos ("todos" + 4 vínculos), busca e paginação de 10 a 100.
  // AGORA: os mesmos 5 estados (nenhum vínculo + os 4), e o filtro roda no
  // BANCO — filtra a carteira inteira, não só a página visível como antes.
  ["Cinco vínculos permanecem pesquisáveis e paginados", config.customerContract.segments.length === vinculosDeclarados + 1 && leads.includes("OPCOES_POR_PAGINA = [10, 20, 50, 100]") && leadsApi.includes('params.get("vinculo")') && leadsApi.includes("statusForaDoAtendimento()")],
  ["Cada linha expõe contexto e acesso ao Lead 360", leads.includes("projectName(lead)") && leads.includes("copiar tel") && leads.includes("copiar e-mail") && leads.includes("href={`/leads/${lead.id}`}")],
  // ANTES: a base fria era excluída no filtro em memória da rota de clientes.
  // AGORA: a exclusão acontece no BANCO, na própria consulta de /leads.
  ["Base fria permanece separada da carteira ativa", leadsApi.includes('.not("status", "in", "(arquivado,ARQUIVADO,archived,ARCHIVED)")') && config.customerContract.coldReactivationBaseExcluded === true],
  // ANTES: só requireAccessContext + organização, delegando o dono ao RLS —
  // que é PERMISSIVE por organização e por isso NÃO recortava por dono. Era
  // exatamente esse o vazamento. AGORA a asserção é mais forte: exige também o
  // piso de carteira aplicado em código.
  ["API usa contexto autenticado, organização e piso de carteira", leadsApi.includes("requireAccessContext") && leadsApi.includes('.eq("organization_id", access.access.organization.id)') && leadsApi.includes("leSoAPropriaCarteira(access.access.profile)") && leadsApi.includes("filtroDaMinhaCarteira(access.access.user.id)") && liveRepositories.includes('from("leads")') && liveRepositories.includes('.eq("organization_id", organizationId)')],
  // O enriquecimento por perfil ficou no servidor; projetos são resolvidos na
  // tela pela mesma camada compatível (mapLegacyProject).
  ["Enriquecimento preserva perfis e projetos pela camada compatível", leadsApi.includes('from("profiles")') && leadsApi.includes("LIVE_PROFILE_SELECT") && leadsApi.includes("mapLegacyProfile") && leads.includes("mapLegacyProject")],
  ["API é somente leitura e não devolve metadados brutos", !leadsApi.includes(".insert(") && !leadsApi.includes(".update(") && !leadsApi.includes(".delete(") && !leadsApi.includes("metadata:") && config.safetyPolicy.rawMetadataReturned === false],
  ["Cliente não consulta a carteira direto do navegador", !leads.includes('.from("leads")') && leads.includes("fetch(`/api/v1/crm/leads?${params}`") && config.structuralBaseline.directBrowserDatabaseQueriesAfter === 0],
  ["Nenhuma execução comercial automática foi adicionada", config.executionPolicy.automaticCustomerContact === false && config.executionPolicy.automaticReactivation === false && config.executionPolicy.automaticDecision === false],
  ["Layout possui responsividade, toque e movimento reduzido",
    /* ── A ASERÇÃO ESTAVA APONTADA PARA A TELA ERRADA ──────────────────────
       Duas strings genéricas, sem âncora nenhuma: `min-height: 44px` (45
       ocorrências) e `@media (prefers-reduced-motion: reduce)` (15). Passava
       sempre.

       E ao procurar onde ancorá-la, o achado: `/customers` tem 43 linhas e é
       um REDIRECT — "Clientes 360 morreu em 2026-07-29, aqui só resta a
       porta", diz o próprio arquivo. Cobrar layout de uma porta não faz
       sentido. A tela que herdou a carteira é `/leads`, e é a família dela
       que precisa entregar o alvo. */
    temAlvoDeToque(styles, ".atlas-leads", 44)],
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
console.log("Fase 041 verificada: relacionamento unificado em /leads, hierárquico, com piso de carteira e orientado ao próximo atendimento.");
