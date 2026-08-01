/**
 * Contrato da PRÓXIMA AÇÃO.
 *
 * Medido na base: 208 de 217 leads sem próxima ação. Não era desleixo da
 * operação — não havia porta. `next_action_at` só era escrito ao agendar uma
 * VISITA ao imóvel, ou pelo PATCH do lead, que valida o registro inteiro.
 *
 * Quem só queria dizer "ligo pra ele terça" não tinha onde clicar. E o que não
 * tem onde clicar não acontece.
 *
 * Rodar: node --test tests/contracts/proxima-acao.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const fonte = fs.readFileSync(path.join(raiz, "lib", "crm", "next-action.ts"), "utf8");
const rota = fs.readFileSync(
  path.join(raiz, "app", "api", "v1", "leads", "[id]", "next-action", "route.ts"), "utf8",
);
const { calcularProximaAcao, descreverProximaAcao, PRAZOS, ACOES } = await import(
  `data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`
);

/**
 * As asserções são em hora de SÃO PAULO, não do servidor que roda o teste.
 *
 * A primeira versão usava `getHours()` e `getDate()` puros — e isso escondeu um
 * defeito real: no teste ponta a ponta o servidor rodava em UTC, marquei às 15h
 * de São Paulo e a próxima ação caiu às 6h da manhã de lá. A conta lia 18h
 * (UTC), achava que era fim de expediente e empurrava para "as 9h" do fuso
 * errado.
 *
 * Um teste que afirma no fuso da máquina passa no laptop e falha em produção.
 */
const FUSO = "America/Sao_Paulo";
const emSP = (data) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", weekday: "short", hour12: false,
    }).formatToParts(data).map((p) => [p.type, p.value]),
  );
const diaDaSemana = (data) =>
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(emSP(data).weekday);

/** Segunda-feira, 26/01/2026, 14h30 em São Paulo (UTC-3 → 17h30 UTC). */
const segundaTarde = () => new Date("2026-01-26T17:30:00Z");

test("preserva a hora do dia, no fuso da operação", () => {
  // Marcar às 14h30 e ser lembrado às 14h30 é o que a pessoa esperava.
  const q = emSP(calcularProximaAcao("amanha", segundaTarde()));
  assert.equal(q.hour, "14");
  assert.equal(q.minute, "30");
  assert.equal(q.day, "27", "amanhã é 27");
});

test("fora do expediente cai para a abertura em São Paulo", () => {
  // 21h40 em São Paulo = 00h40 UTC do dia seguinte. A conta tem que enxergar
  // 21h de lá, não 0h daqui.
  const noite = new Date("2026-01-27T00:40:00Z");
  const q = emSP(calcularProximaAcao("amanha", noite));
  assert.equal(q.hour, "09", `veio ${q.hour}h`);
  assert.equal(q.minute, "00");
});

test("madrugada também", () => {
  // 3h em São Paulo = 6h UTC.
  const madrugada = new Date("2026-01-26T06:00:00Z");
  assert.equal(emSP(calcularProximaAcao("amanha", madrugada)).hour, "09");
});

test("nunca cai em fim de semana", () => {
  // Sexta 30/01/2026, 10h em SP → "amanhã" seria sábado. Vira segunda.
  const sexta = new Date("2026-01-30T13:00:00Z");
  const q = calcularProximaAcao("amanha", sexta);
  assert.ok(![0, 6].includes(diaDaSemana(q)), `caiu num dia de fim de semana`);
  assert.equal(diaDaSemana(q), 1, "segunda-feira");
  assert.equal(emSP(q).day, "02", "2 de fevereiro");
});

test("os três prazos avançam o que prometem", () => {
  const base = segundaTarde();
  assert.equal(emSP(calcularProximaAcao("amanha", base)).day, "27");
  assert.equal(emSP(calcularProximaAcao("tres_dias", base)).day, "29");
  const semana = emSP(calcularProximaAcao("semana", base));
  assert.equal(semana.month, "02", "virou o mês");
  assert.equal(semana.day, "02");
});

