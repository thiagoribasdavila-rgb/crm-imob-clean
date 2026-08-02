/**
 * CONTRATO: a recuperação da base e o rodízio de dez números.
 *
 * As duas peças foram construídas em 02/08/2026, depois de medir no banco de
 * produção que 252 das 419 leads perdidas (61%) foram descartadas como
 * `inalcancavel` — que não é "não quer", é "ligamos e não atenderam".
 *
 * O que este contrato guarda, e por que cada caso existe:
 *
 *   · quem RECUSOU não volta — a manifestação da pessoa vale mais que a fila
 *   · quem foi SUPRIMIDO não volta por canal nenhum
 *   · a falta de base legal NÃO bloqueia mais (decisão do dono, registrada),
 *     mas ela continua ORDENANDO: quem tem base vai primeiro
 *   · o pool NUNCA devolve um número quando não há número saudável — ele
 *     devolve o MOTIVO. Um pool que sempre responde transforma dez números
 *     ativos em dez queimados.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decidirRecuperacao,
  filaDeRecuperacao,
  resumoDaRecuperacao,
  baseLegalParaMensagem,
} from "../../lib/crm/recuperacao-da-base.ts";
import { escolherNumero, saudeDoPool, diasParaVarrerAFila } from "../../lib/whatsapp/pool-de-numeros.ts";

const lead = (over = {}) => ({
  id: "l1",
  motivoDoDescarte: "inalcancavel",
  temTelefone: true,
  temEmail: false,
  suprimido: false,
  origem: {},
  ...over,
});

/* ── RECUPERAÇÃO ─────────────────────────────────────────────────────────── */

test("inalcançável com telefone é recuperável por mensagem — é o caso das 252", () => {
  const d = decidirRecuperacao(lead());
  assert.equal(d.recuperavel, true);
  assert.equal(d.canal, "mensagem");
});

test("SEM base legal continua recuperável — a trava de consentimento saiu", () => {
  const d = decidirRecuperacao(lead({ origem: { dataSharingConsent: "false", origem: "importacao_planilha" } }));
  assert.equal(d.recuperavel, true, "as 234 da planilha não podem mais ser bloqueadas");
  assert.equal(d.canal, "mensagem");
  assert.equal(d.baseLegal, null, "a base continua sendo reportada como dado, e aqui ela não existe");
});

test("quem TEM base legal vai na frente de quem não tem", () => {
  const comBase = decidirRecuperacao(
    lead({ id: "com", origem: { dataSharingConsent: true, consentBasis: "clausula_de_compartilhamento_no_formulario_meta" } }),
  );
  const semBase = decidirRecuperacao(lead({ id: "sem", origem: { dataSharingConsent: "false" } }));
  assert.ok(comBase.prioridade < semBase.prioridade, "menos risco de reclamação ataca primeiro");
});

test("quem RECUSOU não volta, e o motivo diz por quê", () => {
  for (const motivo of ["sem_interesse", "spam", "opt_out", "nao_perturbe"]) {
    const d = decidirRecuperacao(lead({ motivoDoDescarte: motivo }));
    assert.equal(d.recuperavel, false, `${motivo} não pode voltar`);
    assert.match(d.porque, /manifest/i);
  }
});

test("supressão vence tudo, inclusive base legal e telefone", () => {
  const d = decidirRecuperacao(
    lead({ suprimido: true, origem: { dataSharingConsent: true, consentBasis: "formulario_meta" } }),
  );
  assert.equal(d.recuperavel, false);
  assert.equal(d.canal, "nenhum");
});

test("contato inválido não é recusa nem falha de alcance: nenhum canal resolve", () => {
  const d = decidirRecuperacao(lead({ motivoDoDescarte: "contato_invalido" }));
  assert.equal(d.recuperavel, false);
  assert.match(d.porque, /dado de contato/i);
});

test("descarte SEM motivo escrito entra na fila — 139 leads estão nesse caso", () => {
  assert.equal(decidirRecuperacao(lead({ motivoDoDescarte: null })).recuperavel, true);
});

test("a base legal sai do consentimento, e a string 'false' do JSON NÃO passa", () => {
  assert.equal(baseLegalParaMensagem({ dataSharingConsent: "false" }), null);
  assert.equal(baseLegalParaMensagem({ dataSharingConsent: false }), null);
  assert.equal(baseLegalParaMensagem({ dataSharingConsent: true, consentBasis: "x" }), "x");
  assert.equal(
    baseLegalParaMensagem({ dataSharingConsent: true, origem: "formulario_meta" }),
    "origem_formulario_meta",
    "consentiu sem base escrita: a origem vira a base, porque foi o que aconteceu",
  );
});

test("o resumo NUNCA esconde quem ficou de fora, nem por quê", () => {
  const r = resumoDaRecuperacao([
    lead({ id: "a" }),
    lead({ id: "b", motivoDoDescarte: "sem_interesse" }),
    lead({ id: "c", suprimido: true }),
  ]);
  assert.equal(r.avaliadas, 3);
  assert.equal(r.recuperaveis, 1);
  assert.equal(r.naoRecuperaveis, 2);
  assert.equal(r.porqueForamExcluidas.length, 2, "cada exclusão tem a frase dela");
});

