/**
 * Contrato: O RELATÓRIO DE CUSTO SABE DIZER O NOME DA INCORPORADORA.
 *
 * ── A corrente, e onde ela partia ──────────────────────────────────────────
 *
 * Do que a tela chama (/api/v1/marketing/cost-report, sem `?source=meta`) até a
 * linha que devolve o nome existem DOIS elos, e os dois pediam coluna que não
 * existe:
 *
 *   1º  `marketing_campaigns.development_id` — 42703. A coluna real é
 *       `project_id`, e ela aponta `crm_projects`, não `developments`.
 *       O erro caía num fallback SEM LOG que devolvia só `id,name`.
 *   2º  `developers.name` — 42703. As colunas são `trade_name` e `legal_name`.
 *
 * O 2º foi corrigido antes; o 1º mantinha o bloco corrigido INALCANÇÁVEL, porque
 * `devIds` saía vazio em toda requisição. Medido em produção (02/08/2026, org
 * 7c8c71c1): 8 campanhas, `devIds = []`, ZERO incorporadoras nomeadas. Com os
 * dois elos inteiros o catálogo nomeia as três: Kallas, Shpaisman, Teixeira
 * Duarte.
 *
 * Este contrato existe para que a próxima coluna inexistente REPROVE aqui, e não
 * na tela do diretor.
 *
 * Rodar: node --experimental-strip-types --test tests/contracts/incorporadora-tem-nome.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  montarCatalogo,
  resolverProduto,
  nomeDeIncorporadora,
  COLUNAS_DE_EMPREENDIMENTO,
  COLUNAS_DE_INCORPORADORA,
  COLUNAS_DA_PONTE_DE_PROJETO,
} from "../../lib/marketing/catalogo-de-produtos.ts";
import { aggregate } from "../../lib/marketing/cost-report.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const rota = fs.readFileSync(path.join(raiz, "app", "api", "v1", "marketing", "cost-report", "route.ts"), "utf8");

/** Um portão mede o CÓDIGO, não o que se escreveu sobre ele. */
function semComentarios(fonte) {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}
const codigo = semComentarios(rota);

// ── AS COLUNAS QUE O BANCO TEM (conferidas em information_schema, 02/08/2026) ─
// developers ......... id, organization_id, legal_name, trade_name, slug, ...
// developments ....... id, organization_id, developer_id, developer_name, name, ...
// marketing_campaigns  id, organization_id, project_id, name, platform,
//                      external_campaign_id, status, started_at, ended_at, ...
// crm_projects ....... id, organization_id, name, developer_name, ...,
//                      development_id
const COLUNAS_INEXISTENTES = [
  { tabela: "marketing_campaigns", coluna: "development_id" },
  { tabela: "developers", coluna: "name" },
];

test("nenhuma leitura da rota pede coluna que a tabela não tem", () => {
  const pares = [...codigo.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)\s*\n?\s*\.select\(\s*"([^"]+)"\s*\)/g)]
    .map(([, tabela, colunas]) => ({ tabela, colunas: colunas.split(",").map((c) => c.split(":").pop().trim()) }));
  assert.ok(pares.length >= 6, `esperava ao menos 6 leituras na rota, achei ${pares.length} — o extrator quebrou`);
  for (const { tabela, coluna } of COLUNAS_INEXISTENTES) {
    for (const par of pares.filter((p) => p.tabela === tabela)) {
      assert.ok(
        !par.colunas.includes(coluna),
        `${tabela}.${coluna} não existe no banco: PostgREST devolve 42703 e a corrente morre aqui`,
      );
    }
  }
});