test("o horário de expediente é o de São Paulo, não o do servidor", () => {
  // O caso que passou despercebido: 15h em SP é 18h UTC. Se a conta usasse o
  // fuso do servidor, leria 18h, acharia fim de expediente e jogaria para 6h da
  // manhã de São Paulo.
  const quinzeEmSP = new Date("2026-01-26T18:00:00Z");
  const q = emSP(calcularProximaAcao("tres_dias", quinzeEmSP));
  assert.equal(q.hour, "15", "15h é expediente em São Paulo e tem que ser preservada");
});

test("prazo desconhecido estoura em vez de inventar data", () => {
  assert.throws(() => calcularProximaAcao("mes_que_vem", segundaTarde()), /Prazo desconhecido/);
});

test("a descrição diz o que fazer, não só que há algo", () => {
  // Sem rótulo, a agenda mostraria "Follow-up com Fulano" e a pessoa chega na
  // hora sem lembrar o que ia fazer.
  assert.equal(descreverProximaAcao("ligar"), "Ligar");
  assert.equal(descreverProximaAcao("proposta", "unidade 71"), "Preparar proposta — unidade 71");
  assert.equal(descreverProximaAcao("whatsapp", "   "), "Mandar WhatsApp", "observação vazia não vira traço solto");
});

test("a observação é limitada — o campo não é diário", () => {
  const longa = descreverProximaAcao("ligar", "x".repeat(500));
  assert.ok(longa.length < 140, `veio com ${longa.length} caracteres`);
});

test("a lista de opções é curta de propósito", () => {
  // Menu longo obriga a escolher, e escolher é o custo que fez 208 leads
  // ficarem sem próxima ação.
  assert.ok(PRAZOS.length <= 4, `${PRAZOS.length} prazos é menu, não atalho`);
  assert.ok(ACOES.length <= 6, `${ACOES.length} ações é menu, não atalho`);
});

// ── A rota ──────────────────────────────────────────────────────────────────

test("a rota grava o QUANDO e o QUÊ, e nada mais", () => {
  assert.match(rota, /next_action_at: quando\.toISOString\(\)/);
  assert.match(rota, /next_action: descricao/);
  // Escopo estreito: não muda status do lead, não cria tarefa, não manda
  // mensagem. Uma rota que faz uma coisa é uma rota que o corretor usa sem medo
  // de efeito colateral.
  //
  // Os padrões miram nas ESCRITAS. A primeira versão deste teste usava
  // `/status:/` cru e reprovava por causa de `{ status: 404 }` — código HTTP,
  // não mudança de estado do lead. Asserção larga mede o vizinho.
  const escritas = [
    /from\("tasks"\)[\s\S]{0,80}\.insert/,
    /from\("outbox"\)/,
    /\.update\(\{[^}]*\bstatus:/,
  ];
  for (const efeito of escritas) {
    assert.ok(!efeito.test(rota), `a rota ganhou efeito colateral: ${efeito}`);
  }
  // E o único update que existe toca apenas os três campos previstos.
  const updates = [...rota.matchAll(/\.update\(\{([\s\S]*?)\}\)/g)].map((m) => m[1]);
  for (const corpo of updates) {
    const campos = [...corpo.matchAll(/^\s*([a-z_]+):/gm)].map((m) => m[1]);
    for (const campo of campos) {
      assert.ok(["next_action_at", "next_action", "updated_at"].includes(campo),
        `a rota escreve em "${campo}", que está fora do escopo dela`);
    }
  }
});

test("só o dono ou a liderança marcam", () => {
  assert.match(rota, /if \(!ehLideranca && !ehDono\)/);
  assert.match(rota, /assigned_user_id === access\.access\.profile\.id[\s\S]{0,80}assigned_to === access\.access\.profile\.id/,
    "as duas colunas de dono entram: a base tem histórico nas duas");
});

test("dá para limpar sem inventar data falsa", () => {
  assert.match(rota, /corpo\?\.limpar/);
  assert.match(rota, /next_action_at: null, next_action: null/);
});

test("prazo e ação inválidos são recusados com a lista do que vale", () => {
  assert.match(rota, /PRAZO_INVALIDO/);
  assert.match(rota, /ACAO_INVALIDA/);
  assert.match(rota, /PRAZOS\.map\(\(p\) => p\.chave\)\.join\(", "\)/,
    "a mensagem tem que dizer o que aceitar, não só que recusou");
});