test("a fila sai ordenada e sem os não recuperáveis", () => {
  const fila = filaDeRecuperacao([
    lead({ id: "sem-base", origem: { dataSharingConsent: "false" } }),
    lead({ id: "recusou", motivoDoDescarte: "sem_interesse" }),
    lead({ id: "com-base", origem: { dataSharingConsent: true, consentBasis: "meta" } }),
  ]);
  assert.deepEqual(fila.map((d) => d.leadId), ["com-base", "sem-base"]);
});

/* ── POOL DE NÚMEROS ─────────────────────────────────────────────────────── */

const numero = (over = {}) => ({
  id: "n1",
  phoneNumberId: "pn1",
  rotulo: "Número 1",
  qualidade: "verde",
  limiteDiario: 1000,
  usadasEm24h: 0,
  pausadoPorPessoa: false,
  ultimoUsoEm: null,
  ...over,
});

const AGORA = 1_800_000_000_000;

test("pool vazio NÃO devolve número, e diz que é 'sem número', não 'sem folga'", () => {
  const e = escolherNumero([], AGORA);
  assert.equal(e.escolhido, false);
  assert.equal(e.motivo, "pool_vazio");
});

test("todos em vermelho NÃO devolve número — trocar de número não resolve a causa", () => {
  const e = escolherNumero([numero({ qualidade: "vermelho" }), numero({ id: "n2", qualidade: "vermelho" })], AGORA);
  assert.equal(e.escolhido, false);
  assert.equal(e.motivo, "todos_em_vermelho");
  assert.match(e.detalhe, /acelera o banimento/i);
});

test("cota esgotada e todos pausados são motivos DIFERENTES: pedem ações diferentes", () => {
  const esgotado = escolherNumero([numero({ usadasEm24h: 1000 })], AGORA);
  assert.equal(esgotado.motivo, "sem_folga_hoje");
  const pausado = escolherNumero([numero({ pausadoPorPessoa: true })], AGORA);
  assert.equal(pausado.motivo, "todos_pausados_por_pessoa");
});

test("a cota utilizável é 85% do degrau — a margem existe para a resposta do cliente", () => {
  assert.equal(escolherNumero([numero({ usadasEm24h: 849 })], AGORA).escolhido, true);
  assert.equal(escolherNumero([numero({ usadasEm24h: 850 })], AGORA).escolhido, false);
});

test("amarelo opera com metade da folga: ele está a um passo do vermelho", () => {
  assert.equal(escolherNumero([numero({ qualidade: "amarelo", usadasEm24h: 424 })], AGORA).escolhido, true);
  assert.equal(escolherNumero([numero({ qualidade: "amarelo", usadasEm24h: 425 })], AGORA).escolhido, false);
});

test("verde vem antes de amarelo, mesmo com o amarelo tendo mais folga", () => {
  const e = escolherNumero(
    [numero({ id: "amarelo-folgado", qualidade: "amarelo", limiteDiario: 10000 }), numero({ id: "verde-apertado", usadasEm24h: 800 })],
    AGORA,
  );
  assert.equal(e.escolhido, true);
  assert.equal(e.numero.id, "verde-apertado");
});

test("entre iguais, o MENOS recentemente usado leva — é isso que espalha a carga", () => {
  const e = escolherNumero(
    [numero({ id: "recente", ultimoUsoEm: AGORA - 60_000 }), numero({ id: "antigo", ultimoUsoEm: AGORA - 3_600_000 })],
    AGORA,
  );
  assert.equal(e.numero.id, "antigo");
});

test("dez números respondem a pergunta do diretor: quantos dias para varrer as 252", () => {
  const dez = Array.from({ length: 10 }, (_, i) => numero({ id: `n${i}`, phoneNumberId: `pn${i}`, limiteDiario: 250 }));
  const saude = saudeDoPool(dez, AGORA);
  assert.equal(saude.total, 10);
  assert.equal(saude.podeOperarHoje, true);
  // 250 * 0,85 = 212 por número; 2.120 no rodízio inteiro.
  assert.equal(saude.folgaTotal, 2120);
  assert.equal(diasParaVarrerAFila(dez, 252, AGORA), 1, "as 252 cabem num dia só com dez números");
});

test("sem folga, 'dias para varrer' devolve null em vez de infinito", () => {
  assert.equal(diasParaVarrerAFila([numero({ usadasEm24h: 1000 })], 252, AGORA), null);
});

test("a saude do pool nomeia a causa quando nao da para operar", () => {
  const s = saudeDoPool([numero({ qualidade: "vermelho" })], AGORA);
  assert.equal(s.podeOperarHoje, false);
  assert.equal(s.motivo, "todos_em_vermelho");
  assert.equal(s.vermelhos, 1);
});
