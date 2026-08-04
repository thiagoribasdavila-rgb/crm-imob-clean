/**
 * Contrato do DIAGNÓSTICO DO CANAL DE CONVERSA.
 *
 * Por que este arquivo existe: a decisão central da tela `/conversations` —
 * distinguir "ninguém conversou" de "não há por onde conversar" — foi entregue
 * SEM portão. Auditoria de 02/08/2026: mutei `podeReceber` para `true` (o que
 * transforma canal morto em "ninguém conversou", exatamente a mentira que o
 * módulo existe para impedir) e a escada inteira passou verde — 1434 testes,
 * 0 falhas, tsc limpo. Nenhuma asserção no repositório alcançava esta decisão.
 *
 * Os fatos usados aqui são os MEDIDOS no banco vivo pozbrcsfthnhmnebfoxv em
 * 02/08/2026, não formas imaginadas:
 *   conversations=0, messages=0, integrations=0 (no total),
 *   message_templates=0, whatsapp_broker_sessions=0.
 *
 * A regra que estes testes protegem: ZERO SEM CANAL NÃO PODE SER LIDO COMO
 * DESEMPENHO DA OPERAÇÃO. Cada ramo é conferido dos DOIS lados — um teste que
 * só vê o estado de hoje congelaria o defeito em vez de travá-lo.
 *
 * Rodar: node --experimental-strip-types --test tests/contracts/diagnostico-do-canal.test.mjs
 */
import test from "node:test";
import assert from "node:assert/strict";

import { diagnosticarCanal } from "../../app/api/v1/crm/conversations/diagnostico-do-canal.ts";

/** O estado REAL medido no banco vivo em 02/08/2026. */
const HOJE = {
  conversas: 0,
  mensagens: 0,
  numerosOficiais: 0,
  sessoesDeCorretorConectadas: 0,
  ponteConfigurada: false,
  templatesAprovados: 0,
};

const comFatos = (mudancas) => diagnosticarCanal({ ...HOJE, ...mudancas });

test("o estado real de 02/08/2026 é lido como CANAL DESLIGADO, não como operação parada", () => {
  const d = comFatos({});
  assert.equal(d.leituraDoZero, "canal_desligado");
  assert.equal(d.podeReceber, false);
  assert.equal(d.podeEnviar, false);
  // A frase não pode culpar a operação por um instrumento que não mede.
  assert.equal(
    d.frase,
    "Nenhuma mensagem pode chegar: não há caminho de entrada ligado. Este zero NÃO diz que ninguém conversou — diz que o produto não teria como saber.",
  );
});

test("MUTAÇÃO QUE ESTE PORTÃO EXISTE PARA PEGAR: canal morto NUNCA pode virar 'ninguem_conversou'", () => {
  // Se alguém trocar `podeReceber = oficial || ponte` por algo que devolva
  // verdadeiro sem caminho de entrada, a tela passa a cobrar o corretor por uma
  // falha de instalação. Este é o ramo que a auditoria mutou e ninguém pegou.
  const d = comFatos({});
  assert.notEqual(d.leituraDoZero, "ninguem_conversou");
  assert.equal(d.podeReceber, false);
});

test("o outro lado do mesmo ramo: com número cadastrado, o zero PASSA a ser sobre a operação", () => {
  const d = comFatos({ numerosOficiais: 1 });
  assert.equal(d.podeReceber, true);
  assert.equal(d.leituraDoZero, "ninguem_conversou");
  assert.equal(
    d.frase,
    "O canal está de pé e nenhuma mensagem chegou ainda. Este zero é sobre a operação, não sobre a instalação.",
  );
});

test("a condição de receber é a do webhook: `status` da integração NÃO entra", () => {
  // `integrations.status` tem default 'disconnected' e nenhum código escreve
  // 'active'. Se alguém exigir status aqui, o painel diria "canal desligado"
  // para sempre — inclusive depois de o dono cadastrar os números.
  const d = comFatos({ numerosOficiais: 10 });
  assert.equal(d.caminhosDeEntrada.oficial, true);
  assert.equal(d.podeReceber, true);
});

