/**
 * Contrato do FUNIL REAL DE CADA CRIATIVO.
 *
 * A pergunta que nenhuma ferramenta externa responde: **qual peça traz lead que
 * a operação fecha.** A Meta sabe CTR e custo por clique; ela não sabe se a lead
 * foi atendida, visitou ou comprou — isso está no CRM.
 *
 * E CTR alto com lead que não fecha é criativo ruim vestido de bom.
 *
 * Rodar: node --test tests/contracts/funil-do-criativo.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const fonte = fs.readFileSync(path.join(raiz, "lib", "marketing", "creative-funnel.ts"), "utf8");
const rota = fs.readFileSync(
  path.join(raiz, "app", "api", "v1", "marketing", "creative-funnel", "route.ts"), "utf8",
);
const { medirFunilDosCriativos, AMOSTRA_MINIMA } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`
);

const peca = (extra = {}) => ({
  versionId: "v1", nome: "Heitor", adId: "120251113236390624",
  empreendimento: "Spin Mood", formato: "short_video", angulo: "lifestyle",
  revisao: "approved", ...extra,
});

/** Gera n leads com o desfecho pedido. */
const leads = (n, { contatada = false, qualificada = false, visitou = false, proposta = false, comprou = false } = {}) =>
  Array.from({ length: n }, () => ({
    contatada, qualificada, visitou, recebeuProposta: proposta, comprou,
  }));

// ── A regra da amostra ──────────────────────────────────────────────────────

test("abaixo da amostra mínima a peça sai SEM classificação", () => {
  // Três leads e uma venda dão 33% de conversão — ruído com cara de descoberta.
  const r = medirFunilDosCriativos({
    criativos: [peca()],
    leadsPorAnuncio: new Map([["120251113236390624", leads(3, { contatada: true, comprou: true })]]),
    leadsSemCriativo: 0,
  });
  assert.equal(r.linhas[0].classificacao, null);
  assert.match(r.linhas[0].semClassificacao, /3 de 30 leads/);
  assert.equal(r.linhas[0].vendas, 3, "os números crus continuam aparecendo");
});

test("o piso está declarado e é o mesmo da governança do produto", () => {
  assert.equal(AMOSTRA_MINIMA, 30);
});

// ── Zero não é medição ──────────────────────────────────────────────────────

test("peça sem lead tem taxa null, não 0%", () => {
  const r = medirFunilDosCriativos({
    criativos: [peca()],
    leadsPorAnuncio: new Map(),
    leadsSemCriativo: 0,
  });
  const l = r.linhas[0];
  assert.equal(l.leads, 0);
  assert.equal(l.taxaDeAtendimento, null, "0 leads é ausência de medição, não 0% de conversão");
  assert.equal(l.taxaDeVenda, null);
  assert.equal(l.classificacao, null);
});

// ── A ordem de julgar ───────────────────────────────────────────────────────

test("peça cujas leads ninguém atendeu NÃO é classificada como ruim", () => {
  // O caso real da base: a peça "Heitor" trouxe 21 leads e nenhuma foi
  // contatada. Culpar o criativo por isso trocaria a peça certa pelo motivo
  // errado — o gargalo é a operação parada.
  const r = medirFunilDosCriativos({
    criativos: [peca()],
    leadsPorAnuncio: new Map([["120251113236390624", leads(40, { contatada: false })]]),
    leadsSemCriativo: 0,
  });
  assert.equal(r.linhas[0].classificacao, null);
  assert.match(r.linhas[0].semClassificacao, /nenhuma lead desta peça foi atendida/);
  assert.ok(r.naoMedido.some((m) => /mede a operação parada/.test(m)));
});

test("o resumo aponta o gargalo certo quando nada foi atendido", () => {
  const r = medirFunilDosCriativos({
    criativos: [peca()],
    leadsPorAnuncio: new Map([["120251113236390624", leads(21)]]),
    leadsSemCriativo: 0,
  });
  assert.match(r.resumo, /o gargalo não é o criativo/);
});

// ── A comparação é contra a mediana, não contra meta inventada ──────────────

test("classifica comparando com a mediana das peças que têm amostra", () => {
  const boa = peca({ versionId: "boa", nome: "Boa", adId: "111" });
  const ruim = peca({ versionId: "ruim", nome: "Ruim", adId: "222" });
  const r = medirFunilDosCriativos({
    criativos: [boa, ruim],
    leadsPorAnuncio: new Map([
      // 40 leads, 10 vendas = 25%
      ["111", [...leads(10, { contatada: true, comprou: true }), ...leads(30, { contatada: true })]],
      // 40 leads, 2 vendas = 5%
      ["222", [...leads(2, { contatada: true, comprou: true }), ...leads(38, { contatada: true })]],
    ]),
    leadsSemCriativo: 0,
  });
  const porNome = Object.fromEntries(r.linhas.map((l) => [l.nome, l]));
  assert.equal(porNome.Boa.classificacao, "ganhando");
  assert.equal(porNome.Ruim.classificacao, "perdendo");
  assert.equal(r.total.comAmostra, 2);
});

