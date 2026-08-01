#!/usr/bin/env node
/**
 * check-consented-reactivation-governance.mjs — a fase 89 medida, não grepada.
 *
 * ── O QUE ESTA GUARDA ERA, E POR QUE FOI REAPONTADA (2026-07-29) ─────────────
 *
 * Era um grep de 29 literais. Reprovava em 9, e a quarentena de
 * `scripts/portoes-todos.mjs` a classificava como AMBIENTE ("declara
 * official_whatsapp_api_missing; o WhatsApp está NOT_VERIFIED"). Executada, a
 * saída inteira mostrou que NENHUM dos 9 vermelhos toca WhatsApp, credencial ou
 * rede. Eram dois defeitos de escrita da própria guarda:
 *
 *   · 6 vermelhos = ESPAÇO. Ela exigia `officialApiOnly:true`; o código diz
 *     `officialApiOnly: true`. Cobrava formatação, e prettier a derrubava.
 *   · 3 vermelhos = COPY DE TELA ("WHATSAPP OFICIAL", "CONSENTIMENTO
 *     OBRIGATÓRIO", "RESPOSTA INTERROMPE CADÊNCIA") e o slug
 *     `89-consented-reactivation-governance`, que a reescrita da tela trocou por
 *     `data-evolution-phase="43"`.
 *
 * Mesmo defeito de `visibleItems`: cobrava o NOME, não a propriedade. A
 * propriedade não caiu — a grafia caiu. Reapontada, portanto, para o que precisa
 * ser verdade, e mais estrita do que era:
 *
 *   1. `evaluateReactivationPlan` é EXECUTADA; as travas são lidas do objeto
 *      devolvido, não procuradas no texto.
 *   2. Os defaults do SQL são CONFRONTADOS com os números que a política
 *      devolve (antes bastava a palavra `maximum_attempts` existir no arquivo —
 *      um default 30 passaria).
 *   3. Exige a trava de banco que o grep não olhava: `revoke insert,update,delete
 *      ... from authenticated` na trilha de governança, e o trigger que corta a
 *      cadência no opt-out.
 *   4. Exige que a simulação NÃO escreva, e que a tela não alcance endpoint de
 *      envio.
 *
 * ── LIMITE DECLARADO ────────────────────────────────────────────────────────
 *
 * Os itens de SQL leem o ARQUIVO da migration, não o banco. Neste projeto
 * arquivo e banco divergem, e nada que rode automaticamente vigia isso (mesma
 * lacuna de `rls-cerca:check`). Medido à mão em 2026-07-29 no banco de
 * homologação, por PostgREST com a service_role: as colunas de
 * `lead_reactivation_batches`, `lead_reactivation_contacts` e a tabela
 * `reactivation_governance_events` respondem 200, e uma coluna inventada
 * responde 400 (controle negativo). Naquela data a migration ESTAVA aplicada.
 *
 * O grão fino da política (cada bloqueio, os dois lados de cada limite) mora em
 * tests/contracts/reativacao-consentida.test.mjs, que é coberto por
 * `npm run teste:mutacoes` — este arquivo não é.
 */
import { readFileSync } from "node:fs";
import { evaluateReactivationPlan } from "../lib/commercial/consented-reactivation-policy.ts";

const MIGRATION = "supabase/migrations/20260719123000_phase_89_consented_reactivation_governance.sql";
const ROTA = "app/api/v1/crm/reactivation/governance/route.ts";
const ROTA_OPERACIONAL = "app/api/v1/crm/reactivation/route.ts";
const TELA = "app/(crm)/leads/reactivation-governance/page.tsx";

const falhas = [];
const ok = [];
const exigir = (condicao, descricao) => (condicao ? ok : falhas).push(descricao);

/** Fonte sem as linhas de `import`: identificador importado e não usado não vale como prova. */
const semImports = (caminho) =>
  readFileSync(caminho, "utf8")
    .split("\n")
    .filter((linha) => !/^\s*import\b/.test(linha))
    .join("\n");

// ── 1. A POLÍTICA, EXECUTADA ────────────────────────────────────────────────
const limpo = {
  quality: "green",
  requestedDailyCap: 120,
  requestedIntervalSeconds: 60,
  consentBasis: "formulário assinado",
  approvedTemplate: true,
  eligibleContacts: 40,
  officialApiReady: true,
};
const plano = evaluateReactivationPlan(limpo);
const semApiOficial = evaluateReactivationPlan({ ...limpo, officialApiReady: false });
const vermelha = evaluateReactivationPlan({ ...limpo, quality: "red" });

