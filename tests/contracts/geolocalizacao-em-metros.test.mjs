/**
 * Contrato da GEOLOCALIZAÇÃO (frente 4.6).
 *
 * ── AS SEIS COISAS QUE ESTE ARQUIVO EXISTE PARA IMPEDIR ─────────────────────
 *
 * 1. DISTÂNCIA EM UNIDADE SEM SENTIDO. `geography` devolve METROS; `geometry`
 *    com SRID 4326 devolve GRAUS. MEDIDO no banco: a mesma distância deu
 *    110.574,4 em geography e 1.0000 em geometry. Um raio de "1000" em geometry
 *    varre um terço do planeta e nenhum erro aparece — a consulta responde,
 *    só responde errado. Aqui a distância é conferida contra a REFERÊNCIA do
 *    esferoide WGS84, calculada fora do banco.
 *
 * 2. LATITUDE E LONGITUDE TROCADAS. `ST_MakePoint` recebe LONGITUDE PRIMEIRO.
 *    Invertido, um empreendimento no Paraíso (lat -23,57 / lng -46,64) vai para
 *    o meio do Atlântico — e os CHECK de faixa NÃO pegam, porque -46 é uma
 *    latitude válida e -23 é uma longitude válida. Só a asserção de ORDEM pega.
 *
 * 3. O RAIO QUE ATRAVESSA A CERCA DO INQUILINO. As funções de raio são
 *    `security definer`: elas passam POR CIMA da RLS por definição. Se a
 *    condição de organização sair do corpo, um raio de 50 km em São Paulo
 *    devolve os empreendimentos de todas as imobiliárias do banco. Provado nos
 *    dois lados: a org A vê o dela e NÃO vê o da org B no MESMO ponto.
 *
 * 4. GEOCODIFICAR O MESMO ENDEREÇO DUAS VEZES. O que o dono proibiu
 *    explicitamente na Fase 1. A chave do cache é o endereço NORMALIZADO, então
 *    "Rua Mário Amaral, 267 - Paraíso/SP" e "rua mario amaral 267 paraiso sp"
 *    são a MESMA linha. E a precedência manual > importado > api é provada nos
 *    dois lados: manual sempre grava, api nunca desce manual.
 *
 * 5. COORDENADA INVENTADA. Nenhum dos 4 empreendimentos reais tem coordenada
 *    (medido: 0 de 4). O contrato NÃO congela o número 0 — ele proíbe a coisa
 *    errada: coordenada sem `geo_fonte` declarada. No dia em que alguém
 *    geocodificar de verdade, o contrato continua verde; no dia em que alguém
 *    chutar um ponto sem dizer de onde veio, ele doa.
 *
 * 6. LOCALIZAÇÃO RESIDENCIAL DA LEAD. O dono proibiu expor (item 5.4). A
 *    proibição vive aqui como asserção, não como combinado: `leads` não pode
 *    ganhar coluna de coordenada nesta migration.
 *
 * ── POR QUE METADE DAS ASSERÇÕES LÊ O ARQUIVO ──────────────────────────────
 *
 * `scripts/mutacoes.mjs` quebra ARQUIVOS e roda `npm run test:contracts`. Editar
 * um `.sql` NÃO muda o banco já aplicado — logo uma asserção que só chama o
 * banco NUNCA morre por mutação no SQL, por mais real que seja o comportamento
 * que ela prova. Então este arquivo faz as duas coisas, separadas e nomeadas:
 *
 *   · PARTE A chama as funções no banco e confere NÚMERO. Prova que existe.
 *   · PARTE B lê o SQL do repositório. É o que morre quando alguém mexe.
 *
 * PARTE B tira os COMENTÁRIOS antes de qualquer coisa. Sem isso, o cabeçalho da
 * migration — que explica a armadilha do `geometry` usando a palavra `geometry`
 * — reprovaria a própria guarda que o proíbe. É a armadilha nº 2 desta sessão, e
 * ela já mordeu cinco vezes em outros arquivos.
 *
 * Rodar: node --test tests/contracts/geolocalizacao-em-metros.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const ARQUIVO_MIGRATION = path.join(
  RAIZ, "supabase", "migrations", "20260730030000_geolocalizacao_inicial_postgis.sql",
);
const ARQUIVO_ROLLBACK = path.join(
  RAIZ, "supabase", "rollbacks", "20260730030000_geolocalizacao_inicial_postgis.down.sql",
);

// ── REFERÊNCIAS DO WGS84, CALCULADAS FORA DO BANCO ─────────────────────────
//
// Estes são os valores canônicos do esferoide WGS84, não medições do PostGIS.
// É de propósito: se a conta viesse do próprio banco, a asserção seria "o
// PostGIS concorda com o PostGIS" e passaria mesmo com geometry no lugar de
// geography.
const UM_GRAU_DE_LATITUDE_M = 110_574;
const UM_GRAU_DE_LONGITUDE_NO_EQUADOR_M = 111_320;
/** Um centésimo de grau de latitude. É a distância usada na prova do raio. */
const CEM_AVOS_DE_GRAU_M = UM_GRAU_DE_LATITUDE_M / 100; // 1.105,74 m

/** Tolerância de 5 m: o esferoide tem casas decimais, a referência é arredondada. */
const TOLERANCIA_M = 5;

// ── ORG REAL (só leitura) ─────────────────────────────────────────────────
const ORG_REAL = "7c8c71c1-e963-464c-be5c-ff8c7936f51a";

