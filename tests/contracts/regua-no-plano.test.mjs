/**
 * CONTRATO — a régua da Meta aplicada ao PLANO, e as portas que a chamam.
 *
 * O que este arquivo protege, em uma frase: nenhuma composição de publicação
 * chega à Caixa de Aprovações sem passar pela MESMA régua, e a cidade vai pela
 * chave numérica da Meta, nunca pelo nome.
 *
 * ── Por que a prova é funcional, e não grep ────────────────────────────────
 *
 * Os planos abaixo são montados pelo pipeline REAL (`buildAdCopy` →
 * `housingTargetingSpec` → `leadCampaignSkeleton` → `planFullPublication`), o
 * mesmo que `ready-campaigns` usa. Se alguém trocar o construtor, isto quebra.
 * Grep só aparece onde não dá para executar: para provar que as rotas CHAMAM a
 * régua (uma rota Next não carrega isolada sem stub de infra) e para provar que
 * este módulo não contém uma segunda régua.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stripTypeScriptTypes } from "node:module";

import { pecaDoPlano, conferirPlanoNaMeta } from "../../lib/marketing/regua-no-plano.ts";
import { housingTargetingSpec, validateHousingTargeting, ehChaveDeGeo } from "../../lib/meta/marketing/housing-audience.ts";
import { buildAdCopy, toAssetFeedSpec, leadCampaignSkeleton } from "../../lib/ai/creative-strategist.ts";
import { productBrief } from "../../lib/atlas/developer-portfolio.ts";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

/**
 * Fonte sem comentários.
 *
 * Necessário porque o defeito é DESCRITO em comentário no arquivo que o
 * conserta — e uma asserção "esta string não aparece" acusaria a explicação do
 * conserto como se fosse o conserto desfeito. Portão que lê prosa vira trava
 * contra documentar.
 */
const semComentarios = (fonte) => fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/**
 * `publication-plan.ts` importa irmãos SEM extensão (`./audience-finder`), o que
 * o resolvedor ESM do node recusa. Carregá-lo aqui com os especificadores
 * reescritos para caminho absoluto é o que permite usar o CONSTRUTOR REAL do
 * plano — em vez de uma fixture parecida com ele, que é justamente o parente que
 * este repositório já pagou caro para não confiar.
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

/** Chave real de São Paulo, medida na Graph (search?type=adgeolocation). */
const SAO_PAULO = "269969";

/** Monta o plano pelo pipeline REAL, com o geo que o teste quiser. */
function plano({ cidades = [SAO_PAULO], angulos = ["investimento", "localizacao"], textos = null, midia = false } = {}) {
  const brief = productBrief("Arvo");
  const copy = buildAdCopy(brief, angulos);
  const copyFinal = textos ? { ...copy, primaryTexts: textos } : copy;
  const targeting = housingTargetingSpec({ countries: ["BR"], cities: cidades });
  const skeleton = leadCampaignSkeleton(brief, 700, targeting);
  const assetFeedSpec = toAssetFeedSpec(copyFinal, {
    linkUrl: "http://fb.me/",
    pageId: "PAGE_1",
    ...(midia ? { imageHashes: ["hash_real_1"] } : {}),
  });
  return planFullPublication({
    accountId: "act_123456",
    pageId: "PAGE_1",
    leadFormId: "FORM_1",
    product: brief.product,
    skeleton,
    assetFeedSpec,
    ...(midia ? { imageHashes: ["hash_real_1"] } : {}),
    adAngles: copyFinal.angles,
  });
}

// ---------------------------------------------------------------------------
// A peça sai do PLANO — não é remontada a partir dos mesmos insumos
// ---------------------------------------------------------------------------

test("pecaDoPlano lê texto, público, categoria e mídia dos passos que vão à Meta", () => {
  const steps = plano({ midia: true });
  const peca = pecaDoPlano(steps);

  const criativo = steps.find((s) => s.kind === "create_creative").payload;
  const conjunto = steps.find((s) => s.kind === "create_adset").payload;
  const campanha = steps.find((s) => s.kind === "create_campaign").payload;

  assert.deepEqual(peca.titulos, criativo.asset_feed_spec.titles.map((t) => t.text));
  assert.deepEqual(peca.textos, criativo.asset_feed_spec.bodies.map((t) => t.text));
  assert.deepEqual(peca.descricoes, criativo.asset_feed_spec.descriptions.map((t) => t.text));
  assert.deepEqual(peca.targeting, conjunto.targeting, "o público conferido é o MESMO objeto do conjunto");
  assert.deepEqual(peca.categoriasEspeciais, campanha.special_ad_categories);
  assert.equal(peca.midias.length, 1);
  assert.match(peca.midias[0].referencia, /hash_real_1/);
});

