/**
 * Contrato do QUE FALTA PARA ATIVAR — o outro lado da separação de portões.
 *
 * A régua da Meta deixou de tratar a peça visual como bloqueio de PROPOR
 * (`creative_assets` tem 0 linhas no banco: enquanto ela bloqueava, a tela de
 * composição não conseguia emitir uma única proposta). Soltar sem fechar a outra
 * ponta seria trocar um defeito por outro pior — a proposta sem imagem chegaria
 * ao "Aprovar campanha" com a mesma cara de uma proposta completa.
 *
 * Este contrato guarda as DUAS metades:
 *
 *   1. o plano sem peça visual chega à Caixa de Aprovações DIZENDO que não pode
 *      ser ativado, com onde resolver;
 *   2. o executor — a porta real da escrita — RECUSA esse mesmo plano.
 *
 * A segunda metade é a que impede o item de virar enfeite: um aviso na tela que
 * ninguém obedece é um aviso que o produto usa para se enganar. E as duas metades
 * são medidas sobre o MESMO plano, produzido pelo construtor de verdade
 * (`planFullPublication`), nunca por um objeto escrito à mão que pareça um plano.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");

import {
  pendenciasDeAtivacao,
  destinoDoPlano,
} from "../../lib/marketing/pendencias-de-ativacao.ts";
/**
 * ── POR QUE ESTE MODULO E CARREGADO A MAO (02/08/2026) ──────────────────────
 *
 * `publication-plan.ts` importa os irmaos SEM extensao (`from
 * "./audience-finder"`), e `node --test` nao resolve extensao omitida. Importar
 * direto morre com ERR_MODULE_NOT_FOUND.
 *
 * A tentacao era por `.ts` nos imports do modulo. Tentei, e QUEBROU o contrato
 * irmao `regua-no-plano.test.mjs`, que carrega o mesmo arquivo por data URL e
 * reescreve exatamente a string `from "./irmao"` — com a extensao no lugar, a
 * reescrita nao casava mais. Um conserto que quebra o vizinho nao e conserto.
 *
 * Entao aqui se usa a MESMA tecnica do irmao: le o fonte, tira os tipos,
 * reescreve os imports relativos para URL absoluta e avalia. Uma tecnica so
 * para os dois, em vez de duas verdades sobre como carregar o mesmo modulo.
 */
const { planFullPublication } = await (async () => {
  const alvo = path.join(raiz, "lib", "meta", "marketing", "publication-plan.ts");
  const dir = pathToFileURL(path.join(raiz, "lib", "meta", "marketing") + path.sep).href;
  let fonte = stripTypeScriptTypes(fs.readFileSync(alvo, "utf8"));
  for (const irmao of ["audience-finder", "housing-audience", "campaign-executor"]) {
    fonte = fonte.replaceAll(`from "./${irmao}"`, `from "${dir}${irmao}.ts"`);
  }
  return import(`data:text/javascript;base64,${Buffer.from(fonte, "utf8").toString("base64")}`);
})();
import { validateExecutionPlan } from "../../lib/meta/marketing/campaign-executor.ts";
import { housingTargetingSpec } from "../../lib/meta/marketing/housing-audience.ts";

const feed = (over = {}) => ({
  images: [],
  videos: [],
  titles: [{ text: "Apartamento em Perdizes" }],
  bodies: [{ text: "Condições direto com a incorporadora, sujeitas a análise de crédito." }],
  descriptions: [{ text: "Agende sua visita" }],
  call_to_action_types: ["SIGN_UP"],
  ...over,
});

const skeleton = () => ({
  campaign: {
    name: "[Atlas] Leads — Inside Perdizes",
    objective: "OUTCOME_LEADS",
    status: "PAUSED",
    special_ad_categories: ["HOUSING"],
    daily_budget: 8000,
  },
  adSets: [
    {
      name: "Broad — Perdizes",
      status: "PAUSED",
      targeting: housingTargetingSpec({ countries: ["BR"], cities: ["269969"] }),
    },
  ],
});