/**
 * ⚠ CADA TESTE CRIA AS PRÓPRIAS LINHAS, com id sorteado.
 *
 * A primeira versão usava UUIDs FIXOS compartilhados, e a suíte ficou
 * INTERMITENTE: 2 falhas em 1 de 3 execuções. Os sintomas foram
 * `23503 ... organization_id ... is not present` num INSERT que acabara de criar
 * a organização, e `consultas_evitadas` de uma linha de cache que sumiu no meio
 * do teste — a limpeza de um teste apagando as linhas de outro.
 *
 * Escrever em BANCO COMPARTILHADO com estado fixo é a receita da suíte
 * intermitente, e aqui é pior: OUTROS WORKFLOWS mexem nesta base ao mesmo tempo
 * (durante esta entrega `leads` foi de 683 para 483 sozinha). Suíte que pisca
 * ensina a equipe a rodar de novo até passar, e aí ela para de valer como prova.
 */
function novoCenario() {
  const sufixo = crypto.randomUUID().slice(0, 8);
  return {
    sufixo,
    orgA: crypto.randomUUID(),
    orgB: crypto.randomUUID(),
    devDentro: crypto.randomUUID(),
    devFora: crypto.randomUUID(),
    devSemPonto: crypto.randomUUID(),
    devOutraOrg: crypto.randomUUID(),
  };
}

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEM_BANCO = Boolean(URL && CHAVE);
const MOTIVO_SEM_BANCO =
  "sem NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY no ambiente: " +
  "a PARTE A (comportamento no banco) não roda. A PARTE B (SQL do repositório) roda sempre.";

