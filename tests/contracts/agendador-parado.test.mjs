/**
 * Contrato do detector de AGENDADOR PARADO.
 *
 * Nasceu de um caso real: em 2026-07-30 havia dois itens `meta.lead.fetch` com
 * `attempts = 0` parados há 89h e 44h — um deles uma lead paga da Meta que nunca
 * virou registro. De fora, worker MORTO e worker SEM TRABALHO são idênticos: os
 * dois deixam a fila quieta.
 *
 * O contrato existe porque, quando o detector foi escrito, a fila já tinha sido
 * processada e ele só pôde ser exercitado no caso "está tudo bem". Detector cujo
 * lado positivo nunca rodou é a guarda inútil mais comum deste repositório.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { avaliarAgendador, HORAS_PARA_SUSPEITAR } from "../../lib/integrations/agendador-parado.ts";

const AGORA = Date.parse("2026-07-30T18:00:00.000Z");
const horasAtras = (h) => new Date(AGORA - h * 3_600_000).toISOString();

test("O CASO REAL: dois itens nunca tentados, parados 89h e 44h", () => {
  const estado = avaliarAgendador(
    [
      { attempts: 0, created_at: horasAtras(89) },
      { attempts: 0, created_at: horasAtras(44) },
    ],
    AGORA,
  );
  assert.equal(estado.agendadorParadoProvavel, true);
  assert.equal(estado.nuncaTentadas, 2);
  assert.equal(estado.maisAntigaHoras, 89, "reporta o MAIS antigo, que é o que dói");
});

test("UM item basta — não é alarme por volume", () => {
  // Uma lead paga parada já prova que o agendador não acordou. Exigir volume
  // deixaria o defeito invisível justamente quando ele começa.
  const estado = avaliarAgendador([{ attempts: 0, created_at: horasAtras(3) }], AGORA);
  assert.equal(estado.agendadorParadoProvavel, true);
});

test("fila VAZIA não é agendador parado", () => {
  // O outro lado: uma regra que sempre acusa encheria a prontidão de alarme e
  // seria desligada na primeira semana.
  const estado = avaliarAgendador([], AGORA);
  assert.equal(estado.agendadorParadoProvavel, false);
  assert.equal(estado.maisAntigaHoras, null, "fila vazia não tem idade — e null não é zero");
});

test("item RECÉM-chegado e não tentado é a fila funcionando", () => {
  const estado = avaliarAgendador([{ attempts: 0, created_at: horasAtras(0.2) }], AGORA);
  assert.equal(estado.agendadorParadoProvavel, false, "12 minutos é cadência normal, não pane");
});

test("item VELHO mas JÁ TENTADO é outro problema, com outro conserto", () => {
  /**
   * Worker que acorda e falha precisa de correção no handler ou na credencial —
   * foi o caso das 6 entregas com `attempts = 1`. Acusar "agendador parado" aqui
   * mandaria a pessoa reinstalar cron para um defeito que não é de cron.
   */
  const estado = avaliarAgendador([{ attempts: 3, created_at: horasAtras(120) }], AGORA);
  assert.equal(estado.agendadorParadoProvavel, false);
  assert.equal(estado.nuncaTentadas, 0);
});

test("a fronteira das 2 horas é exata nos dois lados", () => {
  const dentro = avaliarAgendador([{ attempts: 0, created_at: horasAtras(HORAS_PARA_SUSPEITAR) }], AGORA);
  const fora = avaliarAgendador([{ attempts: 0, created_at: horasAtras(HORAS_PARA_SUSPEITAR - 0.6) }], AGORA);
  assert.equal(dentro.agendadorParadoProvavel, true, "exatamente no limite já acusa");
  assert.equal(fora.agendadorParadoProvavel, false);
});

test("mistura: um tentado e um não tentado — o não tentado manda", () => {
  const estado = avaliarAgendador(
    [
      { attempts: 2, created_at: horasAtras(100) },
      { attempts: 0, created_at: horasAtras(50) },
    ],
    AGORA,
  );
  assert.equal(estado.agendadorParadoProvavel, true);
  assert.equal(estado.nuncaTentadas, 1);
});

test("data ilegível não vira idade zero", () => {
  // Ausência não declarada indistinguível de zero é o defeito que este projeto
  // mais pagou. Sem data legível, não há idade — e sem idade não se acusa.
  const estado = avaliarAgendador([{ attempts: 0, created_at: "sexta-feira" }], AGORA);
  assert.equal(estado.maisAntigaHoras, null);
  assert.equal(estado.agendadorParadoProvavel, false, "não dá para afirmar parada sem saber há quanto tempo");
});
