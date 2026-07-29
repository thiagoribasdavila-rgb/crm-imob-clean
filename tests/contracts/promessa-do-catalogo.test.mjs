/**
 * Contrato: O CATÁLOGO PROMETE, A TELA CUMPRE.
 *
 * ── O DEFEITO QUE ISTO FIXA ──────────────────────────────────────────────────
 *
 * `lib/atlas/navigation.ts` declara uma ação primária por destino, cada uma com
 * o resultado comercial que deve produzir. Nove carregam parâmetro na URL.
 * Medido em 2026-07-29: as NOVE telas de destino ignoravam o parâmetro. A
 * pessoa clicava em "Nova tarefa" e chegava em /tasks com nada aberto; clicava
 * em "Abrir fila sem responsável" e via a fila inteira.
 *
 * Promessa decorativa é pior que promessa nenhuma: o botão ensina que aquele
 * caminho não funciona, e depois disso nem o que funciona é usado. E nada disso
 * aparecia em teste, porque a tela ABRIA — só não fazia o que o botão dizia.
 *
 * ── O QUE ESTE CONTRATO GUARDA ───────────────────────────────────────────────
 *
 * Ele não confere pixel: confere que TODA promessa com parâmetro tem, na tela
 * de destino, alguém que lê a intenção pelo módulo compartilhado. É a fiação —
 * a mesma que faltou em `firstContactOverdue`, que era calculado, tipado,
 * devolvido pela API e nunca desenhado.
 *
 * Se alguém acrescentar um destino novo com parâmetro e esquecer a tela, isto
 * acusa antes de a promessa chegar a um corretor.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  lerIntencaoDaUrl,
  pedeCriar,
  alvoDaIntencao,
} from "../../lib/atlas/intencao-da-url.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

// ── A REGRA, EXECUTADA ──────────────────────────────────────────────────────

test("cada chave conhecida vira a intenção certa", () => {
  assert.deepEqual(lerIntencaoDaUrl("?create=1"), { tipo: "criar" });
  assert.deepEqual(lerIntencaoDaUrl("?focus=priority"), { tipo: "focar", alvo: "priority" });
  assert.deepEqual(lerIntencaoDaUrl("?view=forecast"), { tipo: "visao", alvo: "forecast" });
  assert.deepEqual(lerIntencaoDaUrl("?queue=unassigned"), { tipo: "fila", alvo: "unassigned" });
});

test("chave inventada não vira comportamento", () => {
  // Parâmetro que a navegação não promete não pode mudar a tela: uma superfície
  // que reage a qualquer coisa é uma superfície que ninguém consegue auditar.
  assert.equal(lerIntencaoDaUrl("?xpto=1"), null);
  assert.equal(lerIntencaoDaUrl("?create=9"), null, "create só vale com 1");
  assert.equal(lerIntencaoDaUrl(""), null, "abrir pelo menu é o caso normal, não erro");
});

test("URL malformada não impede a tela de carregar", () => {
  assert.equal(lerIntencaoDaUrl("%%%"), null);
});

test("os auxiliares não confundem os tipos", () => {
  assert.equal(pedeCriar(lerIntencaoDaUrl("?create=1")), true);
  assert.equal(pedeCriar(lerIntencaoDaUrl("?view=forecast")), false);
  assert.equal(alvoDaIntencao(lerIntencaoDaUrl("?view=forecast"), "visao"), "forecast");
  assert.equal(alvoDaIntencao(lerIntencaoDaUrl("?view=forecast"), "fila"), null,
    "pedir o alvo do tipo errado devolve null, não o valor de outro tipo");
});

// ── A FIAÇÃO: toda promessa com parâmetro tem quem a cumpra ──────────────────

test("toda ação primária com parâmetro tem tela que lê a intenção", () => {
  const navegacao = ler("lib", "atlas", "navigation.ts");
  const promessas = [...navegacao.matchAll(/primaryAction: \{ label: "[^"]+", href: "(\/[a-z-]+)\?([^"]+)"/g)]
    .map((achado) => ({ rota: achado[1], parametro: achado[2] }));

  assert.ok(promessas.length >= 8,
    `esperava ao menos 8 promessas com parâmetro, achei ${promessas.length} — se o catálogo encolheu, confira se foi de propósito`);

  const semCumprir = [];
  for (const { rota, parametro } of promessas) {
    const arquivo = path.join(raiz, "app", "(crm)", rota.slice(1), "page.tsx");
    if (!fs.existsSync(arquivo)) continue; // destino sem página própria é outro problema, coberto pela fase 021
    const tela = fs.readFileSync(arquivo, "utf8");
    const leIntencao = tela.includes("intencao-da-url");
    if (!leIntencao) semCumprir.push(`${rota}?${parametro}`);
  }

  assert.deepEqual(semCumprir, [],
    `estas telas ignoram o parâmetro que o catálogo promete — o botão existe e não faz nada: ${semCumprir.join(", ")}`);
});

test("nenhuma chave de URL de /leads escapa da lista fechada", () => {
  /**
   * /leads foi a primeira tela a ler a URL, antes de o módulo compartilhado
   * existir, e por isso ainda tem leitura própria. O contrato não a obriga a
   * migrar — obriga a cumprir a MESMA regra.
   *
   * O motivo é um defeito real: `status` era a única chave sem porteiro. Ela ia
   * crua para a API, então /leads?status=xpto devolvia lista vazia — e lista
   * vazia se lê como "não há trabalho", que é a pior mensagem possível numa
   * operação com 443 leads paradas. A tela violava a regra que este mesmo
   * módulo impõe às outras nove.
   */
  const tela = ler("app", "(crm)", "leads", "page.tsx");
  const lidas = [...tela.matchAll(/url\.get\("([a-zA-Z]+)"\)/g)].map((achado) => achado[1]);
  const semPorteiro = lidas.filter((chave) => {
    const uso = new RegExp(`pegar\\(\\s*"${chave}"`);
    return !uso.test(tela);
  });
  assert.deepEqual(semPorteiro, [],
    `estas chaves vão cruas da URL para o estado, e valor inventado vira lista vazia: ${semPorteiro.join(", ")}`);
});

test("ninguém faz leitura própria de URL nas telas de destino", () => {
  // Nove cópias da mesma regra divergem. A lista de chaves é fechada e mora num
  // lugar só; uma tela lendo window.location por conta própria escapa disso.
  const rotas = ["pipeline", "tasks", "calendar", "brokers", "distribution", "sales", "users", "external-sales", "settings"];
  const fora = rotas.filter((rota) => {
    const arquivo = path.join(raiz, "app", "(crm)", rota, "page.tsx");
    if (!fs.existsSync(arquivo)) return false;
    const tela = fs.readFileSync(arquivo, "utf8");
    return tela.includes("window.location.search") && !tela.includes("intencao-da-url");
  });
  assert.deepEqual(fora, [], `leitura de URL fora do módulo compartilhado em: ${fora.join(", ")}`);
});
