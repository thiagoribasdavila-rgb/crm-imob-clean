/**
 * Contrato das RESPOSTAS DE QUALIFICAÇÃO do formulário Meta.
 *
 * Medido nos 26 formulários da conta: 12 têm pergunta própria — "Você procura
 * um imóvel para:", "Qual faixa de investimento?", "Como pretende adquirir o
 * imóvel?". Intenção, verba e forma de pagamento: o que separa quem compra de
 * quem está olhando.
 *
 * A ingestão lia três campos (nome, e-mail, telefone) e descartava o resto. Por
 * isso o corretor abre a lead e não sabe nada sobre ela: a informação chegou e
 * foi jogada fora no mesmo instante.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const rota = fs.readFileSync(
  path.join(raiz, "app", "api", "v2", "outbox", "process", "route.ts"), "utf8",
);

test("as respostas de qualificação são preservadas na ingestão", () => {
  assert.match(rota, /function respostasDeQualificacao/);
  assert.match(rota, /respostas,/, "precisa entrar no metadata da lead");
});

test("nome, e-mail e telefone NÃO são duplicados no metadata", () => {
  // Eles já têm coluna própria. Guardar de novo criaria duas verdades sobre o
  // mesmo fato — o defeito que este projeto vem desfazendo.
  assert.match(rota, /const CAMPOS_PADRAO = new Set\(\[/);
  for (const campo of ["full_name", "email", "phone_number", "first_name", "last_name"]) {
    assert.match(rota, new RegExp(`"${campo}"`), `${campo} precisa estar na lista de padrão`);
  }
});

test("a CHAVE da pergunta é guardada, não só a resposta", () => {
  // "morar" sozinho não significa nada daqui a seis meses, quando o formulário
  // tiver mudado. A chave permite mapear para campo canônico sem depender do
  // texto, que o marketing reescreve.
  assert.match(rota, /chave: String\(f\.name\)/);
});

test("múltipla escolha preserva TODAS as marcadas", () => {
  assert.match(rota, /\(f\.values \?\? \[\]\)\.map\(\(v\) => String\(v\)\.trim\(\)\)\.filter\(Boolean\)\.join\(" \| "\)/);
});

test("resposta vazia não vira ruído", () => {
  assert.match(rota, /\.filter\(\(r\) => r\.resposta\.length > 0\)/);
});

test("'não perguntou' é distinguido de 'não respondeu'", () => {
  // Os 3 formulários ATIVOS hoje (Spin Mood v6, v7, Arvo v5) só pedem nome,
  // e-mail e telefone. Lead vazia por isso não é lead que se recusou a
  // responder — e quem lê precisa saber a diferença.
  assert.match(rota, /formularioPerguntouQualificacao: respostas\.length > 0/);
  assert.match(rota, /não perguntou.*não.*respondeu|"o formulário não perguntou", não "a pessoa não/s);
});

test("a função é chamada uma vez só", () => {
  // Chamar duas vezes na mesma linha é desperdício e abre espaço para as duas
  // chamadas divergirem.
  assert.equal([...rota.matchAll(/respostasDeQualificacao\(fields\)/g)].length, 1);
});