function cabecalhos(extra = {}) {
  return {
    apikey: CHAVE,
    Authorization: `Bearer ${CHAVE}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

/** Chama uma função via PostgREST. Estoura com o corpo do erro, nunca em silêncio. */
async function rpc(nome, argumentos) {
  const resposta = await fetch(`${URL}/rest/v1/rpc/${nome}`, {
    method: "POST",
    headers: cabecalhos(),
    body: JSON.stringify(argumentos ?? {}),
  });
  const texto = await resposta.text();
  if (!resposta.ok) {
    throw new Error(`rpc ${nome} devolveu HTTP ${resposta.status}: ${texto}`);
  }
  return texto === "" ? null : JSON.parse(texto);
}

async function tabela(caminho, opcoes = {}) {
  const resposta = await fetch(`${URL}/rest/v1/${caminho}`, {
    headers: cabecalhos(opcoes.headers),
    method: opcoes.method ?? "GET",
    body: opcoes.body,
  });
  const texto = await resposta.text();
  if (!resposta.ok) {
    throw new Error(`${opcoes.method ?? "GET"} ${caminho} devolveu HTTP ${resposta.status}: ${texto}`);
  }
  return texto === "" ? null : JSON.parse(texto);
}

/**
 * Cria as linhas descartáveis. Os pontos são escolhidos para a conta fechar À
 * MÃO: no equador, no mesmo meridiano, separados por múltiplos exatos de 0,01
 * grau de latitude.
 *
 *   DENTRO      lat 0,01 -> 1.105,74 m do centro (0,0)
 *   FORA        lat 0,02 -> 2.211,49 m
 *   SEM_PONTO   sem coordenada — não pode aparecer em raio nenhum
 *   OUTRA_ORG   lat 0,01, org B — MESMO ponto que DENTRO, dono diferente
 */
/**
 * VARREDURA DOS PRÓPRIOS ÓRFÃOS, ANTES DE CRIAR MAIS.
 *
 * `limparFixtures` funciona — medido em 2026-07-30: o contrato roda 19/19, cria
 * duas organizações e as apaga, saldo zero. O que ele não cobre é a rodada que
 * MORRE antes do `t.after`, e essas não voltam sozinhas: sobraram 8 organizações
 * `ZZ CONTRATO GEO` de 4 rodadas mortas no mesmo dia — 8 de 10 linhas da tabela
 * `organizations`, num banco onde só 2 organizações são de verdade. Quem abrisse
 * um seletor de empresa amanhã veria lixo de teste em oito das dez linhas.
 *
 * O corte por IDADE não é detalhe: varrer o prefixo inteiro apagaria a fixture de
 * uma rodada SIMULTÂNEA no meio do trabalho dela — a mesma colisão que a trava da
 * organização de prova existe para evitar. 30 minutos é folgado para qualquer
 * rodada viva e curto para não acumular lixo entre execuções.
 *
 * O espaço vai CODIFICADO pelo mesmo motivo documentado em `limparCache`: espaço
 * cru na query string morre no proxy com uma página HTML, e o erro aponta para o
 * lugar errado.
 */
const IDADE_DE_ORFAO_MS = 30 * 60_000;

async function limparOrfaosDeRodadasMortas() {
  const corte = new Date(Date.now() - IDADE_DE_ORFAO_MS).toISOString();
  const filtro =
    `name=like.${encodeURIComponent("ZZ CONTRATO GEO %")}` +
    `&created_at=lt.${encodeURIComponent(corte)}`;

  await tabela(`organizations?${filtro}`, { method: "DELETE" });

  // DELETE que casa zero linhas devolve 204 e o helper não reclama — é o único
  // silêncio possível aqui. Conferir o resultado é o que transforma "limpou" de
  // suposição em fato.
  const restaram = (await tabela(`organizations?select=id&${filtro}`)) ?? [];
  if (restaram.length > 0) {
    throw new Error(
      `a varredura de órfãos não apagou ${restaram.length} organização(ões) ` +
        `ZZ CONTRATO GEO anteriores ao corte. Limpeza que não limpa e não avisa ` +
        `é como este resíduo nasceu.`,
    );
  }
}

async function prepararFixtures(c) {
  await limparOrfaosDeRodadasMortas();
  await tabela("organizations", {
    method: "POST",
    body: JSON.stringify([
      { id: c.orgA, name: `ZZ CONTRATO GEO A ${c.sufixo}`, slug: `zz-geo-a-${c.sufixo}` },
      { id: c.orgB, name: `ZZ CONTRATO GEO B ${c.sufixo}`, slug: `zz-geo-b-${c.sufixo}` },
    ]),
  });
  // ⚠ TODOS os objetos precisam das MESMAS chaves: o insert em lote do PostgREST
  // recusa com PGRST102 "All object keys must match" se um deles omitir uma. Daí
  // os `null` explícitos em ZZ SEM PONTO, em vez de chaves ausentes.
  const empreendimento = (id, org, name, latitude, longitude, neighborhood) => ({
    id,
    organization_id: org,
    name,
    latitude,
    longitude,
    geo_fonte: latitude === null ? null : "manual",
    city: "Testópolis",
    neighborhood,
  });
  await tabela("developments", {
    method: "POST",
    body: JSON.stringify([
      empreendimento(c.devDentro, c.orgA, "ZZ DENTRO", 0.01, 0, "Centro"),
      empreendimento(c.devFora, c.orgA, "ZZ FORA", 0.02, 0, "Centro"),
      empreendimento(c.devSemPonto, c.orgA, "ZZ SEM PONTO", null, null, "Sem Ponto"),
      empreendimento(c.devOutraOrg, c.orgB, "ZZ OUTRA ORG", 0.01, 0, "Centro"),
    ]),
  });
}

/** `organizations` tem ON DELETE CASCADE para `developments`: apagar a org basta. */
async function limparFixtures(c) {
  await tabela(`organizations?id=in.(${c.orgA},${c.orgB})`, { method: "DELETE" });
}

/**
 * Limpa só as chaves DESTE cenário. O valor vai CODIFICADO: a chave normalizada
 * tem espaços, e espaço cru na query string faz a requisição morrer no proxy com
 * uma página HTML de erro — não com um erro do PostgREST, o que manda a asserção
 * investigar o lugar errado.
 */
async function limparCache(sufixo) {
  const padrao = encodeURIComponent(`zz ${sufixo}%`);
  await tabela(`geocode_cache?endereco_normalizado=like.${padrao}`, { method: "DELETE" });
}

// ════════════════════════════════════════════════════════════════════════════
// PARTE A — O BANCO. Chama as funções e confere NÚMERO.
// ════════════════════════════════════════════════════════════════════════════

test("PARTE A · a distância sai em METROS e bate com a referência WGS84", { skip: TEM_BANCO ? false : MOTIVO_SEM_BANCO }, async () => {
  const umGrauLat = Number(await rpc("distancia_aproximada_m", { p_lat_a: 0, p_lng_a: 0, p_lat_b: 1, p_lng_b: 0 }));
  const umGrauLng = Number(await rpc("distancia_aproximada_m", { p_lat_a: 0, p_lng_a: 0, p_lat_b: 0, p_lng_b: 1 }));
  const centesimo = Number(await rpc("distancia_aproximada_m", { p_lat_a: 0, p_lng_a: 0, p_lat_b: 0.01, p_lng_b: 0 }));

  assert.ok(
    Math.abs(umGrauLat - UM_GRAU_DE_LATITUDE_M) < TOLERANCIA_M,
    `1 grau de latitude devia dar ~${UM_GRAU_DE_LATITUDE_M} m e deu ${umGrauLat}. ` +
      `Se veio ~1, a função trocou geography por geometry e a unidade virou GRAU.`,
  );
  assert.ok(
    Math.abs(umGrauLng - UM_GRAU_DE_LONGITUDE_NO_EQUADOR_M) < TOLERANCIA_M,
    `1 grau de longitude no equador devia dar ~${UM_GRAU_DE_LONGITUDE_NO_EQUADOR_M} m e deu ${umGrauLng}`,
  );
  assert.ok(
    Math.abs(centesimo - CEM_AVOS_DE_GRAU_M) < TOLERANCIA_M,
    `0,01 grau devia dar ~${CEM_AVOS_DE_GRAU_M} m e deu ${centesimo}`,
  );

  // Ponto igual a si mesmo é zero; coordenada ausente é NULO, nunca zero —
  // zero seria "está exatamente aqui", que é a leitura mais perigosa possível.
  assert.equal(Number(await rpc("distancia_aproximada_m", { p_lat_a: -23.5713, p_lng_a: -46.642, p_lat_b: -23.5713, p_lng_b: -46.642 })), 0);
  assert.equal(
    await rpc("distancia_aproximada_m", { p_lat_a: null, p_lng_a: 0, p_lat_b: 0, p_lng_b: 1 }),
    null,
    "coordenada ausente tem de virar NULO; virar 0 diria 'mesmo lugar'",
  );
});

test("PARTE A · o raio ENTREGA quem está dentro e RECUSA quem está fora", { skip: TEM_BANCO ? false : MOTIVO_SEM_BANCO }, async (t) => {
  const c = novoCenario();
  await prepararFixtures(c);
  t.after(() => limparFixtures(c));

  const nomes = (linhas) => linhas.map((l) => l.name).sort();

  const raio1500 = await rpc("empreendimentos_no_raio", { p_organization_id: c.orgA, p_latitude: 0, p_longitude: 0, p_raio_m: 1500 });
  assert.deepEqual(
    nomes(raio1500), ["ZZ DENTRO"],
    "com raio de 1500 m só DENTRO (1.105,74 m) entra: FORA está a 2.211,49 m e SEM PONTO não tem coordenada",
  );
  assert.ok(
    Math.abs(Number(raio1500[0].distancia_m) - CEM_AVOS_DE_GRAU_M) < TOLERANCIA_M,
    `a distância devolvida devia ser ~${CEM_AVOS_DE_GRAU_M} m e foi ${raio1500[0].distancia_m}`,
  );

  // O outro lado, com o raio ABERTO: FORA não estava faltando por bug, estava
  // fora por distância. Sem esta asserção, uma função que devolve sempre uma
  // linha só passaria na de cima.
  const raio5000 = await rpc("empreendimentos_no_raio", { p_organization_id: c.orgA, p_latitude: 0, p_longitude: 0, p_raio_m: 5000 });
  assert.deepEqual(
    nomes(raio5000), ["ZZ DENTRO", "ZZ FORA"],
    "com raio de 5000 m os dois com coordenada entram — e SEM PONTO continua fora",
  );
  assert.ok(
    Math.abs(Number(raio5000.find((l) => l.name === "ZZ FORA").distancia_m) - 2 * CEM_AVOS_DE_GRAU_M) < 2 * TOLERANCIA_M,
    "FORA está a exatamente o dobro da distância de DENTRO",
  );

  // A ordem é do mais perto para o mais longe.
  assert.deepEqual(raio5000.map((l) => l.name), ["ZZ DENTRO", "ZZ FORA"], "a lista vem ordenada por distância");

  // A BORDA, com 1 metro de precisão. A distância real é 1.105,74 m.
  assert.deepEqual(
    await rpc("empreendimentos_no_raio", { p_organization_id: c.orgA, p_latitude: 0, p_longitude: 0, p_raio_m: 1105 }),
    [],
    "raio de 1105 m tem de EXCLUIR o ponto que está a 1.105,74 m",
  );
  assert.deepEqual(
    nomes(await rpc("empreendimentos_no_raio", { p_organization_id: c.orgA, p_latitude: 0, p_longitude: 0, p_raio_m: 1106 })),
    ["ZZ DENTRO"],
    "raio de 1106 m tem de INCLUIR o mesmo ponto",
  );
});

test("PARTE A · o raio não atravessa a cerca da organização", { skip: TEM_BANCO ? false : MOTIVO_SEM_BANCO }, async (t) => {
  const c = novoCenario();
  await prepararFixtures(c);
  t.after(() => limparFixtures(c));

  const nomes = (linhas) => linhas.map((l) => l.name).sort();
  const daA = await rpc("empreendimentos_no_raio", { p_organization_id: c.orgA, p_latitude: 0, p_longitude: 0, p_raio_m: 5000 });
  const daB = await rpc("empreendimentos_no_raio", { p_organization_id: c.orgB, p_latitude: 0, p_longitude: 0, p_raio_m: 5000 });

  // ZZ OUTRA ORG está no MESMO ponto que ZZ DENTRO. A única coisa que os separa
  // é o dono — então se a cerca cair, ele aparece nas duas listas.
  assert.deepEqual(nomes(daA), ["ZZ DENTRO", "ZZ FORA"], "a org A não pode ver o empreendimento da org B");
  assert.deepEqual(nomes(daB), ["ZZ OUTRA ORG"], "a org B só vê o dela, no mesmo ponto");
  assert.ok(!nomes(daA).includes("ZZ OUTRA ORG"));
  assert.ok(!nomes(daB).includes("ZZ DENTRO"));
});

test("PARTE A · o mesmo endereço nunca é geocodificado duas vezes", { skip: TEM_BANCO ? false : MOTIVO_SEM_BANCO }, async (t) => {
  const { sufixo } = novoCenario();
  const chaveEsperada = `zz ${sufixo} rua de teste 42`;
  const escrito = `ZZ ${sufixo} — Rua de Teste, 42`;
  t.after(() => limparCache(sufixo));
  await limparCache(sufixo);

  const gravar = (args) => rpc("geocode_cache_gravar", args);
  const primeiro = (linhas) => linhas[0];

  // A normalização é a chave: três grafias, um registro.
  assert.equal(primeiro(await gravar({ p_endereco: escrito, p_latitude: -23.5, p_longitude: -46.6, p_fonte: "api", p_provedor: "provedor_ficticio_de_teste" })).gravou, true);
  assert.equal(
    primeiro(await gravar({ p_endereco: `zz   ${sufixo} -- rua de TESTE 42`, p_latitude: -1, p_longitude: -1, p_fonte: "api", p_provedor: "provedor_ficticio_de_teste" })).gravou,
    false,
    "o MESMO endereço com outra grafia não pode ser geocodificado de novo",
  );

  const leitura = await rpc("geocodificar_do_cache", { p_endereco: `ZZ ${sufixo}, RUA DE TESTE 42!!!` });
  assert.equal(leitura.length, 1, "grafia diferente tem de achar a MESMA linha");
  assert.equal(leitura[0].endereco_chave, chaveEsperada);
  assert.equal(leitura[0].acerto_de_cache, true);

  // Endereço nunca visto devolve ZERO linhas — nunca uma coordenada plausível.
  assert.deepEqual(
    await rpc("geocodificar_do_cache", { p_endereco: `ZZ ${sufixo} rua que nunca existiu 99999` }),
    [],
    "endereço desconhecido tem de devolver vazio, não um chute",
  );

  // O contador é a métrica que justifica o cache existir.
  const [linha] = await tabela(`geocode_cache?endereco_normalizado=eq.${encodeURIComponent(chaveEsperada)}&select=consultas_evitadas`);
  assert.ok(linha, "a linha do cache tem de continuar lá — se sumiu, um teste apagou o estado do outro");
  assert.ok(linha.consultas_evitadas >= 1, "cada acerto tem de ser contado em consultas_evitadas");
});

test("PARTE A · a precedência da fonte vale nos dois sentidos", { skip: TEM_BANCO ? false : MOTIVO_SEM_BANCO }, async (t) => {
  const { sufixo } = novoCenario();
  const escrito = `ZZ ${sufixo} — Rua da Precedência, 7`;
  const chave = `zz ${sufixo} rua da precedencia 7`;
  t.after(() => limparCache(sufixo));
  await limparCache(sufixo);

  const gravar = async (args) => (await rpc("geocode_cache_gravar", args))[0];

  assert.equal((await gravar({ p_endereco: escrito, p_latitude: 1, p_longitude: 1, p_fonte: "api", p_provedor: "provedor_ficticio_de_teste" })).gravou, true, "api grava em endereço novo");
  assert.equal((await gravar({ p_endereco: escrito, p_latitude: 2, p_longitude: 2, p_fonte: "importado" })).gravou, true, "importado SOBE sobre api");
  assert.equal((await gravar({ p_endereco: escrito, p_latitude: 3, p_longitude: 3, p_fonte: "api", p_provedor: "provedor_ficticio_de_teste" })).gravou, false, "api NÃO desce importado");
  assert.equal((await gravar({ p_endereco: escrito, p_latitude: 4, p_longitude: 4, p_fonte: "importado" })).gravou, false, "importado não sobrescreve importado — senão o reprocessamento bate para sempre");

  // A correção humana é soberana, e continua soberana na segunda vez.
  assert.equal((await gravar({ p_endereco: escrito, p_latitude: 5, p_longitude: 5, p_fonte: "manual" })).gravou, true, "manual SEMPRE grava: é a correção manual que o dono pediu");
  assert.equal((await gravar({ p_endereco: escrito, p_latitude: 6, p_longitude: 6, p_fonte: "manual" })).gravou, true, "manual de novo ainda grava");
  assert.equal((await gravar({ p_endereco: escrito, p_latitude: 7, p_longitude: 7, p_fonte: "api", p_provedor: "provedor_ficticio_de_teste" })).gravou, false, "api NUNCA desce uma correção manual");

  const [linha] = await tabela(`geocode_cache?endereco_normalizado=eq.${encodeURIComponent(chave)}&select=latitude,fonte`);
  assert.ok(linha, "a linha do cache tem de continuar lá");
  assert.equal(linha.fonte, "manual", "quem ficou guardado é a correção manual");
  assert.equal(Number(linha.latitude), 6, "e é a ÚLTIMA correção manual, não a primeira");

  // Recusas nomeadas: nunca falha em silêncio.
  assert.match((await gravar({ p_endereco: escrito, p_latitude: 1, p_longitude: 1, p_fonte: "chute" })).motivo, /fonte invalida/);
  assert.match((await gravar({ p_endereco: "  ,,,  ", p_latitude: 1, p_longitude: 1, p_fonte: "manual" })).motivo, /endereco vazio/);
  assert.match((await gravar({ p_endereco: `ZZ ${sufixo} outro`, p_latitude: 1, p_longitude: null, p_fonte: "manual" })).motivo, /coordenada incompleta/);
});

test("PARTE A · nenhuma coordenada sem procedência declarada", { skip: TEM_BANCO ? false : MOTIVO_SEM_BANCO }, async () => {
  const todos = await tabela("developments?select=name,latitude,longitude,geo_fonte");
  const chutados = todos.filter((d) => (d.latitude !== null || d.longitude !== null) && !d.geo_fonte);
  assert.deepEqual(
    chutados.map((d) => d.name), [],
    "coordenada sem `geo_fonte` é coordenada que ninguém sabe de onde veio",
  );

  const meia = todos.filter((d) => (d.latitude === null) !== (d.longitude === null));
  assert.deepEqual(meia.map((d) => d.name), [], "latitude sem longitude (ou o contrário) não é um ponto");

  // Não congela o número de geocodificados: só relata, para a entrega não poder
  // mentir sobre cobertura.
  const comPonto = todos.filter((d) => d.latitude !== null).length;
  console.log(`      · empreendimentos: ${todos.length} no total, ${comPonto} com coordenada`);
});

test("PARTE A · a concentração de demanda não perde lead pelo caminho", { skip: TEM_BANCO ? false : MOTIVO_SEM_BANCO }, async () => {
  const regioes = await rpc("concentracao_de_demanda_por_regiao", { p_organization_id: ORG_REAL });
  const [cobertura] = await rpc("concentracao_de_demanda_cobertura", { p_organization_id: ORG_REAL });

  const somaEmpreendimento = regioes.reduce((t, r) => t + Number(r.leads_por_empreendimento), 0);
  const somaBairro = regioes.reduce((t, r) => t + Number(r.leads_por_bairro_preferido), 0);

  // A IDENTIDADE. Foi exatamente aqui que 7 leads desapareciam: o
  // `neighborhood is not null` da primeira versão descartava as do Spin Mood, e
  // a soma dava 185 contra 192 na cobertura, sem nada avisar.
  assert.equal(
    somaEmpreendimento, Number(cobertura.com_empreendimento),
    "a soma da concentração tem de fechar com a cobertura: lead com empreendimento de interesse " +
      "não pode sumir só porque o empreendimento está sem bairro cadastrado",
  );
  assert.equal(somaBairro, Number(cobertura.com_bairro_preferido), "o mesmo para o bairro preferido");

  // Quando existe lead em empreendimento sem bairro, a faixa própria tem de
  // aparecer — o número não vai para debaixo do tapete nem para outro bairro.
  if (Number(cobertura.com_empreendimento_sem_bairro) > 0) {
    const faixa = regioes.find((r) => r.regiao === "(bairro não informado)");
    assert.ok(faixa, "lead em empreendimento sem bairro precisa da faixa '(bairro não informado)'");
    assert.equal(Number(faixa.leads_por_empreendimento), Number(cobertura.com_empreendimento_sem_bairro));
  }

  assert.ok(
    Number(cobertura.leads_total) >= Number(cobertura.com_empreendimento),
    "o total não pode ser menor que o subconjunto",
  );
  console.log(
    `      · cobertura da org real: ${cobertura.leads_total} leads, ` +
      `${cobertura.com_empreendimento} com empreendimento (${cobertura.com_empreendimento_sem_bairro} sem bairro), ` +
      `${cobertura.com_bairro_preferido} com bairro preferido, ${cobertura.com_regiao_preferida} com regiao preferida, ` +
      `${cobertura.sem_nenhum_sinal_de_regiao} sem sinal nenhum`,
  );
});

test("PARTE A · a agregação por região mostra o que NÃO tem coordenada", { skip: TEM_BANCO ? false : MOTIVO_SEM_BANCO }, async () => {
  const regioes = await rpc("empreendimentos_por_regiao", { p_organization_id: ORG_REAL });
  assert.ok(regioes.length > 0, "a org real tem empreendimentos; a agregação não pode vir vazia");

  for (const r of regioes) {
    assert.ok(
      Number(r.geocodificados) <= Number(r.total),
      `${r.regiao}: geocodificados (${r.geocodificados}) não pode passar do total (${r.total})`,
    );
    // Sem coordenada nenhuma, o centro tem de ser NULO. Um centro inventado é a
    // pior saída: ele vira ponto no mapa e ninguém desconfia.
    if (Number(r.geocodificados) === 0) {
      assert.equal(r.centro_latitude, null, `${r.regiao} não tem coordenada: o centro tem de ser nulo`);
      assert.equal(r.centro_longitude, null);
    }
  }
});

test("PARTE A · anon e authenticated são recusados", { skip: TEM_BANCO ? false : MOTIVO_SEM_BANCO }, async () => {
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anon) {
    console.log("      · sem chave publishable no ambiente: o outro lado da cerca não foi medido aqui");
    return;
  }
  const comoAnon = { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json" };

  const fn = await fetch(`${URL}/rest/v1/rpc/distancia_aproximada_m`, {
    method: "POST", headers: comoAnon,
    body: JSON.stringify({ p_lat_a: 0, p_lng_a: 0, p_lat_b: 1, p_lng_b: 0 }),
  });
  assert.ok(fn.status >= 400, `a chave publishable não pode executar a função (HTTP ${fn.status})`);

  const tab = await fetch(`${URL}/rest/v1/geocode_cache?select=*`, { headers: comoAnon });
  assert.ok(tab.status >= 400, `a chave publishable não pode ler o cache (HTTP ${tab.status})`);
});

// ════════════════════════════════════════════════════════════════════════════
// PARTE B — O SQL DO REPOSITÓRIO. É o que morre por mutação.
// ════════════════════════════════════════════════════════════════════════════

/**
 * Comentário fora ANTES de tudo. O cabeçalho da migration explica a armadilha do
 * `geometry` escrevendo `geometry`, e explica a troca de lat/lng escrevendo
 * `ST_MakePoint(latitude`. Sem esta limpeza, a guarda reprovaria o texto que a
 * justifica — a armadilha nº 2, que já mordeu cinco vezes nesta sessão.
 */
function semComentarios(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Espaço colapsado: asserção presa a indentação quebra no primeiro reflow. */
function achatado(sql) {
  return semComentarios(sql).replace(/\s+/g, " ").toLowerCase();
}

const SQL_CRU = fs.readFileSync(ARQUIVO_MIGRATION, "utf8");
const SQL = achatado(SQL_CRU);

/** Recorta o corpo de uma função: ancorar na REGIÃO, não na linha. */
function corpoDaFuncao(nome) {
  const inicio = SQL.indexOf(`create or replace function public.${nome}`);
  assert.notEqual(inicio, -1, `a função ${nome} desapareceu da migration`);
  const fim = SQL.indexOf(`grant execute on function public.${nome}`, inicio);
  assert.notEqual(fim, -1, `a função ${nome} ficou sem grant para service_role`);
  return SQL.slice(inicio, fim);
}

test("PARTE B · o ponto é geography, e a longitude vem PRIMEIRO", () => {
  // Duas colunas de ponto: developments.geo e geocode_cache.geo.
  const pontos = SQL.match(/extensions\.geography\(point, 4326\)/g) ?? [];
  assert.equal(pontos.length, 2, "developments.geo e geocode_cache.geo têm de ser geography(Point,4326)");

  // A ORDEM. Toda chamada a ST_MakePoint recebe longitude antes de latitude.
  const chamadas = SQL.match(/st_makepoint\([^)]*\)/g) ?? [];
  assert.ok(chamadas.length >= 5, `esperava ao menos 5 chamadas a ST_MakePoint, achei ${chamadas.length}`);
  for (const chamada of chamadas) {
    const [primeiro] = chamada.replace(/st_makepoint\(\s*/, "").split(",");
    // `longitude` nas colunas, `p_longitude`/`p_lng_a` nos parâmetros.
    assert.match(
      primeiro, /\b(p_)?(lng|long)/,
      `ST_MakePoint recebe LONGITUDE primeiro e esta chamada começa com "${primeiro.trim()}": ${chamada}. ` +
        `Trocado, o Paraíso (lat -23,57 / lng -46,64) vai para o Atlântico e nenhum CHECK pega.`,
    );
  }
});

test("PARTE B · geometry só aparece na agregação, nunca na distância", () => {
  // ST_Collect/ST_Centroid não existem para geography: ali o cast é legítimo.
  const regiao = corpoDaFuncao("empreendimentos_por_regiao");
  const inicioDaAgregacao = SQL.indexOf(regiao);
  const fimDaAgregacao = inicioDaAgregacao + regiao.length;

  let posicao = SQL.indexOf("extensions.geometry");
  let quantas = 0;
  while (posicao !== -1) {
    quantas += 1;
    assert.ok(
      posicao >= inicioDaAgregacao && posicao < fimDaAgregacao,
      "`extensions.geometry` só pode aparecer dentro de empreendimentos_por_regiao (ST_Collect/ST_Centroid, " +
        `que não existem para geography). Achei uma em ${posicao}, fora da região ` +
        `[${inicioDaAgregacao}, ${fimDaAgregacao}). Em ST_Distance ou ST_DWithin, geometry devolve GRAUS: ` +
        "o raio deixa de ser metro e nada acusa.",
    );
    posicao = SQL.indexOf("extensions.geometry", posicao + 1);
  }
  assert.ok(quantas > 0, "a agregação por região usa ST_Collect, que exige o cast para geometry");

  // E toda medição de distância/raio é sobre geography.
  for (const nome of ["st_distance", "st_dwithin"]) {
    const ocorrencias = SQL.split(nome).length - 1;
    assert.ok(ocorrencias > 0, `${nome} desapareceu da migration`);
  }
  assert.ok(
    SQL.includes("st_dwithin"),
    "o filtro por raio tem de usar ST_DWithin — ele é o que usa o índice GIST",
  );
});

test("PARTE B · as funções de raio carregam a cerca da organização", () => {
  for (const nome of ["empreendimentos_no_raio", "imoveis_no_raio"]) {
    const corpo = corpoDaFuncao(nome);
    assert.match(
      corpo, /organization_id = p_organization_id/,
      `${nome} é security definer: sem a condição de organização no corpo, ela devolve ` +
        `empreendimento de TODA imobiliária do banco.`,
    );
    assert.match(corpo, /security definer/, `${nome} precisa ser security definer`);
    assert.match(corpo, /set search_path = ''/, `${nome} precisa fixar search_path vazio`);
    assert.match(
      corpo, /geo is not null/,
      `${nome} tem de excluir quem não tem coordenada — ausência de dado nunca vira proximidade`,
    );
  }
  // imoveis_no_raio cerca as DUAS pontas da junção.
  const imoveis = corpoDaFuncao("imoveis_no_raio");
  assert.ok(
    (imoveis.match(/organization_id = p_organization_id/g) ?? []).length >= 2,
    "imoveis_no_raio junta properties com developments: as duas pontas precisam da cerca",
  );
});

test("PARTE B · geo é DERIVADA de latitude/longitude, nunca escrita à mão", () => {
  const geradas = SQL.match(/generated always as \(/g) ?? [];
  assert.equal(geradas.length, 2, "developments.geo e geocode_cache.geo têm de ser colunas GERADAS");
  assert.ok(
    (SQL.match(/\) stored/g) ?? []).length >= 2,
    "coluna gerada tem de ser STORED para poder entrar no índice GIST",
  );
  // Índice de verdade, com a opclass qualificada — nas DUAS tabelas.
  //
  // ⚠ `assert.match` aqui era um passe falso: ele exige UMA ocorrência, e são
  // dois índices GIST (developments e geocode_cache). Quebrar só o de
  // `developments` deixava o outro satisfazendo a asserção, e a mutação M139
  // SOBREVIVEU. Contar é o que fecha o buraco.
  const comOpclass = SQL.match(/using gist \(geo extensions\.gist_geography_ops\)/g) ?? [];
  assert.equal(
    comOpclass.length, 2,
    "os DOIS índices GIST (developments.geo e geocode_cache.geo) precisam da opclass QUALIFICADA. " +
      "Com postgis em `extensions`, `using gist (geo)` só resolve se `extensions` estiver no " +
      "search_path de quem aplica — para os outros a migration ABORTA no meio.",
  );
  const gistSemOpclass = SQL.match(/using gist \(geo\)/g) ?? [];
  assert.deepEqual(
    gistSemOpclass, [],
    "nenhum índice GIST pode depender do search_path para achar gist_geography_ops",
  );
});

test("PARTE B · a lead NÃO ganha coordenada — proibição do item 5.4", () => {
  assert.ok(
    !/alter table public\.leads/.test(SQL),
    "esta migration não pode tocar em `leads`: o dono proibiu expor localização residencial exata. " +
      "A concentração de demanda sai de ONDE O CLIENTE QUER, não de onde ele mora.",
  );
  // A concentração usa interesse e preferência declarada — nunca endereço da lead.
  const concentracao = corpoDaFuncao("concentracao_de_demanda_por_regiao");
  assert.match(concentracao, /l\.development_id/, "o sinal é o empreendimento de interesse");
  assert.match(concentracao, /preferred_neighborhoods/, "e o bairro preferido");
  for (const proibido of [/l\.address/, /l\.latitude/, /l\.longitude/, /l\.geo\b/, /l\.postal_code/]) {
    assert.ok(!proibido.test(concentracao), `a concentração não pode ler ${proibido} da lead`);
  }
});

test("PARTE B · a concentração não pode voltar a descartar bairro nulo", () => {
  // A identidade `soma == cobertura` é provada na PARTE A, no banco. Mas mutação
  // mexe em ARQUIVO, e editar o `.sql` não muda o banco já aplicado — então sem
  // esta asserção o recorte que fazia 7 leads desaparecerem voltaria em silêncio.
  const corpo = corpoDaFuncao("concentracao_de_demanda_por_regiao");
  assert.ok(
    !/d\.neighborhood is not null/.test(corpo),
    "`d.neighborhood is not null` foi o recorte que descartava as 7 leads do Spin Mood sem avisar. " +
      "Bairro ausente vira faixa própria, não desaparece.",
  );
  assert.match(
    corpo, /coalesce\(private\.normalizar_endereco\(d\.neighborhood\), '\(sem bairro\)'\)/,
    "a chave precisa da sentinela: agrupar por NULL some da lista",
  );
  assert.match(
    corpo, /coalesce\(min\(d\.neighborhood\), '\(bairro não informado\)'\)/,
    "e a faixa precisa de nome visível para quem lê o mapa",
  );

  // A cobertura tem de publicar o tamanho da diferença.
  const cobertura = corpoDaFuncao("concentracao_de_demanda_cobertura");
  assert.match(
    cobertura, /com_empreendimento_sem_bairro bigint/,
    "sem esta coluna, a faixa '(bairro não informado)' aparece e ninguém sabe quantas leads são nem por quê",
  );
});

test("PARTE B · a migration não inventa coordenada nem apaga nada", () => {
  for (const destrutivo of [/\bdrop\s+table\b/, /\bdelete\s+from\b/, /\btruncate\b/, /\bdrop\s+column\b/]) {
    assert.ok(!destrutivo.test(SQL), `a migration não pode conter ${destrutivo}`);
  }
  // Nenhum UPDATE preenchendo coordenada: 0 de 4 é a resposta honesta.
  assert.ok(
    !/update public\.developments set/.test(SQL),
    "a migration não pode escrever coordenada em empreendimento nenhum — nenhuma foi confirmada",
  );
  // Idempotência: aplicar duas vezes não pode estourar.
  assert.match(SQL, /add column if not exists geo extensions\.geography/);
  assert.match(SQL, /create table if not exists public\.geocode_cache/);
  assert.match(SQL, /create extension if not exists postgis/);
});

test("PARTE B · o cache é fechado, e a procedência é obrigatória", () => {
  assert.match(SQL, /alter table public\.geocode_cache enable row level security/);
  for (const papel of ["anon", "authenticated", "public"]) {
    assert.ok(
      SQL.includes(`revoke all on table public.geocode_cache from ${papel}`),
      `o cache tem de revogar explicitamente ${papel}`,
    );
  }
  assert.match(SQL, /grant select, insert, update, delete on table public\.geocode_cache to service_role/);

  // `fonte` declarada, e provedor obrigatório quando vem de API paga.
  assert.match(SQL, /check \(fonte in \('manual', 'importado', 'api'\)\)/);
  assert.match(
    SQL, /fonte = 'api' and provedor is not null/,
    "coordenada de API sem provedor não tem contrato a que atribuir o custo",
  );
  // A chave do cache é o endereço NORMALIZADO.
  assert.match(SQL, /endereco_normalizado text primary key/);
  assert.match(SQL, /private\.normalizar_endereco/);
  assert.match(
    SQL, /create or replace function private\.normalizar_endereco\(p_endereco text\) returns text language sql immutable/,
    "a normalização tem de ser IMMUTABLE para servir de chave e de índice",
  );
  assert.ok(
    !/\bunaccent\(/.test(SQL),
    "unaccent é STABLE, não IMMUTABLE: usá-la envenena coluna gerada e índice. O dobramento é por translate().",
  );
});

test("PARTE B · a precedência da fonte está escrita, não implícita", () => {
  const corpo = corpoDaFuncao("geocode_cache_gravar");
  assert.match(corpo, /when 'manual' then 3/, "manual é a fonte mais forte");
  assert.match(corpo, /when 'importado' then 2/);
  assert.match(
    corpo, /v_peso_novo <= v_peso_atual and p_fonte <> 'manual'/,
    "a regra é: fonte de precedência menor OU IGUAL não sobrescreve, e manual é sempre exceção. " +
      "Sem o '<=', reprocessar API bate na mesma linha para sempre e o cache perde a função.",
  );
  // O OUT param não pode voltar a se chamar como a coluna.
  assert.ok(
    !/returns table \( endereco_normalizado text, gravou boolean/.test(corpo),
    "OUT param chamado `endereco_normalizado` colide com a coluna dentro do `on conflict` " +
      "e a função aborta com 42702 na primeira CHAMADA (cria sem erro). Tem de ser `endereco_chave`.",
  );
  assert.match(corpo, /endereco_chave text/);
});

test("PARTE B · o rollback existe, e fora de migrations/", () => {
  assert.ok(fs.existsSync(ARQUIVO_ROLLBACK), "toda migration desta frente precisa de rollback declarado");
  const rollback = fs.readFileSync(ARQUIVO_ROLLBACK, "utf8");

  // `.down.sql` dentro de migrations/ cria versão duplicada e o `db push` aborta
  // no ÚLTIMO arquivo, depois de já ter aplicado os anteriores.
  const dentroDeMigrations = fs
    .readdirSync(path.join(RAIZ, "supabase", "migrations"))
    .filter((f) => f.endsWith(".down.sql"));
  assert.deepEqual(dentroDeMigrations, [], "rollback dentro de migrations/ faz o db push abortar no meio");

  const corpo = achatado(rollback);
  assert.match(corpo, /drop table if exists public\.geocode_cache/, "o rollback tem de derrubar o cache");
  assert.match(corpo, /drop column if exists geo\b/, "e a coluna gerada");
  for (const fn of ["empreendimentos_no_raio", "imoveis_no_raio", "distancia_aproximada_m",
                    "concentracao_de_demanda_por_regiao", "concentracao_de_demanda_cobertura",
                    "empreendimentos_por_regiao", "geocode_cache_gravar", "geocodificar_do_cache"]) {
    assert.ok(corpo.includes(`drop function if exists public.${fn}`), `o rollback esqueceu ${fn}`);
  }

  // O rollback NÃO pode derrubar latitude/longitude: elas já existiam.
  assert.ok(
    !/drop column if exists latitude/.test(corpo) && !/drop column if exists longitude/.test(corpo),
    "latitude/longitude existiam ANTES desta migration: derrubá-las é apagar coluna que não é desta frente",
  );
  // E não pode derrubar a extensão sem decisão consciente.
  assert.ok(
    !/^\s*drop extension/m.test(semComentarios(rollback)),
    "`drop extension postgis` derruba EM CASCATA o que outras frentes criaram: fica comentado, como decisão de quem lê",
  );
});
