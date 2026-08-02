/**
 * Contrato da IMPORTAÇÃO DA BIBLIOTECA DE MÍDIA.
 *
 * Medido na produção em 02/08/2026: `act_2169318190556460/adimages` devolvia 25
 * imagens ACTIVE, `advideos` devolvia 0, e `creative_assets` tinha 0 linhas. A
 * peça existia na Meta e o CRM não tinha como citá-la — publicar exigia copiar
 * um hash de 32 caracteres à mão do Gerenciador de Anúncios.
 *
 * Cada asserção aqui corresponde a uma forma de esta importação mentir:
 *
 *   1. escrever na conta do dono quando deveria só olhar;
 *   2. transformar falha de leitura em "a biblioteca está vazia";
 *   3. duplicar a biblioteca a cada clique;
 *   4. perder a referência — que é a única coisa que o criativo cita;
 *   5. oferecer numa conta o hash que só vale na outra;
 *   6. jogar fora, em silêncio, a peça que a Meta reportou de um jeito estranho;
 *   7. inflar `asset_url` para fazer a prontidão ficar verde sozinha.
 *
 * 100% determinístico: sem rede, sem banco, sem relógio (o instante entra por
 * parâmetro). O `fetch` é INJETADO, e é por isso que a cláusula 1 pode ser
 * provada por execução em vez de por leitura do fonte.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CAMPOS_DE_IMAGEM,
  errosDaLeitura,
  lerBibliotecaDaConta,
  normalizarImagem,
  normalizarVideo,
  pecaCitavel,
  pecasDaBiblioteca,
  situacaoDoVideo,
  totalDePecas,
} from "../../lib/meta/marketing/biblioteca-de-midia.ts";

import {
  chaveDaPeca,
  chaveDoAtivo,
  linhaDoAtivo,
  ORIGEM_BIBLIOTECA,
  pecaOferecida,
  planejarImportacao,
  resumirImportacao,
} from "../../lib/marketing/importar-biblioteca-de-midia.ts";

const CONTA = "act_2169318190556460";
const CTX = {
  organizationId: "87036a39-bb25-4290-88ae-e588d6581994",
  contaId: CONTA,
  createdBy: "11111111-1111-1111-1111-111111111111",
  agoraIso: "2026-08-02T12:00:00.000Z",
};

/** Uma peça como `normalizarImagem` a devolve — o formato real, não um resumo. */
const imagem = (referencia, extra = {}) => ({
  tipo: "imagem",
  referencia,
  nome: `arte ${referencia}`,
  situacao: "ACTIVE",
  endereco: `https://www.facebook.com/ads/image/?d=${referencia}`,
  miniaturaTemporaria: "https://scontent.example/expira.jpg",
  largura: 2048,
  altura: 2048,
  criadaEm: "2026-07-01T10:00:00+0000",
  ...extra,
});

/** Uma resposta da Graph com N linhas e sem cursor — uma página só. */
const pagina = (linhas) => ({
  ok: true,
  json: async () => ({ data: linhas }),
});
const erroDaGraph = (code, message) => ({
  ok: true,
  json: async () => ({ error: { code, message } }),
});

/* ── 1 · SÓ LEITURA ────────────────────────────────────────────────────────
   A regra dura desta entrega. Não é uma promessa do docstring: as chamadas são
   capturadas e conferidas uma a uma. */

