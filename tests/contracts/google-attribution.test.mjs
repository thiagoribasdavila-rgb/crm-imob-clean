/**
 * Contrato da ATRIBUIÇÃO DO GOOGLE.
 *
 * A promessa mais importante aqui é negativa: **sem identificador de clique, não
 * há atribuição**. Carimbar `google_ads` em toda lead que tenha "google" em
 * algum campo moveria verba com base em palpite — e atribuição errada é pior que
 * atribuição ausente.
 *
 * As URLs usadas nos testes são as reais dos quatro empreendimentos atendidos.
 *
 * Rodar: node --test tests/contracts/google-attribution.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const fonte = fs.readFileSync(path.join(raiz, "lib", "marketing", "google-attribution.ts"), "utf8");
const { lerAtribuicaoDoGoogle, nomeDaCampanhaDoGoogle, chaveDaCampanhaDoGoogle } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`
);

const INSIDE_PERDIZES = "https://www.teixeiraduarte.com.br/imoveis/inside-perdizes/?gad_source=1&gad_campaignid=24038824067&gbraid=0AAAABDCe5kRKpHEE&gclid=CjwKCAjwvZHTBhAlEiwA1ug5P9kT";
const ARVO = "https://grupokallas.com.br/empreendimento/kallas-paraiso/?utm_source=uselink&utm_medium=google&utm_campaign=arvo-teixeira-da-silva-institucional-incorporadora&gad_source=1&gad_campaignid=23959777615&gclid=CjwKCAjwvZHTBhAlEiwA1ug5P2v8";
const TIE = "https://conteudo.shpaisman.com.br/shpaisman-tie-aclimacao?utm_source=google-search&utm_medium=cpc&utm_campaign=pmax&gad_source=1&gad_campaignid=22847716493&gclid=CjwKCAjwvZHTBhAlEiwA1ug5P1KC";

test("lê a campanha do Inside Perdizes pela URL real", () => {
  const a = lerAtribuicaoDoGoogle({ url: INSIDE_PERDIZES });
  assert.equal(a.source, "google_ads");
  assert.equal(a.campaignExternalId, "24038824067");
  assert.equal(a.clickIdTipo, "gclid");
  assert.equal(a.landingPage, "https://www.teixeiraduarte.com.br/imoveis/inside-perdizes/");
});

test("lê a campanha do Arvo, que traz nome por UTM", () => {
  const a = lerAtribuicaoDoGoogle({ url: ARVO });
  assert.equal(a.campaignExternalId, "23959777615");
  assert.equal(a.utmCampaign, "arvo-teixeira-da-silva-institucional-incorporadora");
  assert.equal(a.utmMedium, "google");
  assert.equal(nomeDaCampanhaDoGoogle(a), "arvo-teixeira-da-silva-institucional-incorporadora");
});

test("lê o Tiê Aclimação e reconhece pmax", () => {
  const a = lerAtribuicaoDoGoogle({ url: TIE });
  assert.equal(a.utmCampaign, "pmax");
  assert.equal(a.utmMedium, "cpc");
  assert.equal(a.campaignExternalId, "22847716493");
});

test("SEM identificador de clique NÃO atribui — nem com UTM inteira", () => {
  // Link de e-mail marketing, post orgânico ou UTM colada à mão têm utm_source
  // e nenhum clique pago. Atribuir aqui moveria verba por palpite.
  const a = lerAtribuicaoDoGoogle({
    url: "https://exemplo.com/?utm_source=google&utm_medium=cpc&utm_campaign=teste",
  });
  assert.equal(a, null);
});

test("aceita gclid solto no payload, como os portais mandam", () => {
  const a = lerAtribuicaoDoGoogle({ nome: "Fulano", gclid: "Cj0KCQ123", utm_campaign: "perdizes-marco" });
  assert.equal(a.clickId, "Cj0KCQ123");
  assert.equal(a.utmCampaign, "perdizes-marco");
  assert.equal(a.landingPage, null, "sem URL não se inventa landing page");
});

test("reconhece gbraid e wbraid — iOS não manda gclid", () => {
  for (const tipo of ["gbraid", "wbraid", "dclid"]) {
    const a = lerAtribuicaoDoGoogle({ url: `https://x.com/?${tipo}=ABC123` });
    assert.ok(a, `${tipo} não reconhecido`);
    assert.equal(a.clickIdTipo, tipo);
  }
});

test("lê de dentro de metadata quando é lá que o dado chegou", () => {
  const a = lerAtribuicaoDoGoogle({ metadata: { gclid: "XYZ789", utm_campaign: "tie-aclimacao" } });
  assert.equal(a.clickId, "XYZ789");
  assert.equal(a.utmCampaign, "tie-aclimacao");
});

test("URL malformada não derruba a ingestão", () => {
  assert.doesNotThrow(() => lerAtribuicaoDoGoogle({ url: "isto não é uma url ????" }));
  assert.equal(lerAtribuicaoDoGoogle({ url: "%%%quebrado%%%" }), null);
  assert.equal(lerAtribuicaoDoGoogle({}), null);
  assert.equal(lerAtribuicaoDoGoogle(null), null);
});

test("a chave da campanha é o ID, não o nome", () => {
  // Renomear a campanha no Google não pode partir o histórico em duas.
  const antes = lerAtribuicaoDoGoogle({ gclid: "a", gad_campaignid: "999", utm_campaign: "nome-antigo" });
  const depois = lerAtribuicaoDoGoogle({ gclid: "b", gad_campaignid: "999", utm_campaign: "nome-novo" });
  assert.equal(chaveDaCampanhaDoGoogle(antes), chaveDaCampanhaDoGoogle(depois));
  assert.equal(chaveDaCampanhaDoGoogle(antes), "999");
});

test("sem id numérico, a chave cai para a UTM — e se identifica como tal", () => {
  const a = lerAtribuicaoDoGoogle({ gclid: "a", utm_campaign: "so-utm" });
  assert.equal(chaveDaCampanhaDoGoogle(a), "utm:so-utm");
});

test("clique sem campanha declarada é nomeado com honestidade", () => {
  const a = lerAtribuicaoDoGoogle({ gclid: "CjwKCAjwvZHTBhAlEiwA" });
  assert.equal(chaveDaCampanhaDoGoogle(a), null, "sem campanha, não há chave — e não se inventa uma");
  assert.match(nomeDaCampanhaDoGoogle(a), /sem campanha declarada/);
});

test("o módulo não faz rede nem depende de credencial do Google", () => {
  assert.ok(!/fetch\(|googleapis|oauth/i.test(fonte),
    "ler atribuição não pode depender da API de Ads — ela só é necessária para gasto");
});