exigir(plano.eligible === true && plano.blockers.length === 0, "plano completo é elegível (a regra deixa passar quem deve passar)");
exigir(semApiOficial.blockers.includes("official_whatsapp_api_missing") && !semApiOficial.eligible, "sem API oficial no ARGUMENTO, bloqueia (e o bloqueio não vem do ambiente)");
exigir(vermelha.blockers.includes("quality_red") && vermelha.dailyCap === 0, "qualidade vermelha zera o cap");
for (const trava of ["stopOnReply", "stopOnOptOut", "stopOnInvalidPhone", "oneLeadOneBroker", "brokerChoiceOnBadExperience", "officialApiOnly", "humanApprovalRequired"])
  exigir(plano[trava] === true && vermelha[trava] === true, `${trava} garantido no plano aprovado E no reprovado`);

// ── 2. OS NÚMEROS DO SQL BATEM COM OS DA POLÍTICA ───────────────────────────
const sql = readFileSync(MIGRATION, "utf8");
const defaultDoSql = (coluna) => {
  const achado = sql.match(new RegExp(`add column if not exists ${coluna} integer not null default (\\d+)`));
  return achado ? Number(achado[1]) : null;
};
exigir(defaultDoSql("maximum_attempts") === plano.maximumAttempts, `default de maximum_attempts no SQL (${defaultDoSql("maximum_attempts")}) igual ao da política (${plano.maximumAttempts})`);
exigir(defaultDoSql("cooling_off_hours") === plano.coolingOffHours, `default de cooling_off_hours no SQL (${defaultDoSql("cooling_off_hours")}) igual ao da política (${plano.coolingOffHours})`);

// ── 3. AS TRAVAS QUE MORAM NO BANCO ─────────────────────────────────────────
for (const [descricao, padrao] of [
  ["stop_on_reply nasce ligado", /add column if not exists stop_on_reply boolean not null default true/],
  ["stop_on_opt_out nasce ligado", /add column if not exists stop_on_opt_out boolean not null default true/],
  ["official_api_only nasce ligado", /add column if not exists official_api_only boolean not null default true/],
  ["broker_preference existe e é restrita por check", /add column if not exists broker_preference text check\(/],
  ["trilha reactivation_governance_events existe", /create table if not exists public\.reactivation_governance_events\(/],
  ["a trilha é recortada por organização E por perfil comercial", /create policy reactivation_governance_events_scope on public\.reactivation_governance_events[^;]*can_view_commercial_profile/],
  ["a trilha é somente-leitura para o app (só service_role escreve)", /revoke insert,update,delete on public\.reactivation_governance_events from authenticated/],
  ["opt-out corta a cadência no próprio banco, por trigger", /create trigger stop_reactivation_on_suppression after insert on public\.messaging_suppressions/],
])
  exigir(padrao.test(sql), descricao);

// ── 4. SIMULAR NÃO PODE ENVIAR ──────────────────────────────────────────────
const ESCRITAS = /\.(insert|upsert|update|delete|rpc)\s*\(/;
// Os dois lados do predicado antes de usá-lo: regex quebrado aprova qualquer coisa.
exigir(ESCRITAS.test('supabase.from("x").insert({})') && !ESCRITAS.test('supabase.from("x").select("id")'), "o detector de escrita reconhece escrita e absolve leitura");

const rota = semImports(ROTA);
exigir(!ESCRITAS.test(rota), `${ROTA} não escreve no banco`);
exigir(/evaluateReactivationPlan\s*\(/.test(rota), `${ROTA} CHAMA a política (não apenas importa)`);
exigir(/simulationOnly/.test(rota) && /noExternalAction/.test(rota), `${ROTA} declara a resposta como simulação sem ação externa`);

const operacional = semImports(ROTA_OPERACIONAL);
exigir(/evaluateReactivationPlan\s*\(/.test(operacional), `${ROTA_OPERACIONAL} CHAMA a política antes de operar`);
exigir(/approval_requested/.test(operacional), `${ROTA_OPERACIONAL} pede aprovação humana em vez de enviar`);

// ── 5. A TELA NÃO ALCANÇA ENDPOINT DE ENVIO ─────────────────────────────────
const tela = semImports(TELA);
const alvos = [...tela.matchAll(/fetch\(\s*["'`]([^"'`]+)/g)].map((m) => m[1]);
exigir(alvos.length > 0, `${TELA} conversa com a API (nenhum fetch seria tela morta)`);
exigir(
  alvos.every((alvo) => alvo === "/api/v1/crm/reactivation/governance"),
  `todo fetch da tela vai para a governança — achei ${JSON.stringify(alvos)}`,
);
exigir(/consent/.test(tela) && /template/.test(tela) && /officialApi/.test(tela), `${TELA} expõe os três pré-requisitos como entrada do simulador`);

for (const item of ok) console.log(`✓ ${item}`);
for (const item of falhas) console.log(`✗ ${item}`);
if (falhas.length) {
  console.error(`\nGovernança da reativação consentida: REPROVADO em ${falhas.length} de ${ok.length + falhas.length} propriedades.`);
  process.exit(1);
}
console.log(`\nFase 89 aprovada: ${ok.length} propriedades de reativação consentida, medidas por execução.`);
