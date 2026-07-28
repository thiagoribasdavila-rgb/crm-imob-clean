/**
 * Contrato: TODA porta de entrada de lead pontua, e pela MESMA régua.
 *
 * ── O DEFEITO QUE ISTO FIXA ──────────────────────────────────────────────────
 *
 * O CRM tem três portas por onde uma lead nasce:
 *   · criação por API      (app/api/v1/leads/route.ts)      — sempre pontuou;
 *   · importação           (app/api/v1/leads/import/route.ts) — não pontuava;
 *   · ingestão automática  (app/api/v2/outbox/process)       — gravava `score: 0`
 *     no literal, tanto para lead de anúncio quanto de portal.
 *
 * Medido em 2026-07-28: 193 de 200 leads com score 0, e 190 delas vindas de
 * anúncio. A fila do corretor ordena por score — a base inteira entrou
 * empatada, e cada lead nova de campanha nasceria empatada também.
 *
 * A régua é determinística e só soma o que a lead TEM. Não pontuar não é
 * "prudência": é trocar um número com lastro por um zero sem significado, e o
 * zero some no meio dos outros 192.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

const criacao = ler("app", "api", "v1", "leads", "route.ts");
const importacao = ler("app", "api", "v1", "leads", "import", "route.ts");
const ingestao = ler("app", "api", "v2", "outbox", "process", "route.ts");

test("as três portas chamam a MESMA função de score", () => {
  // Réguas paralelas divergem — é a classe de defeito que mais apareceu neste
  // repositório. Uma função só, importada nos três lugares.
  for (const [porta, codigo] of [["criação", criacao], ["importação", importacao], ["ingestão", ingestao]]) {
    assert.match(codigo, /import \{ calculateLeadScore \} from "@\/lib\/atlas\/scoring"/,
      `${porta} precisa importar a régua do produto`);
    assert.match(codigo, /calculateLeadScore\(/, `${porta} precisa CHAMAR a régua`);
  }
});

test("nenhuma porta grava score zero no literal", () => {
  // `score: 0` fixo é a forma silenciosa de não pontuar: o campo existe, tem
  // valor, e não significa nada.
  for (const [porta, codigo] of [["importação", importacao], ["ingestão", ingestao]]) {
    const limpo = semComentarios(codigo);
    assert.ok(!/\bscore: 0\b/.test(limpo), `${porta} voltou a gravar score zero fixo`);
    assert.ok(!/\bscore_ia: 0\b/.test(limpo), `${porta} voltou a gravar score_ia zero fixo`);
  }
});

test("a ingestão pontua lead de anúncio E de portal", () => {
  // São dois inserts diferentes no mesmo arquivo; corrigir um só deixa metade
  // das leads novas em zero — e a metade que fica é invisível até alguém
  // reparar que portal nunca aparece no topo da fila.
  const chamadas = [...semComentarios(ingestao).matchAll(/calculateLeadScore\(/g)];
  assert.ok(chamadas.length >= 2,
    `esperado score nos dois caminhos de ingestão (anúncio e portal), achei ${chamadas.length}`);
});

test("score e score_ia recebem o mesmo número", () => {
  // Eram duas colunas para a mesma coisa e discordavam: lead com score_ia 50
  // aparecia com score 0 na fila. Gravar as duas juntas é o que impede a
  // divergência voltar.
  assert.match(criacao, /score_ia: score\.score/);
  assert.match(criacao, /score: score\.score/);
  assert.match(importacao, /score: pontuacao\.score/);
  assert.match(importacao, /score_ia: pontuacao\.score/);
});

test("a régua do script de recálculo não divergiu da do produto", () => {
  // O script reproduz a régua (o módulo do produto arrasta `server-only` e não
  // carrega fora do Next). Reprodução é dívida: este teste é o juro.
  const motor = ler("lib", "atlas", "scoring.ts");
  const script = ler("scripts", "recalcula-score-das-importadas.mjs");
  const pontos = [
    ["email", 10], ["phone", 15], ["budgetMax", 20], ["preferredRegions", 10],
    ["bedrooms", 5], ["purpose", 10],
  ];
  for (const [campo, valor] of pontos) {
    assert.match(motor, new RegExp(`lead\\.${campo}[\\s\\S]{0,60}?score \\+= ${valor}`),
      `a régua do produto mudou o peso de ${campo} — atualize o script junto`);
    assert.match(script, new RegExp(`, ${valor}, `),
      `o script não tem mais nenhum critério valendo ${valor} pontos`);
  }
});

test("o recálculo nunca rebaixa quem já tem score", () => {
  // Sobrescrever um score ajustado à mão apaga trabalho humano sem avisar.
  const script = ler("scripts", "recalcula-score-das-importadas.mjs");
  assert.match(script, /\.or\("score\.is\.null,score\.eq\.0"\)/,
    "o filtro de zero precisa estar no WHERE do update, não só na leitura");
  assert.match(script, /--aplicar/, "o padrão é simular; gravar exige pedido explícito");
});