/** O plano como a composição o produz — `over` estraga UMA coisa por vez. */
function plano(over = {}) {
  return planFullPublication({
    accountId: "act_123456",
    pageId: "PAGE_777",
    leadFormId: "FORM_888",
    product: "Inside Perdizes",
    skeleton: skeleton(),
    assetFeedSpec: feed(),
    imageHashes: [],
    videoIds: [],
    adAngles: ["sair_do_aluguel"],
    ...over,
  });
}

/** A proposta como ela fica em `approval_requests.payload`. */
const proposta = (steps, kind = "create") => ({
  version: 1,
  kind,
  title: "[Atlas] Leads — Inside Perdizes",
  plan: { accountId: "act_123456", steps, pageId: "PAGE_777", leadFormId: "FORM_888" },
  projection: null,
  projectionBasis: null,
  governance: { requiresApproval: true, source: "deterministic", note: "nasce PAUSED" },
});

// ---------------------------------------------------------------------------
// 1 · A proposta sem peça visual não chega ao botão parecendo pronta
// ---------------------------------------------------------------------------

test("plano sem peça visual: a Caixa recebe a pendência, com onde resolver", () => {
  const v = pendenciasDeAtivacao(proposta(plano()));
  assert.equal(v.situacao, "com_pendencia");
  assert.equal(v.podeAtivar, false);
  assert.equal(v.pendencias, 1, JSON.stringify(v.itens.map((i) => i.chave)));
  assert.equal(v.problemasDaPeca, 0, `a peça em si está limpa: ${v.motivos.join(" | ")}`);
  const item = v.itens.find((i) => i.chave === "midia_presenca");
  assert.ok(item, "a falta da peça visual não chegou ao aprovador");
  assert.equal(item.impede, "ativar");
  assert.ok(item.ondeResolver?.href, "pendência sem caminho vira lista de queixas");
  assert.match(v.frase, /artefato|falta/i);
});

test("o MESMO plano é recusado pelo executor — o aviso não é enfeite", () => {
  // Se esta asserção cair, a tela avisa e a escrita passa: a proposta sem peça
  // visual chegaria à Meta. É a metade que impede a separação de virar frouxidão.
  const problemas = validateExecutionPlan(plano());
  assert.equal(problemas.length, 1, JSON.stringify(problemas));
  assert.match(problemas[0], /peça visual|peca visual/i);
});

// ---------------------------------------------------------------------------
// 2 · O converso — sem ele, "recusa tudo" passaria nos testes de cima
// ---------------------------------------------------------------------------

test("com a peça anexada, a proposta pode ativar e o executor valida limpo", () => {
  const comMidia = plano({ imageHashes: ["hash_de_teste_1"] });
  const v = pendenciasDeAtivacao(proposta(comMidia));
  assert.equal(v.situacao, "sem_pendencia");
  assert.equal(v.podeAtivar, true, v.motivos.join(" | "));
  assert.equal(v.pendencias, 0);
  assert.equal(v.itens.length, 0);
  assert.deepEqual(validateExecutionPlan(comMidia), []);
});

test("vídeo conta como peça visual — a régua não exige imagem", () => {
  const comVideo = plano({ videoIds: ["1234567890"] });
  assert.equal(pendenciasDeAtivacao(proposta(comVideo)).podeAtivar, true);
  assert.deepEqual(validateExecutionPlan(comVideo), []);
});

// ---------------------------------------------------------------------------
// 3 · Página e formulário — os outros dois artefatos
// ---------------------------------------------------------------------------

test("placeholder de Página/formulário é ausência, não valor", () => {
  // A composição deixa `<<PAGE_ID>>` quando o dono ainda não escolheu a Página.
  // Ler isso como "Página PAGE_ID" faria a Caixa dizer que está tudo resolvido.
  const semDestino = plano({ pageId: "<<PAGE_ID>>", leadFormId: "<<LEAD_FORM_ID>>", imageHashes: ["h1"] });
  const destino = destinoDoPlano(semDestino);
  assert.equal(destino.paginaId, null);
  assert.equal(destino.formularioId, null);

  const v = pendenciasDeAtivacao(proposta(semDestino));
  assert.equal(v.podeAtivar, false);
  assert.equal(v.pendencias, 2);
  assert.deepEqual(
    v.itens.map((i) => i.chave).sort(),
    ["artefato_formulario", "artefato_pagina"],
  );
});