test("plano sem campanha deixa a categoria NÃO MEDIDA (null), não vazia", () => {
  // null e [] dizem coisas diferentes: null = não há campanha para medir;
  // [] = a campanha existe e não declarou HOUSING. Confundir os dois faria a
  // régua reprovar um plano que ninguém montou ainda.
  const soAnuncio = [{ kind: "create_ad", path: "act_1/ads", payload: { name: "x" } }];
  assert.equal(pecaDoPlano(soAnuncio).categoriasEspeciais, null);
  assert.equal(pecaDoPlano(soAnuncio).targeting, null);
});

// ---------------------------------------------------------------------------
// O DEFEITO: nome de cidade no campo em que a Meta espera a chave
// ---------------------------------------------------------------------------

test("nome de cidade no lugar da chave BLOQUEIA a proposta", () => {
  // Medido contra a conta real (leitura, 02/08/2026):
  //   delivery_estimate  key "269969"    → 19.700.000–23.200.000 MAU, ready
  //   delivery_estimate  key "São Paulo" → 0–0, sem estimate_ready
  //   targetingsentencelines "269969"    → "Brasil: São Paulo (+24 km) …"
  //   targetingsentencelines "São Paulo" → ": (+24 km)"   ← localização VAZIA
  // A Meta ACEITA o nome e resolve para lugar nenhum: 200, sem erro, sem gente.
  const v = conferirPlanoNaMeta(plano({ cidades: ["São Paulo"] }));
  assert.equal(v.podePropor, false);
  assert.match(v.motivos.join(" "), /cities\[0\]\.key/);
  assert.match(v.motivos.join(" "), /269969/, "o motivo mostra a forma certa, não só a errada");
});

test("com a CHAVE o mesmo plano passa — os dois lados do filtro", () => {
  const v = conferirPlanoNaMeta(plano({ cidades: [SAO_PAULO] }));
  assert.equal(v.podePropor, true, JSON.stringify(v.motivos));
  assert.ok(v.itens.some((i) => i.chave === "travas_housing" && i.estado === "aprovado"));
});

test("ehChaveDeGeo separa chave de nome, e geo-resolver usa ESTA função", () => {
  assert.equal(ehChaveDeGeo("269969"), true);
  assert.equal(ehChaveDeGeo("São Paulo"), false);
  assert.equal(ehChaveDeGeo(""), false);
  assert.equal(ehChaveDeGeo(269969), false, "chave é string na Graph");
  // Um segundo padrão em outro arquivo poderia afrouxar sozinho; o que decide
  // tem de ser o mesmo que reprova.
  const resolver = ler("lib", "meta", "marketing", "geo-resolver.ts");
  assert.match(resolver, /export \{ ehChaveDeGeo as pareceChave \} from "\.\/housing-audience"/);
});

test("cidade sem raio (ou com raio curto) é acusada — HOUSING exige raio também na cidade", () => {
  const semRaio = { age_min: 18, age_max: 65, genders: [], geo_locations: { cities: [{ key: SAO_PAULO }] } };
  const curto = { age_min: 18, age_max: 65, genders: [], geo_locations: { cities: [{ key: SAO_PAULO, radius: 10, distance_unit: "kilometer" }] } };
  assert.ok(validateHousingTargeting(semRaio).some((v) => v.rule === "raio_minimo"));
  assert.ok(validateHousingTargeting(curto).some((v) => v.rule === "raio_minimo"));
  // e o que housingTargetingSpec produz não é acusado
  assert.deepEqual(validateHousingTargeting(housingTargetingSpec({ cities: [SAO_PAULO] })), []);
});

// ---------------------------------------------------------------------------
// A porta que não dá para fechar por ausência
// ---------------------------------------------------------------------------

test("plano sem campanha/conjunto NÃO passa por ausência de dado", () => {
  // Sem estes passos não há categoria especial nem público para conferir, e
  // "não medido" não bloqueia. Um plano cru enviado à mão atravessaria tudo.
  const v = conferirPlanoNaMeta([{ kind: "create_ad", path: "act_1/ads", payload: { name: "x" } }]);
  assert.equal(v.podePropor, false);
  assert.match(v.motivos.join(" "), /create_campaign/);
  assert.match(v.motivos.join(" "), /create_adset/);
  assert.equal(conferirPlanoNaMeta([]).podePropor, false, "plano vazio também não passa");
});