test("a leitura da biblioteca só faz GET, e o token nunca vai na URL", async () => {
  const chamadas = [];
  const fetcher = async (url, init) => {
    chamadas.push({ url: String(url), init });
    return pagina([]);
  };

  await lerBibliotecaDaConta(CONTA, "TOKEN-SECRETO", { fetcher });

  assert.equal(chamadas.length, 2, "uma chamada para /adimages e uma para /advideos");
  for (const { url, init } of chamadas) {
    // `undefined` é GET no fetch. Qualquer outro verbo seria escrita na conta.
    assert.ok(init?.method === undefined || String(init.method).toUpperCase() === "GET", `verbo inesperado em ${url}`);
    assert.equal(init?.body, undefined, "corpo em requisição de leitura é escrita disfarçada");
    assert.ok(!url.includes("TOKEN-SECRETO"), "token em query string vaza em log de proxy e de servidor");
    assert.ok(url.includes("/act_2169318190556460/"), "a leitura tem de ser da conta pedida");
  }
  assert.ok(chamadas.some((c) => c.url.includes("/adimages")));
  assert.ok(chamadas.some((c) => c.url.includes("/advideos")));
  assert.ok(chamadas[0].init.headers.Authorization.includes("TOKEN-SECRETO"), "o token vai no header");
  assert.ok(CAMPOS_DE_IMAGEM.includes("hash"), "sem hash a peça não pode ser citada por ninguém");
});

/* ── 2 · FALHA DE LEITURA NÃO É ZERO ───────────────────────────────────────
   O caso medido: `adimages` responde e `advideos` falha. Somar o que respondeu
   produziria um total menor que a verdade, com toda a aparência de contagem. */

test("um lado que falha derruba o TOTAL, e não zera o lado que respondeu", async () => {
  const fetcher = async (url) =>
    String(url).includes("/advideos")
      ? erroDaGraph(4, "(#4) Application request limit reached")
      : pagina([{ hash: "aaa", name: "arte", permalink_url: "https://www.facebook.com/ads/image/?d=1", status: "ACTIVE" }]);

  const biblioteca = await lerBibliotecaDaConta(CONTA, "T", { fetcher, retries: 0 });

  assert.equal(biblioteca.imagens.pecas.length, 1, "a metade que respondeu continua lida");
  assert.equal(biblioteca.videos.pecas, null, "a metade que falhou é null, nunca []");
  assert.equal(totalDePecas(biblioteca), null, "não sei o total, e não saber não é zero");
  assert.equal(pecasDaBiblioteca(biblioteca), null);
  assert.equal(errosDaLeitura(biblioteca).length, 1);
  assert.match(errosDaLeitura(biblioteca)[0], /vídeos/);
});

test("resumo com leitura incompleta nunca declara a biblioteca inteira no CRM", () => {
  const plano = planejarImportacao([], [], CTX);
  const cego = resumirImportacao(plano, { naBiblioteca: null, erros: ["a Graph não respondeu aos vídeos"] });
  assert.equal(cego.bibliotecaInteiraNoCrm, false);
  assert.match(cego.frase, /Isto não é zero/);

  const lido = resumirImportacao(plano, { naBiblioteca: 25, erros: [] });
  assert.equal(lido.bibliotecaInteiraNoCrm, true, "leitura completa e nada a fazer é a única forma de dizer que está tudo aqui");
});

/* ── 3 · IDEMPOTÊNCIA ──────────────────────────────────────────────────────
   O botão vai ficar numa tela. Ele será clicado duas vezes. */

test("importar duas vezes não cria a mesma peça duas vezes", () => {
  const pecas = [imagem("aaa"), imagem("bbb")];

  const primeira = planejarImportacao(pecas, [], CTX);
  assert.equal(primeira.linhas.length, 2);

  // As chaves saem das linhas GRAVADAS, e não de uma segunda montagem: é este
  // vaivém que prova que gravar e reconhecer usam a MESMA identidade.
  const jaNoCrm = primeira.linhas.map((linha) => chaveDoAtivo(linha));
  const segunda = planejarImportacao(pecas, jaNoCrm, CTX);
  assert.equal(segunda.linhas.length, 0, "nada novo na segunda passada");
  assert.deepEqual(segunda.jaRegistradas, ["aaa", "bbb"]);
});