test("Página e formulário resolvidos são lidos de onde o executor os lê", () => {
  const destino = destinoDoPlano(plano({ imageHashes: ["h1"] }));
  assert.equal(destino.paginaId, "PAGE_777");
  assert.equal(destino.formularioId, "FORM_888");
});

// ---------------------------------------------------------------------------
// 4 · O que não pode ser proposto também não pode ser ativado
// ---------------------------------------------------------------------------

test("peça reprovada na política chega ao aprovador como problema DA PEÇA", () => {
  const sujo = plano({
    assetFeedSpec: feed({ bodies: [{ text: "Crédito aprovado na hora, sem consulta ao SPC!" }] }),
    imageHashes: ["hash_de_teste_1"],
  });
  const v = pendenciasDeAtivacao(proposta(sujo));
  assert.equal(v.podeAtivar, false);
  assert.equal(v.pendencias, 0, "não falta artefato nenhum — falta a peça estar certa");
  assert.ok(v.problemasDaPeca >= 1);
  assert.ok(v.itens.some((i) => i.impede === "propor"));
  assert.match(v.motivos.join(" "), /cr[ée]dito|banco|an[áa]lise/i);
});

// ---------------------------------------------------------------------------
// 5 · Nada de zero falso, nada de falta inventada
// ---------------------------------------------------------------------------

test("payload ilegível é NÃO MEDIDO — nunca 'nada falta'", () => {
  for (const entrada of [null, undefined, "", 42, []]) {
    const v = pendenciasDeAtivacao(entrada);
    assert.equal(v.situacao, "nao_medido", `${JSON.stringify(entrada)} virou ${v.situacao}`);
    assert.equal(v.podeAtivar, false);
    assert.match(v.frase, /N[ÃA]O MEDIDO/);
  }
});

test("proposta sem plano de publicação é NÃO MEDIDO", () => {
  const v = pendenciasDeAtivacao({ kind: "create", plan: { accountId: "act_1", steps: [] } });
  assert.equal(v.situacao, "nao_medido");
  assert.equal(v.podeAtivar, false);
});

test("proposta que não cria criativo NÃO INVENTA falta de mídia", () => {
  // Pausar campanha age sobre estrutura que já existe. Cobrar peça visual dela
  // seria o erro simétrico do zero falso: doença desenhada onde não há pergunta.
  for (const kind of ["pause", "activate", "set_daily_budget"]) {
    const v = pendenciasDeAtivacao({ kind, plan: { objectType: "campaign", objectId: "120210" } });
    assert.equal(v.situacao, "nao_se_aplica", kind);
    assert.equal(v.pendencias, 0);
    assert.equal(v.podeAtivar, true, `${kind} não tem peça visual a exigir`);
    assert.deepEqual(v.motivos, []);
  }
});

// ---------------------------------------------------------------------------
// 6 · O acordo entre os dois lados é EXECUTADO, não conferido por grep
// ---------------------------------------------------------------------------

test("as duas leituras de mídia concordam — inclusive fora do asset_feed_spec", () => {
  // O executor e este módulo procuram a peça por CHAVE, cada um com a sua cópia
  // do vocabulário (o executor não pode importar valor de ninguém). Um criativo
  // que carregue o hash no object_story_spec — link ad clássico, sem
  // asset_feed_spec — tem de ser aceito pelos DOIS, ou um deles grita "sem
  // mídia" num plano que tem mídia.
  const steps = plano({ imageHashes: ["hash_de_teste_1"] });
  const criativo = steps.find((s) => s.kind === "create_creative");
  delete criativo.payload.asset_feed_spec.images;
  criativo.payload.object_story_spec.link_data.image_hash = "hash_de_teste_1";

  assert.deepEqual(validateExecutionPlan(steps), []);
  assert.equal(pendenciasDeAtivacao(proposta(steps)).podeAtivar, true);
});