test("a campanha aponta o projeto pela coluna que existe, e a lead traz o empreendimento dela", () => {
  const selectDeCampanha = codigo.match(/\.from\("marketing_campaigns"\)\s*\n?\s*\.select\("([^"]+)"\)/);
  assert.ok(selectDeCampanha, "a rota precisa ler marketing_campaigns");
  assert.match(selectDeCampanha[1], /project_id/, "sem project_id não há como chegar ao empreendimento");
  assert.match(selectDeCampanha[1], /external_campaign_id/, "sem o id externo a atribuição de órfãos vira null em todas as campanhas");

  const selectDeLead = codigo.match(/\.from\("leads"\)\s*\n?\s*\.select\("(campaign_id[^"]*)"\)/);
  assert.ok(selectDeLead, "a rota precisa ler leads por campanha");
  assert.match(selectDeLead[1], /development_id/,
    "development_id é a gaveta canônica: a ingestão grava ele e campaign_id na MESMA transação");
});

test("o erro de leitura das campanhas não morre calado", () => {
  assert.match(codigo, /logger\.error\(\s*"marketing\.cost_report\.campaign_columns_unavailable"/,
    "o fallback silencioso era o que escondia o 42703");
  assert.match(codigo, /campaignColumnsDegraded/,
    "a tela precisa poder distinguir 'sem produto' de 'não consegui ler o vínculo'");
  assert.match(codigo, /logger\.error\(\s*"marketing\.cost_report\.catalogo_de_produtos_falhou"/,
    "falha ao ler empreendimento/incorporadora tem de aparecer em log");
});

test("o nome comercial é o fantasia, com recuo para a razão social", () => {
  assert.equal(nomeDeIncorporadora({ id: "i", trade_name: "Kallas", legal_name: "Kallas Incorporações" }), "Kallas");
  assert.equal(nomeDeIncorporadora({ id: "i", trade_name: null, legal_name: "Kallas Incorporações" }), "Kallas Incorporações");
  assert.equal(nomeDeIncorporadora({ id: "i", trade_name: "   ", legal_name: "Kallas Incorporações" }), "Kallas Incorporações");
  assert.equal(nomeDeIncorporadora({ id: "i", trade_name: null, legal_name: null }), null,
    "sem nenhum nome a resposta é 'não sei', nunca string vazia");
});

test("as colunas pedidas pelo catálogo são as que existem", () => {
  assert.equal(COLUNAS_DE_INCORPORADORA, "id,trade_name,legal_name");
  assert.equal(COLUNAS_DE_EMPREENDIMENTO, "id,name,developer_id");
  assert.equal(COLUNAS_DA_PONTE_DE_PROJETO, "id,development_id");
});

// ── A REGRA DAS DUAS GAVETAS ────────────────────────────────────────────────
const catalogo = montarCatalogo({
  empreendimentos: [
    { id: "dev-arvo", name: "Arvo Teixeira da Silva", developer_id: "inc-kallas" },
    { id: "dev-spin", name: "Spin Mood", developer_id: null },
  ],
  incorporadoras: [{ id: "inc-kallas", trade_name: "Kallas", legal_name: "Kallas Incorporações" }],
  projetos: [{ id: "proj-arvo", development_id: "dev-arvo" }],
});

test("o que a LEAD gravou vence o cadastro da campanha", () => {
  // Medido: a campanha 120251113236400624 tem leads de TRÊS empreendimentos.
  // Deixar o cadastro da campanha mandar carimbaria os três com um só produto.
  const pelaLead = resolverProduto(catalogo, { developmentId: "dev-spin", projectId: "proj-arvo" });
  assert.deepEqual(pelaLead, { product: "Spin Mood", developer: null, origem: "lead" });
});

test("sem lead, o cadastro da campanha atravessa a ponte crm_projects → developments", () => {
  const pelaCampanha = resolverProduto(catalogo, { developmentId: null, projectId: "proj-arvo" });
  assert.deepEqual(pelaCampanha, { product: "Arvo Teixeira da Silva", developer: "Kallas", origem: "campanha" });
});

test("os dois lados do vínculo: sem nenhum dos dois, e com id fora do catálogo", () => {
  assert.deepEqual(resolverProduto(catalogo, {}), { product: null, developer: null, origem: "sem_vinculo" });
  assert.deepEqual(resolverProduto(catalogo, { projectId: "proj-que-nao-existe" }),
    { product: null, developer: null, origem: "sem_vinculo" });
  assert.deepEqual(resolverProduto(catalogo, { developmentId: "dev-fantasma" }),
    { product: null, developer: null, origem: "empreendimento_fora_do_catalogo" },
    "id declarado que o catálogo não conhece é OUTRA coisa de 'não declarou' — e a tela precisa saber qual");
});

test("empreendimento sem incorporadora é diferente de leitura que falhou", () => {
  // Spin Mood não tem developer_id: rótulo nulo aqui é FATO.
  assert.equal(resolverProduto(catalogo, { developmentId: "dev-spin" }).developer, null);
  assert.equal(catalogo.resolvido, true);

  // Já um 42703 na leitura das incorporadoras produz o MESMO rótulo nulo — e é
  // exatamente por isso que `resolvido` existe.
  const comFalha = montarCatalogo({
    empreendimentos: [{ id: "dev-arvo", name: "Arvo Teixeira da Silva", developer_id: "inc-kallas" }],
    falhas: [{ etapa: "incorporadoras", code: "42703", message: "column developers.name does not exist" }],
  });
  assert.equal(comFalha.resolvido, false, "falha de leitura tem de derrubar 'sei nomear'");
  assert.equal(resolverProduto(comFalha, { developmentId: "dev-arvo" }).developer, null);
  assert.equal(
    montarCatalogo({ falhas: [{ etapa: "ponte_de_projetos", code: "42P01" }] }).resolvido,
    true,
    "falha da ponte não é falha de nomear — cada silêncio com seu próprio sinal",
  );
});

test("a rota publica de onde vem o rótulo e quanto do gasto ficou sem produto", () => {
  assert.match(codigo, /developerLabels:\s*\{\s*\n?\s*resolved:\s*catalogo\.resolvido/);
  assert.match(codigo, /spendWithoutProduct/, "'Sem produto' precisa de tamanho declarado, senão passa por categoria");
  assert.match(codigo, /campaignsWithProject/);
});

// ── CPL/CAC EXIGEM GASTO MEDIDO ────────────────────────────────────────────
test("CPL só existe onde há gasto medido — os dois lados", () => {
  const comGasto = aggregate([{ campaignId: "c1", spend: 100, leads: 4, sales: 2 }], "campaign")[0];
  assert.equal(comGasto.cpl, 25);
  assert.equal(comGasto.cac, 50);

  const semGasto = aggregate([{ campaignId: "c2", spend: 0, leads: 4, sales: 2 }], "campaign")[0];
  assert.equal(semGasto.cpl, null, "R$ 0,00 de CPL lê-se 'lead de graça'; a verdade é 'gasto não amarrado a esta linha'");
  assert.equal(semGasto.cac, null);

  const semLead = aggregate([{ campaignId: "c3", spend: 500, leads: 0, sales: 0 }], "campaign")[0];
  assert.equal(semLead.cpl, null, "gasto sem lead continua sem CPL");
  assert.equal(semLead.spend, 500, "e o gasto não pode sumir por causa disso");
});

test("a gaveta vazia do id externo não vira zero de atribuição", () => {
  // Medido: 465 leads sem campaign_id e NENHUMA com metadata.meta.campaignId.
  // Zero órfãos "medidos" liberaria a IA a propor pausar verba por 0 vendas.
  assert.match(codigo, /const externalIdDrawerReadable = orphanLeads === 0 \|\| orphansWithExternalId > 0;/);
  assert.match(codigo, /attributionMeasurable = [^;]*externalIdDrawerReadable/);
  assert.match(codigo, /orphansWithExternalId,/, "a resposta publica o número que sustenta o veredito");
});