test("a mesma referência repetida na MESMA leitura vira uma linha só", () => {
  const plano = planejarImportacao([imagem("aaa"), imagem("aaa")], [], CTX);
  assert.equal(plano.linhas.length, 1, "o insert vai em lote — duplicata aqui nasce duplicada no banco");
});

/* ── 4 · A REFERÊNCIA É O QUE IMPORTA ─────────────────────────────────────── */

test("o hash da imagem e o id do vídeo sobrevivem inteiros até a linha gravada", () => {
  const hash = "142c3611b1f35c3c1b3450a2ec7e64c6";
  const linha = linhaDoAtivo(imagem(hash), CTX);
  assert.equal(linha.metadata.meta.referencia, hash, "hash truncado é criativo recusado na hora de publicar");
  assert.equal(linha.metadata.origem, ORIGEM_BIBLIOTECA);
  assert.equal(linha.format, "single_image");
  assert.equal(linha.channel, "meta");

  const video = linhaDoAtivo({ ...imagem("120222"), tipo: "video", situacao: "ready" }, CTX);
  assert.equal(video.format, "single_video");
  assert.equal(video.metadata.meta.referencia, "120222");
});

test("a linha nasce com campaign_id NULO — a FK aponta para outra tabela", () => {
  const linha = linhaDoAtivo(imagem("aaa"), CTX);
  assert.equal(linha.campaign_id, null,
    "creative_assets.campaign_id referencia campaigns(id), não marketing_campaigns(id): qualquer id aqui devolve 23503 e derruba o lote inteiro");
  assert.equal(linha.status, "draft");
  assert.equal(linha.organization_id, CTX.organizationId);
  assert.equal(linha.created_by, CTX.createdBy);
});

test("a peça gravada volta oferecível — e o que não veio da biblioteca não vira peça", () => {
  const linha = { id: "uuid-1", ...linhaDoAtivo(imagem("aaa"), CTX) };
  const oferecida = pecaOferecida(linha);
  assert.equal(oferecida.referencia, "aaa");
  assert.equal(oferecida.contaId, CONTA);
  assert.equal(oferecida.dimensoes, "2048×2048");

  // Peça de texto do Creative Studio: mesma tabela, nada para citar.
  assert.equal(pecaOferecida({ id: "uuid-2", name: "copy", metadata: { conceito: "x" } }), null);
  assert.equal(chaveDoAtivo({ metadata: null }), null);
});

/* ── 5 · A CONTA FAZ PARTE DA IDENTIDADE ───────────────────────────────────
   O hash vem dos BYTES: a mesma arte em duas contas tem o mesmo hash. Mas um
   image_hash só vale dentro da conta que o hospeda. */

test("a mesma arte em duas contas são duas peças, e o prefixo act_ não cria uma terceira", () => {
  const outraConta = { ...CTX, contaId: "act_999" };
  const jaNoCrm = [chaveDaPeca(CONTA, "aaa")];

  const plano = planejarImportacao([imagem("aaa")], jaNoCrm, outraConta);
  assert.equal(plano.linhas.length, 1, "importada na conta A, a peça ainda falta na conta B");

  assert.equal(chaveDaPeca("2169318190556460", "aaa"), chaveDaPeca("act_2169318190556460", "aaa"),
    "com e sem prefixo é a MESMA conta — do contrário a primeira digitação sem `act_` duplica a biblioteca inteira");
});

/* ── 6 · PEÇA INUTILIZÁVEL NÃO ENTRA, E NÃO SOME ───────────────────────────
   Descartar em silêncio é a classe "cobra e destrói": o usuário procura na
   lista a peça que existe na Meta e não acha explicação nenhuma. */