test("texto que a política veta derruba o plano inteiro", () => {
  const v = conferirPlanoNaMeta(plano({ textos: ["Crédito aprovado na hora para você."] }));
  assert.equal(v.podePropor, false);
  assert.match(v.motivos.join(" "), /prometer financiamento|financiamento/i);
});

// ---------------------------------------------------------------------------
// A assimetria propor × ativar sobrevive ao caminho do plano
// ---------------------------------------------------------------------------

test("falta de mídia impede ATIVAR e não impede PROPOR", () => {
  // Sem esta separação a régua no gargalo zeraria a emissão de propostas:
  // `ready-campaigns` nunca tem mídia por desenho (é pendência de ativação
  // declarada em missingToActivate).
  const semMidia = conferirPlanoNaMeta(plano({ midia: false }));
  assert.equal(semMidia.podePropor, true, JSON.stringify(semMidia.motivos));
  assert.equal(semMidia.podeAtivar, false);
  assert.match(semMidia.motivosParaAtivar.join(" "), /sem imagem nem v[íi]deo/i);

  // e com mídia o bloqueio de ativar some
  const comMidia = conferirPlanoNaMeta(plano({ midia: true }));
  assert.equal(comMidia.podeAtivar, true, JSON.stringify(comMidia.motivosParaAtivar));
});

// ---------------------------------------------------------------------------
// Uma régua só — este módulo traduz, não julga
// ---------------------------------------------------------------------------

test("regua-no-plano não contém uma segunda régua", () => {
  const fonte = ler("lib", "marketing", "regua-no-plano.ts");
  for (const proibido of ["LIMITE_TITULO", "LIMITE_TEXTO", "age_min", "genders", "discriminacao", "atributo_pessoal"]) {
    assert.ok(
      !new RegExp(`\\b${proibido}\\b`).test(fonte),
      `regua-no-plano.ts menciona "${proibido}" — regra de política/limite tem de morar SÓ em regua-da-meta.ts`,
    );
  }
  assert.match(fonte, /conferirPecaNaMeta/, "ele delega à régua existente");
});

// ---------------------------------------------------------------------------
// CAMINHO DE EXECUÇÃO — quem chama, e onde a resposta é usada
// ---------------------------------------------------------------------------

test("as três portas que montam publicação chamam a régua", () => {
  const portas = [
    ["app", "api", "v1", "marketing", "ready-campaigns", "route.ts"],
    ["app", "api", "v1", "marketing", "proposals", "route.ts"],
    ["app", "api", "v1", "marketing", "campaign-intake", "route.ts"],
  ];
  for (const porta of portas) {
    const fonte = ler(...porta);
    assert.match(fonte, /conferirPlanoNaMeta\(/, `${porta.join("/")} não chama a régua`);
  }
});

test("ready-campaigns manda CHAVE, e nunca mais o nome da cidade", () => {
  const rota = semComentarios(ler("app", "api", "v1", "marketing", "ready-campaigns", "route.ts"));
  assert.match(rota, /housingTargetingSpec\(\{ countries: \["BR"\], cities: \[brief\.cityKey\] \}\)/);
  assert.ok(
    !/cities: \["São Paulo"\]/.test(rota),
    'a rota voltou a mandar o NOME da cidade no campo `key` — a Meta aceita e resolve para localização vazia',
  );
  // e o catálogo carrega a chave medida
  const catalogo = ler("lib", "atlas", "developer-portfolio.ts");
  assert.match(catalogo, new RegExp(`const SAO_PAULO = "${SAO_PAULO}"`));
  assert.equal(productBrief("Arvo").cityKey, SAO_PAULO);
  assert.equal(productBrief("Spin Mood").cityKey, SAO_PAULO);
});

test("proposals recusa com 422 e código próprio quando a régua bloqueia", () => {
  const rota = ler("app", "api", "v1", "marketing", "proposals", "route.ts");
  assert.match(rota, /META_POLICY_BLOCK/);
  assert.match(rota, /status: 422/);
  assert.match(rota, /veredito\.podePropor/);
});

test("o painel não deixa clicar no que a régua bloqueou", () => {
  const painel = ler("components", "atlas", "CampaignApprovalsPanel.tsx");
  assert.match(painel, /const podeEnviar = \(c: ReadyCampaign\): boolean => c\.podePropor === true/,
    "ausência de veredito não pode virar permissão");
  assert.match(painel, /disabled=\{submitting === c\.id \|\| !podeEnviar\(c\)\}/);
});
