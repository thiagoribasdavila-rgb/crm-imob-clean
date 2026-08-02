/**
 * CONTRATO: a taxa de descarte sai do RAZÃO do funil, não da tabela morta.
 *
 * ── O DEFEITO, MEDIDO NO BANCO VIVO EM 02/08/2026 ───────────────────────────
 *
 *   lead_events com event_type='lead_discarded' ....... 0 linhas
 *   lead_events, qualquer tipo ........................ 106
 *   pipeline_stage_moves para 'perdido' ............... 412  (273 com motivo)
 *   leads em status 'perdido' ......................... 419  = 85,5% da base
 *
 * `campaign-quality-data.ts` lia a primeira. Com zero eventos, o painel de
 * qualidade de campanha imprimia **descarte 0%** — e o limiar de vermelho é 25%.
 * A operação descarta 85,5% e o painel dizia que estava perfeito.
 *
 * ── POR QUE ESTE É O ERRO CARO, E NÃO UM ERRO QUALQUER ──────────────────────
 *
 * Ele aponta na direção "está tudo bem". Um painel que exagera o problema é
 * revisto na primeira reunião; um que o esconde é obedecido. Enquanto ele
 * imprimia 0%, toda campanha recebia nota A pelo critério de descarte, e a
 * decisão de verba era tomada em cima disso.
 *
 * ── O QUE ESTE CONTRATO GUARDA ──────────────────────────────────────────────
 *
 * A metade ESTRUTURAL trava a fonte: o carregador tem de ler
 * `pipeline_stage_moves` filtrando `to_stage='perdido'`, e NÃO pode voltar a ler
 * `lead_events` com `lead_discarded`. As duas tabelas continuam existindo — é
 * isso que torna a regressão fácil.
 *
 * A metade de COMPORTAMENTO prova que a taxa reage aos eventos: sem ela, a
 * estrutural seria uma asserção que só verifica a si mesma.
 *
 * E o caso NEGATIVO existe porque a correção preguiçosa aqui é fazer o painel
 * mostrar sempre um número alto: com zero descartes de verdade, a taxa tem de
 * ser 0 — o defeito não era o número zero, era o zero vindo da fonte errada.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const carregador = readFileSync(new URL("../../lib/atlas/campaign-quality-data.ts", import.meta.url), "utf8");
const semComentarios = carregador
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

/* ── ESTRUTURA: a fonte do descarte ───────────────────────────────────────── */

test("o descarte é lido de pipeline_stage_moves, a fonte canônica de movimentação", () => {
  assert.match(
    semComentarios,
    /from\(\s*["'`]pipeline_stage_moves["'`]\s*\)/,
    "o carregador de qualidade de campanha parou de ler o razão do funil",
  );
});

test("o filtro é a TRANSAÇÃO para perdido, não um efeito colateral", () => {
  assert.match(
    semComentarios,
    /["'`]to_stage["'`]\s*,\s*["'`]perdido["'`]/,
    "sem o filtro por to_stage, a contagem incluiria movimento que não é descarte",
  );
});

test("NÃO volta a ler lead_events com lead_discarded — a tabela tem 0 linhas há meses", () => {
  assert.doesNotMatch(
    semComentarios,
    /["'`]lead_discarded["'`]/,
    "lead_events com lead_discarded tem ZERO linhas: ler dali imprime descarte 0% numa operação que descarta 85,5%",
  );
});

test("o motivo do descarte é preservado no formato que o consumidor lê", () => {
  // `campaign-quality.ts` lê `metadata.reasonKey`; o razão guarda em coluna
  // própria. O mapeamento fica na BORDA — se sumir, os 273 motivos declarados
  // viram descarte sem classificação e a taxonomia inteira zera.
  assert.match(semComentarios, /discard_reason_key/, "a coluna do motivo saiu do select");
  assert.match(semComentarios, /reasonKey/, "o mapeamento para o formato do consumidor sumiu");
});

/* ── COMPORTAMENTO: a taxa reage mesmo aos eventos ────────────────────────── */

const { buildCampaignQuality, CAMPAIGN_QUALITY_MINIMUM_LEADS } = await import(
  "../../lib/atlas/campaign-quality.ts"
);

const leadDe = (id, over = {}) => ({
  id,
  campaign_id: "camp-1",
  status: "perdido",
  score_ia: 40,
  temperature: "morno",
  created_at: "2026-07-01T00:00:00Z",
  ...over,
});

const campanha = {
  id: "camp-1",
  name: "Campanha",
  external_campaign_id: "ext-1",
  status: "ACTIVE",
  platform: "META",
};

// O painel só emite nota acima do piso de amostra; abaixo dele ele se RECUSA a
// classificar, e isso é acerto. Os casos abaixo usam uma janela acima do piso
// para medir a taxa, e não a nota.
const ACIMA_DO_PISO = CAMPAIGN_QUALITY_MINIMUM_LEADS + 10;

function com(descartes, totalDeLeads = ACIMA_DO_PISO) {
  const leads = Array.from({ length: totalDeLeads }, (_, i) => leadDe(`l${i}`));
  return buildCampaignQuality({
    campaigns: [campanha],
    leads,
    discardEvents: descartes,
    spendRows: [],
  });
}

test("a taxa de descarte SOBE quando o razão traz movimento para perdido", () => {
  const semNenhum = com([]);
  const comDois = com([
    { lead_id: "l0", metadata: { reasonKey: "sem_interesse" } },
    { lead_id: "l1", metadata: { reasonKey: "inalcancavel" } },
  ]);
  assert.equal(semNenhum.totals.discarded, 0);
  assert.equal(comDois.totals.discarded, 2, "os eventos do razão não chegaram à contagem");

  // `discardRate` é POR CAMPANHA, e é ele que decide a nota: o limiar de A é 25%.
  const antes = semNenhum.ranking[0]?.discardRate ?? 0;
  const depois = comDois.ranking[0]?.discardRate ?? 0;
  assert.ok(
    depois > antes,
    `a taxa da campanha não reagiu: antes ${antes}, depois ${depois}. ` +
      "Se ela não reage, a metade estrutural deste contrato só verifica a si mesma.",
  );
});

test("zero descarte REAL continua devolvendo zero — o defeito não era o número", () => {
  const r = com([]);
  assert.equal(r.totals.discarded, 0);
  assert.equal(
    r.ranking[0]?.discardRate ?? 0,
    0,
    "sem movimento para perdido, zero é a resposta certa. O defeito era o zero vindo da fonte ERRADA.",
  );
});

test("o motivo declarado é classificado — os 273 do razão não podem virar 'sem motivo'", () => {
  const { totals } = com([
    { lead_id: "l0", metadata: { reasonKey: "sem_interesse" } },
    { lead_id: "l1", metadata: { reasonKey: null } },
  ]);
  assert.equal(totals.discarded, 2);
  assert.equal(
    totals.classifiedDiscards,
    1,
    "o descarte COM motivo tem de ser classificado e o SEM motivo não — se os dois caírem juntos, " +
      "o mapeamento de discard_reason_key para reasonKey se perdeu na borda e a taxonomia inteira zera",
  );
});