test("imagem apagada e vídeo em processamento ficam de fora COM motivo", () => {
  const plano = planejarImportacao(
    [
      imagem("viva"),
      imagem("morta", { situacao: "DELETED" }),
      { ...imagem("codificando"), tipo: "video", situacao: "processing" },
    ],
    [],
    CTX,
  );

  assert.deepEqual(plano.linhas.map((l) => l.metadata.meta.referencia), ["viva"]);
  assert.equal(plano.descartadas.length, 2);
  for (const descartada of plano.descartadas) {
    assert.ok(descartada.motivo.length > 20, "descarte sem motivo legível é descarte mudo");
  }
  assert.match(plano.descartadas.find((d) => d.referencia === "codificando").motivo, /processad/i);
});

test("situação que a Meta não informou NÃO é motivo de descarte", () => {
  assert.equal(pecaCitavel(imagem("x", { situacao: null })).citavel, true,
    "não ter lido o estado da peça não é o mesmo que ter lido um estado ruim");
  assert.equal(pecaCitavel({ ...imagem("x"), tipo: "video", situacao: "ready" }).citavel, true);
  assert.equal(pecaCitavel(imagem("x", { situacao: "DELETED" })).citavel, false);
});

test("o status do vídeo é objeto na Graph, e ler como string faria o inacabado passar por pronto", () => {
  assert.equal(situacaoDoVideo({ video_status: "processing" }), "processing");
  assert.equal(situacaoDoVideo("ready"), "ready");
  assert.equal(situacaoDoVideo({}), null);
  assert.equal(situacaoDoVideo(undefined), null);

  const video = normalizarVideo({ id: "120", title: "reels", status: { video_status: "processing" } });
  assert.equal(video.situacao, "processing");
  assert.equal(pecaCitavel(video).citavel, false);
});

test("linha da Graph sem hash (ou sem id) não vira peça", () => {
  assert.equal(normalizarImagem({ name: "sem hash" }), null);
  assert.equal(normalizarVideo({ title: "sem id" }), null);
  assert.equal(normalizarImagem({ hash: "aaa" }).nome, "imagem aaa", "peça sem nome ainda precisa ser reconhecível na lista");
});

/* ── 7 · A PRONTIDÃO NÃO PODE SER SATISFEITA POR CONSTRUÇÃO ────────────────
   `midia_referenciavel_pelo_crm` conta linhas com `asset_url`. Forçar qualquer
   texto naquele campo faria o medidor medir a si mesmo. */

test("asset_url só aceita https de verdade — e a peça sem endereço entra assim mesmo, contada à parte", () => {
  const plano = planejarImportacao(
    [
      imagem("comEndereco"),
      imagem("semEndereco", { endereco: null }),
      imagem("enderecoTorto", { endereco: "javascript:alert(1)" }),
    ],
    [],
    CTX,
  );

  const porRef = Object.fromEntries(plano.linhas.map((l) => [l.metadata.meta.referencia, l]));
  assert.match(porRef.comEndereco.asset_url, /^https:\/\//);
  assert.equal(porRef.semEndereco.asset_url, null);
  assert.equal(porRef.enderecoTorto.asset_url, null, "endereço que não é https não vira link nem contagem");

  assert.equal(plano.linhas.length, 3, "sem endereço a peça continua citável: o que o criativo usa é o hash");
  assert.deepEqual(plano.semEndereco.sort(), ["enderecoTorto", "semEndereco"],
    "quem não tem endereço é dito em voz alta — a prontidão vai contar menos do que a importação trouxe");

  const resumo = resumirImportacao(plano, { naBiblioteca: 3, erros: [] });
  assert.equal(resumo.semEndereco, 2);
  assert.match(resumo.frase, /prontidão não as conta/);
});

test("a miniatura do CDN é guardada como temporária, nunca como endereço da peça", () => {
  const linha = linhaDoAtivo(imagem("aaa"), CTX);
  assert.match(linha.asset_url, /facebook\.com\/ads\/image/, "o permalink é o que sobrevive ao prazo do CDN");
  assert.match(linha.metadata.meta.miniaturaTemporaria, /scontent/);
  assert.notEqual(linha.asset_url, linha.metadata.meta.miniaturaTemporaria);
});