test("a ponte só conta com segredo E sessão — os dois lados, separadamente", () => {
  assert.equal(comFatos({ ponteConfigurada: true, sessoesDeCorretorConectadas: 0 }).caminhosDeEntrada.ponte, false);
  assert.equal(comFatos({ ponteConfigurada: false, sessoesDeCorretorConectadas: 3 }).caminhosDeEntrada.ponte, false);
  assert.equal(comFatos({ ponteConfigurada: true, sessoesDeCorretorConectadas: 1 }).caminhosDeEntrada.ponte, true);
});

test("a ponte sozinha já basta para RECEBER e para ENVIAR (quem fala é o celular do corretor)", () => {
  const d = comFatos({ ponteConfigurada: true, sessoesDeCorretorConectadas: 1 });
  assert.equal(d.podeReceber, true);
  assert.equal(d.podeEnviar, true);
  assert.equal(d.leituraDoZero, "ninguem_conversou");
});

test("pelo oficial, ENVIAR exige template — receber não", () => {
  const semTemplate = comFatos({ numerosOficiais: 1, templatesAprovados: 0 });
  assert.equal(semTemplate.podeReceber, true);
  assert.equal(semTemplate.podeEnviar, false);

  const comTemplate = comFatos({ numerosOficiais: 1, templatesAprovados: 1 });
  assert.equal(comTemplate.podeEnviar, true);
});

test("o aviso de descarte silencioso aparece SÓ enquanto não há nenhum número", () => {
  assert.equal(comFatos({}).mensagemEntraENinguemVe, true);
  assert.equal(comFatos({ numerosOficiais: 1 }).mensagemEntraENinguemVe, false);
});

test("havendo conversa, não há zero — e a frase passa a contar o que existe", () => {
  const d = comFatos({ conversas: 2, mensagens: 7, numerosOficiais: 1 });
  assert.equal(d.leituraDoZero, "nao_ha_zero");
  assert.equal(d.frase, "2 conversa(s) registrada(s), com 7 mensagem(ns).");
});

test("conversa existente com canal caído continua sendo 'não há zero' — o painel não apaga o passado", () => {
  const d = comFatos({ conversas: 5, mensagens: 12 });
  assert.equal(d.leituraDoZero, "nao_ha_zero");
  assert.equal(d.podeReceber, false);
});

test("toda pendência tem dono e consequência — nenhuma manda o corretor fazer o que só o dono faz", () => {
  const d = comFatos({});
  const ids = d.pendencias.map((p) => p.id);
  assert.deepEqual(ids, ["numero-oficial", "ponte-segredo", "template-aprovado"]);
  for (const p of d.pendencias) {
    assert.ok(["dono", "operacao", "engenharia"].includes(p.quemResolve), `${p.id} sem dono válido`);
    assert.ok(p.porque.length > 40, `${p.id} sem consequência escrita`);
    assert.ok(p.bloqueia.length > 0, `${p.id} não diz o que bloqueia`);
  }
});

test("com o segredo posto e ninguém conectado, a pendência muda de dono (engenharia → operação)", () => {
  const d = comFatos({ ponteConfigurada: true });
  const ponte = d.pendencias.find((p) => p.id === "ponte-sessao");
  assert.ok(ponte, "faltou a pendência de sessão");
  assert.equal(ponte.quemResolve, "operacao");
  assert.equal(d.pendencias.some((p) => p.id === "ponte-segredo"), false);
});

test("canal inteiro de pé não deixa pendência de recebimento nenhuma", () => {
  const d = comFatos({ numerosOficiais: 1, templatesAprovados: 1, ponteConfigurada: true, sessoesDeCorretorConectadas: 1 });
  assert.deepEqual(d.pendencias, []);
  assert.equal(d.podeReceber, true);
  assert.equal(d.podeEnviar, true);
});
