/**
 * Contrato de SUBIR CAMPANHA COMPLETA.
 *
 * O orquestrador (`campaign-intake`, 271 linhas) já existia e estava sem um
 * único chamador de interface. Este contrato guarda as duas coisas que fazem
 * dele seguro — a prévia que não escreve e a criação pausada — e a forma da
 * resposta, porque a primeira versão do painel INVENTOU os nomes dos campos
 * (`planned`, `copy[]`) e teria renderizado vazio para sempre sem erro nenhum.
 *
 * Rodar: node --test tests/contracts/campanha-um-clique.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

const rota = ler("app", "api", "v1", "marketing", "campaign-intake", "route.ts");
const painel = ler("components", "marketing", "campaign-intake-panel.tsx");
const pagina = ler("app", "(crm)", "marketing", "page.tsx");
const fonteLib = ler("lib", "marketing", "campaign-intake.ts");

const lib = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonteLib))}`
);

const intencao = (extra = {}) => lib.normalizeIntent({
  product: "Inside Perdizes",
  angles: ["location", "lifestyle"],
  imageUrls: ["https://exemplo.com/a.jpg"],
  weeklyBudgetBrl: 1400,
  ...extra,
});

// ── A prévia não escreve ────────────────────────────────────────────────────

test("sem confirmToken a rota devolve prévia e não cria nada", () => {
  assert.match(rota, /mode: "previa"/);
  assert.match(rota, /prévia — nada foi criado na Meta/);
  // o ramo de criação só é alcançado depois da comparação de token
  const posToken = rota.slice(rota.indexOf("-------- CRIAÇÃO (com token) --------"));
  assert.ok(posToken.includes("uploadImageByUrl") || posToken.includes("assembleMediaRefs"),
    "subir mídia pertence ao ramo de criação, nunca ao da prévia");
});

test("a prévia simula a mídia em vez de subir", () => {
  const previa = rota.slice(rota.indexOf('mode: "previa"') - 2500, rota.indexOf('mode: "previa"'));
  assert.match(previa, /DRYRUN_HASH/);
  assert.match(previa, /DRYRUN_VIDEO_ID/);
});

test("material mudou depois da prévia ⇒ recusa, não cria o que ninguém viu", () => {
  assert.match(rota, /MATERIAL_CHANGED/);
  assert.match(rota, /incomingToken !== confirmToken/);
});

// ── A criação nasce pausada ─────────────────────────────────────────────────

test("tudo é criado PAUSED — criar não gasta", () => {
  assert.match(rota, /PAUSED/);
  assert.match(painel, /pausad/i, "a tela precisa dizer isso, não só o servidor");
});

test("criar campanha pertence à liderança e exige aprovação vigente", () => {
  assert.match(rota, /META_CAMPAIGN_AUTHORITY_MESSAGE/);
  assert.match(rota, /APPROVAL_INVALID/);
  assert.match(rota, /APPROVAL_EXPIRED/);
});

test("idempotência: a mesma intenção não cria a campanha duas vezes", () => {
  assert.match(rota, /mode: "ja_criada"/);
  assert.match(rota, /não recriamos/);
});

// ── O token cobre os valores EFETIVOS ───────────────────────────────────────

test("Página e formulário vêm do ambiente quando o corpo não manda", () => {
  const anterior = { p: process.env.META_PAGE_ID, f: process.env.META_LEAD_FORM_ID };
  process.env.META_PAGE_ID = "111222333";
  process.env.META_LEAD_FORM_ID = "444555666";
  try {
    const efetiva = lib.withAccountDefaults(intencao());
    assert.equal(efetiva.pageId, "111222333");
    assert.equal(efetiva.leadFormId, "444555666");
    assert.deepEqual(lib.missingForCommit(efetiva), [],
      "com ambiente configurado a campanha fica completa — era o que travava");
  } finally {
    if (anterior.p === undefined) delete process.env.META_PAGE_ID; else process.env.META_PAGE_ID = anterior.p;
    if (anterior.f === undefined) delete process.env.META_LEAD_FORM_ID; else process.env.META_LEAD_FORM_ID = anterior.f;
  }
});

test("o que vem no corpo tem precedência sobre o ambiente", () => {
  const anterior = process.env.META_PAGE_ID;
  process.env.META_PAGE_ID = "111222333";
  try {
    const efetiva = lib.withAccountDefaults(intencao({ pageId: "999888777" }));
    assert.equal(efetiva.pageId, "999888777",
      "veicular por outra Página numa campanha não pode exigir mexer no ambiente");
  } finally {
    if (anterior === undefined) delete process.env.META_PAGE_ID; else process.env.META_PAGE_ID = anterior;
  }
});

test("o padrão de conta é aplicado ANTES do token", () => {
  // Se o token fosse calculado sobre a intenção crua, prévia e criação
  // discordariam sobre qual Página sobe — e o token não protegeria nada.
  const iDefaults = rota.indexOf("withAccountDefaults(normalizeIntent(body))");
  const iToken = rota.indexOf("intentToken(intent)");
  assert.ok(iDefaults > -1 && iToken > iDefaults,
    "o token precisa cobrir os valores efetivos");
});

// ── A tela lê os nomes que a rota realmente devolve ─────────────────────────

test("o painel lê os campos reais da resposta, não campos inventados", () => {
  for (const campo of ["confirmToken", "structure", "sizing", "missing", "violations"]) {
    assert.match(painel, new RegExp(`\\b${campo}\\b`), `o painel precisa ler \`${campo}\``);
  }
  assert.ok(!/previa\.planned|previa\?\.planned/.test(painel),
    "`planned` nunca existiu na resposta — foi suposição da primeira versão");
});

test("copy: angles é 1:1 com primaryTexts; headlines/descriptions são pool", () => {
  assert.match(painel, /copy\?\.angles\?\.length/);
  assert.match(painel, /primaryTexts\?\.\[i\]/, "o primário é pareado pelo índice do ângulo");
  assert.match(painel, /Títulos \(/, "títulos são pool combinado pela Meta, não pareados");
});

test("o botão de criar some quando a criação já se sabe que falharia", () => {
  assert.match(painel, /const podeCriar = Boolean\(previa\?\.confirmToken\) && !faltando\.length && !violacoes\.length/);
  assert.match(painel, /\{podeCriar \? \(/);
});

test("violação de política é mostrada, não engolida", () => {
  // A rota recusa a criação com 422 COPY_POLICY. Se a tela não mostrasse as
  // violações, o usuário veria só "não foi possível criar" sem o motivo.
  assert.match(rota, /COPY_POLICY/);
  assert.match(painel, /viola a política de anúncio imobiliário/);
});

// ── A tela existe onde alguém a encontra ────────────────────────────────────

test("o painel está montado na etapa Agir da página de marketing", () => {
  assert.match(pagina, /import \{ CampaignIntakePanel \}/);
  assert.match(pagina, /<CampaignIntakePanel/);
  const trecho = pagina.slice(pagina.indexOf("<CampaignIntakePanel") - 900, pagina.indexOf("<CampaignIntakePanel"));
  assert.match(trecho, /foraDaEtapa\("agir"\)/,
    "criar campanha é ação — pertence a Agir, não a Entender");
});

test("o painel compõe o orquestrador em vez de repetir a montagem", () => {
  assert.match(painel, /"\/api\/v1\/marketing\/campaign-intake"/);
  const codigo = painel.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  // Estreito de propósito: `adsets` solto casava dentro de `recommendedAdSets`,
  // que é campo da RESPOSTA e legítimo na tela. O que não pode é endereço da
  // Graph API — é isso que significaria a tela montando campanha por fora.
  assert.ok(!/graph\.facebook\.com/i.test(codigo),
    "a tela não fala com a Meta direto — quem monta a estrutura é o servidor");
  // `access_token` cru pegaria `sessao.session?.access_token`, que é o token do
  // Supabase para autenticar na NOSSA API — legítimo e igual em toda tela. O
  // que não pode aparecer no cliente é credencial da Meta.
  assert.ok(!/META_ADS_ACCESS_TOKEN|META_AD_ACCOUNT_ID|["'`]act_/i.test(codigo),
    "credencial e conta de anúncio da Meta ficam no servidor");
});

// ── Ângulo desconhecido não derruba o servidor ──────────────────────────────

test("ângulo inválido no corpo do POST não estoura a rota", async () => {
  // Defeito real encontrado ao provar esta tela: `angleCandidates` é um switch
  // SEM `default`. Ângulo fora do tipo devolvia `undefined` e a linha seguinte
  // lia `c.primaries` — 500. O tipo `CreativeAngle` protegia o compilador; o
  // corpo de um POST não passa pelo compilador.
  const cs = await import(
    `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(ler("lib", "ai", "creative-strategist.ts")))}`
  );
  const brief = { product: "Inside Perdizes", city: "São Paulo", neighborhood: "Perdizes" };

  const r = cs.buildAdCopy(brief, ["location", "lifestyle", "investment"]);
  assert.ok(r.angles.length > 0, "ângulos inválidos caem no default do brief, não em campanha vazia");
  assert.ok(r.angles.every((a) => cs.isCreativeAngle(a)));

  assert.doesNotThrow(() => cs.buildAdCopy(brief, ["", "___", "DROP TABLE"]));
  assert.equal(cs.buildAdCopy(brief, ["localizacao", "localizacao"]).angles.filter((a) => a === "localizacao").length, 1,
    "repetido não vira anúncio duplicado");
});

test("a lista de ângulos da tela casa com o tipo, não com palpite", async () => {
  const cs = await import(
    `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(ler("lib", "ai", "creative-strategist.ts")))}`
  );
  const naTela = [...painel.matchAll(/\{ chave: "([a-z_]+)"/g)].map((m) => m[1]);
  assert.ok(naTela.length >= 6, "os seis ângulos precisam estar oferecidos");
  for (const chave of naTela) {
    assert.ok(cs.isCreativeAngle(chave), `"${chave}" não é um CreativeAngle — a tela ofereceria um 500`);
  }
});

// ── A conta de anúncios é escolha por campanha, e validada ──────────────────

test("a conta vem da Meta, não de uma lista nossa", async () => {
  // Lista mantida à mão envelhece: conta nova não aparece, conta removida
  // continua oferecida, e a campanha falha na criação em vez de na escolha.
  const rotaContas = ler("app", "api", "v1", "marketing", "ad-accounts", "route.ts");
  assert.match(rotaContas, /me\/adaccounts/);
  assert.ok(!/act_\d{6,}/.test(rotaContas), "nenhum id de conta escrito no código");
  assert.match(rotaContas, /export async function contasAlcancaveis/,
    "exportada para a criação validar contra a MESMA fonte que a tela ofereceu");
});

test("criar em conta que o token não alcança é recusado", () => {
  // Não é hipótese: META_AD_ACCOUNT_ID apontava para uma conta fora do alcance
  // do token, e a Meta responde a isso com "(#200) ... has NOT grant
  // ads_management" — mensagem que manda conferir permissão quando o problema
  // é o ID. Meses de diagnóstico no lado errado.
  assert.match(rota, /AD_ACCOUNT_UNREACHABLE/);
  assert.match(rota, /const alcancaveis = await contasAlcancaveis\(\);/);
  const iValida = rota.indexOf("AD_ACCOUNT_UNREACHABLE");
  const iCria = rota.indexOf("-------- CRIAÇÃO (com token) --------");
  assert.ok(iValida > -1 && iValida < iCria, "a validação vem antes da criação");
});

test("a escolha da tela tem precedência sobre o padrão do ambiente", () => {
  assert.match(rota, /const contaEscolhida = intent\.adAccountId \?\? account;/);
  assert.match(rota, /accountId: contaEscolhida \?\? account,/,
    "o plano precisa usar a conta escolhida, não a do ambiente");
});

test("a prévia não sai sem conta escolhida", () => {
  assert.match(painel, /!angulos\.length \|\| !conta/,
    "montar campanha sem saber de onde a verba sai é montar no escuro");
});

test("existe portão que denuncia o ID errado", () => {
  const portao = ler("scripts", "check-meta-account-reachable.mjs");
  assert.match(portao, /NÃO ESTÁ ENTRE AS QUE O TOKEN ALCANÇA/);
  assert.match(portao, /O problema é o ID, não a permissão/);
  assert.match(portao, /process\.exit\(0\)/, "sem Meta configurada não é falha");
  const pkg = JSON.parse(ler("package.json"));
  assert.equal(pkg.scripts["meta:conta"], "node scripts/check-meta-account-reachable.mjs");
});

test("escolher onde a verba sai pertence à liderança", () => {
  const rotaContas = ler("app", "api", "v1", "marketing", "ad-accounts", "route.ts");
  assert.match(rotaContas, /Escolher a conta de anúncios pertence à liderança/);
  assert.match(rotaContas, /status: 403/);
});

// ── Achados ao criar a estrutura DE VERDADE na conta ────────────────────────

test("cidade vai com RAIO — HOUSING recusa sem ele", () => {
  // Provado contra a conta real: sem raio a Meta responde "Inclua um raio de
  // pelo menos 17 quilômetros"; com raio, o conjunto é criado.
  const geo = ler("lib", "meta", "marketing", "housing-audience.ts");
  assert.match(geo, /geoLocations\.cities = geo\.cities\.map\(\(key\) => \(\{\s*key,\s*radius: HOUSING_MIN_RADIUS_KM/);
  assert.match(geo, /HOUSING_MIN_RADIUS_KM = 24/,
    "24 km (~15 mi) é o piso da política; colar nos 17 da mensagem de erro é ficar a um arredondamento da recusa");
});

test("nome de cidade é resolvido para a CHAVE da Meta", () => {
  // `housingTargetingSpec` monta `{ key }`, e a rota passava `brief.city`, que
  // é "São Paulo". A Meta espera "269969". A campanha nascia e o conjunto
  // falhava com "A localização para direcionamento não pode ser usada".
  const resolver = ler("lib", "meta", "marketing", "geo-resolver.ts");
  assert.match(resolver, /type=adgeolocation/);
  assert.match(resolver, /const exato = candidatos\.find/,
    "exato antes de aproximado: o primeiro da lista pode ser outra cidade");
  assert.ok(!/return candidatos\[0\]/.test(resolver),
    "pegar o primeiro anunciaria na cidade errada, gastando verba onde o imóvel não está");

  // os DOIS ramos da rota (prévia e criação) precisam resolver
  assert.equal([...rota.matchAll(/const chavesCidade = brief\.city/g)].length, 2);
  assert.match(rota, /pareceChave\(brief\.city\)/,
    "quem já mandou a chave não deve passar por resolução");
});

test("existe portão que pega form_id truncado", () => {
  // `meta_lead_sources` tinha duas "Spin Mood": uma com o id certo (17
  // dígitos) e outra truncada em 15. A truncada estava ATIVA e com dono
  // padrão — o backfill bateria num formulário inexistente.
  //
  // Nenhuma validação de FORMATO pega isso: 15 dígitos é tão plausível quanto
  // 17. Só perguntando à Meta.
  const portao = ler("scripts", "check-meta-forms-reachable.mjs");
  assert.match(portao, /NÃO EXISTE NA META/);
  assert.match(portao, /15 dígitos é tão plausível quanto/);
  assert.match(portao, /process\.exit\(0\)/, "sem Meta configurada não é falha");
  const pkg = JSON.parse(ler("package.json"));
  assert.equal(pkg.scripts["meta:formularios"], "node scripts/check-meta-forms-reachable.mjs");
});