test("uma peça sozinha com amostra fica 'aprendendo' — não há com quem comparar", () => {
  const r = medirFunilDosCriativos({
    criativos: [peca()],
    leadsPorAnuncio: new Map([["120251113236390624", leads(40, { contatada: true })]]),
    leadsSemCriativo: 0,
  });
  assert.equal(r.linhas[0].classificacao, "aprendendo",
    "com uma peça só, ela É a mediana — declarar vitória sobre si mesma seria vazio");
});

// ── O que não foi medido ────────────────────────────────────────────────────

test("criativo sem anúncio vinculado vira instrução, não mistério", () => {
  const r = medirFunilDosCriativos({
    criativos: [peca({ adId: null })],
    leadsPorAnuncio: new Map(),
    leadsSemCriativo: 0,
  });
  assert.ok(r.naoMedido.some((m) => /sem anúncio vinculado/.test(m) && /informe o anúncio/.test(m)));
});

test("leads sem anúncio são declaradas, não escondidas", () => {
  const r = medirFunilDosCriativos({
    criativos: [peca()],
    leadsPorAnuncio: new Map([["120251113236390624", leads(40, { contatada: true })]]),
    leadsSemCriativo: 196,
  });
  assert.equal(r.total.leadsSemCriativo, 196);
  assert.ok(r.naoMedido.some((m) => /196 lead\(s\) chegaram sem anúncio/.test(m)));
});

test("o módulo não afirma causa nem executa nada", () => {
  const r = medirFunilDosCriativos({ criativos: [], leadsPorAnuncio: new Map(), leadsSemCriativo: 0 });
  assert.equal(r.executaSozinho, false);
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.ok(!/fetch\(|supabase|pausar|desativar/i.test(codigo),
    "o motor é puro: medir é uma coisa, mexer em verba é outra");
});

// ── A rota ──────────────────────────────────────────────────────────────────

test("a fonte primária é a tabela canônica de atribuição", () => {
  // `lead_attribution_touches` cobre os 217 leads com 24 anúncios; o metadata
  // da lead cobre 21. A primeira versão desta rota lia SÓ o metadata — era uma
  // segunda forma de responder a mesma pergunta, com dado pior, enquanto
  // /api/v1/marketing/ad-performance já cruzava a tabela certa e estava sem
  // chamador.
  assert.match(rota, /\.from\("lead_attribution_touches"\)/);
  assert.match(rota, /const doToque = anuncioPorToque\.get\(leadId\);/,
    "o toque tem que ser consultado ANTES do metadata");
});

test("o metadata continua como recuo, com as duas convenções", () => {
  // O backfill grava `ad_id` (snake) e o outbox grava `adId` (camel), e nem
  // toda lead antiga tem toque registrado — descartar o metadata perderia
  // histórico.
  assert.match(rota, /const valor = m\.ad_id \?\? m\.adId;/);
});

test("a rota NÃO materializa o funil", () => {
  // As leads são a fonte da verdade; recalcular está sempre certo. Materializar
  // criaria uma cópia que envelhece — uma lead que avança amanhã deixaria o
  // número de ontem errado sem ninguém perceber.
  const codigo = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.ok(!/creative_performance_daily_facts/.test(codigo),
    "gravar o funil do CRM na tabela de fatos criaria segunda fonte de verdade");
});

test("um anúncio pertence a UM criativo — o conflito é recusado com explicação", () => {
  assert.match(rota, /ANUNCIO_JA_VINCULADO/);
  assert.match(rota, /Um anúncio mede uma peça só/);
  assert.match(rota, /error\.code === "23505"/, "o índice único do banco é quem garante");
});

test("dá para desvincular sem mexer no banco à mão", () => {
  assert.match(rota, /corpo\?\.adId === null \? null/);
});

test("o id do anúncio é validado antes de gravar", () => {
  assert.match(rota, /\/\^\[0-9\]\{5,32\}\$\/\.test\(adId\)/);
  assert.match(rota, /Copie-o do Gerenciador de Anúncios/,
    "recusar sem dizer onde achar o valor vira ticket de suporte");
});

test("a rota declara que não depende de ads_read", () => {
  assert.match(rota, /não depende de ads_read/);
  assert.match(rota, /alegacaoCausalPermitida: false/);
});
