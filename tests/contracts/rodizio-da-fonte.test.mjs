/**
 * CONTRATO: o rodízio não guarda de quem era a vez, e o portão do WhatsApp
 * ganha dono sem afrouxar por omissão.
 *
 * ── O que foi medido em 03/08/2026 ────────────────────────────────────────
 *
 *     whatsapp_broker_sessions ............ 0 linhas em TODA a base
 *     meta_lead_sources com dono padrão ... 7
 *     leads sem dono ...................... 55
 *     /api/v1/whatsapp/broker/status ...... 404 em produção
 *
 * `hierarchical-cascade.ts` exigia sessão de WhatsApp conectada em TODOS os
 * degraus, inclusive no dono padrão da fonte. Sete fontes apontavam para um
 * corretor, a ingestão honrava o campo, e toda lead nascia órfã porque o portão
 * barrava antes. A precondição não era nem alcançável: a ponte aponta para
 * `127.0.0.1:8790` e a rota nem existe em produção.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { escolherDoRodizio, exigeWhatsapp } from "../../lib/distribution/rodizio-da-fonte.ts";

const diego = (leads, extra = {}) => ({ profileId: "diego", posicao: 1, leadsRecebidas: leads, ...extra });
const luciano = (leads, extra = {}) => ({ profileId: "luciano", posicao: 2, leadsRecebidas: leads, ...extra });

/* ── A ALTERNÂNCIA SAI DO HISTÓRICO, NÃO DE UM PONTEIRO ──────────────────── */

test("com os dois zerados, vence a posição declarada", () => {
  const e = escolherDoRodizio([diego(0), luciano(0)]);
  assert.equal(e.profileId, "diego");
  assert.match(e.porque, /empate em 0/);
  assert.match(e.porque, /posição 1/);
});

test("depois de uma para o Diego, a próxima é do Luciano", () => {
  assert.equal(escolherDoRodizio([diego(1), luciano(0)]).profileId, "luciano");
});

test("a ordem das linhas NÃO decide — só a posição e a contagem", () => {
  // Sem o desempate declarado, dois zerados teriam a escolha definida pela
  // ordem que o banco devolveu, e "quem deveria ter recebido" deixaria de ser
  // reproduzível.
  const a = escolherDoRodizio([diego(0), luciano(0)]);
  const b = escolherDoRodizio([luciano(0), diego(0)]);
  assert.equal(a.profileId, b.profileId);
});

test("quem ficou para trás recebe até emparelhar — o rodízio se autocorrige", () => {
  // Luciano ficou inativo e voltou com 0 contra 8. Ele recebe as próximas até
  // alcançar, sem ninguém precisar consertar um ponteiro.
  assert.equal(escolherDoRodizio([diego(8), luciano(0)]).profileId, "luciano");
  assert.equal(escolherDoRodizio([diego(8), luciano(7)]).profileId, "luciano");
  assert.equal(escolherDoRodizio([diego(8), luciano(8)]).profileId, "diego", "empatou: volta a posição");
});

/* ── INDISPONÍVEL NÃO RECEBE, E A LEAD NÃO É EMPURRADA ───────────────────── */

test("indisponível é pulado, e o disponível recebe mesmo com mais leads", () => {
  const e = escolherDoRodizio([
    diego(0, { indisponivel: true, motivoDaIndisponibilidade: "perfil inativo" }),
    luciano(9),
  ]);
  assert.equal(e.profileId, "luciano");
  assert.deepEqual(e.consideradosEmOrdem, ["luciano"], "quem está fora não entra na disputa");
});

test("todos indisponíveis devolve NULO com o motivo — nunca empurra a lead", () => {
  // Mandar para quem não pode atender é perder a lead com aparência de
  // resolvida: ela sai da fila de órfãs e não é trabalhada.
  const e = escolherDoRodizio([
    diego(0, { indisponivel: true, motivoDaIndisponibilidade: "sem WhatsApp conectado" }),
    luciano(0, { indisponivel: true, motivoDaIndisponibilidade: "capacidade cheia" }),
  ]);
  assert.equal(e.profileId, null);
  assert.match(e.porque, /indisponíveis/);
  assert.match(e.porque, /sem WhatsApp conectado/);
  assert.match(e.porque, /capacidade cheia/, "os DOIS motivos aparecem — um só esconderia metade");
});

test("rodízio vazio devolve nulo sem inventar candidato", () => {
  const e = escolherDoRodizio([]);
  assert.equal(e.profileId, null);
  assert.match(e.porque, /Nenhum corretor no rodízio/);
});

/* ── A DECISÃO PRECISA SER AUDITÁVEL ─────────────────────────────────────── */

test("a escolha explica o porquê e lista quem disputou", () => {
  const e = escolherDoRodizio([diego(3), luciano(1)]);
  assert.equal(e.profileId, "luciano");
  assert.match(e.porque, /1 lead\(s\) desta fonte/);
  assert.deepEqual(e.consideradosEmOrdem, ["luciano", "diego"]);
});

/* ── O PORTÃO DO WHATSAPP NÃO AFROUXA POR OMISSÃO ────────────────────────── */

test("sem regra cadastrada, a exigência CONTINUA valendo", () => {
  // Uma organização que nunca configurou nada não pode ter a política afrouxada
  // por omissão: seria mudar o comportamento de quem não pediu nada.
  assert.equal(exigeWhatsapp(null), true);
  assert.equal(exigeWhatsapp(undefined), true);
  assert.equal(exigeWhatsapp({}), true);
});

test("só o `false` explícito desliga — nulo não conta", () => {
  assert.equal(exigeWhatsapp({ require_whatsapp: true }), true);
  assert.equal(exigeWhatsapp({ require_whatsapp: null }), true, "nulo é ausência de decisão");
  assert.equal(exigeWhatsapp({ require_whatsapp: false }), false);
});
