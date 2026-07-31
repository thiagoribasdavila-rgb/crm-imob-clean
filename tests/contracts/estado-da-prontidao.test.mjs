/**
 * Contrato dos SEIS ESTADOS DA PRONTIDÃO.
 *
 * Nasceu de um caso medido: em 2026-07-30 um kill switch acionado produzia
 * exatamente a mesma tela que um agendador morto. Quem olhasse não distinguiria
 * uma pausa intencional de 44 horas de fila parada — e foi assim que 44h49m
 * passaram despercebidas.
 *
 * O que este contrato protege não é a existência dos estados: é a PRECEDÊNCIA
 * entre eles. Um sistema pausado acumula fila por construção; se "parado"
 * vencesse "pausado", toda pausa viraria incidente depois de alguns minutos, e o
 * alerta que grita sempre é o alerta que ninguém lê.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { avaliarProntidao, EXPLICACAO_DO_ESTADO } from "../../lib/integrations/estado-da-prontidao.ts";

/** Tudo certo. Cada teste tira UMA condição daqui. */
const saudavel = {
  bancoOk: true,
  segredoDoCronConfigurado: true,
  pausada: false,
  filaMedida: true,
  itensComFalha: 0,
  agendadorMedido: true,
  agendadorParado: false,
};

test("healthy quando tudo foi medido e nada está errado", () => {
  const v = avaliarProntidao(saudavel);
  assert.equal(v.estado, "healthy");
  assert.equal(v.exigeAcao, false);
  assert.equal(v.medido, true);
});

test("degraded: executa, mas há entrega que não aconteceu", () => {
  const v = avaliarProntidao({ ...saudavel, itensComFalha: 2 });
  assert.equal(v.estado, "degraded");
  assert.equal(v.exigeAcao, true);
  assert.match(v.motivo, /2 item/);
});

test("unhealthy: agendador parado com fila elegível", () => {
  const v = avaliarProntidao({ ...saudavel, agendadorParado: true });
  assert.equal(v.estado, "unhealthy");
  assert.equal(v.exigeAcao, true);
});

test("unhealthy: banco fora do ar vence tudo", () => {
  // Sem banco, nenhuma outra medida é confiável — inclusive as que pareceriam boas.
  const v = avaliarProntidao({ ...saudavel, bancoOk: false, pausada: true, itensComFalha: 99 });
  assert.equal(v.estado, "unhealthy");
  assert.match(v.motivo, /banco não respondeu/i);
});

test("not_configured: sem o segredo do cron, nunca chegou a funcionar", () => {
  const v = avaliarProntidao({ ...saudavel, segredoDoCronConfigurado: false });
  assert.equal(v.estado, "not_configured");
  assert.match(v.motivo, /configuração pendente/i);
});

test("unknown quando a fila não pôde ser lida — e `medido` é false", () => {
  const v = avaliarProntidao({ ...saudavel, filaMedida: false });
  assert.equal(v.estado, "unknown");
  assert.equal(v.medido, false);
  assert.equal(v.exigeAcao, true);
});

test("unknown também quando o agendador não pôde ser avaliado", () => {
  const v = avaliarProntidao({ ...saudavel, agendadorMedido: false });
  assert.equal(v.estado, "unknown");
  assert.equal(v.medido, false);
});

test("paused_by_kill_switch quando o kill switch está acionado", () => {
  const v = avaliarProntidao({ ...saudavel, pausada: true });
  assert.equal(v.estado, "paused_by_kill_switch");
  assert.equal(v.exigeAcao, false, "pausa intencional NÃO pode exigir ação");
});

// ── A PRECEDÊNCIA — a razão de este contrato existir ───────────────────────

test("PAUSA VENCE PARADO — senão toda pausa vira incidente em poucos minutos", () => {
  // O cenário exato: alguém pausou, e por isso a fila acumulou e o detector de
  // agendador parado disparou. Reportar isso como `unhealthy` acordaria gente por
  // uma decisão consciente.
  const v = avaliarProntidao({ ...saudavel, pausada: true, agendadorParado: true, itensComFalha: 5 });
  assert.equal(v.estado, "paused_by_kill_switch");
  assert.equal(v.exigeAcao, false);
});

test("PAUSA VENCE FALHA NA FILA, pelo mesmo motivo", () => {
  const v = avaliarProntidao({ ...saudavel, pausada: true, itensComFalha: 3 });
  assert.equal(v.estado, "paused_by_kill_switch");
});

test("NOT_CONFIGURED VENCE UNHEALTHY — 'nunca ligou' não é 'quebrou'", () => {
  // Sem o segredo, o worker recusa toda chamada com 401 e a fila fica parada por
  // consequência. Chamar isso de falha manda investigar; o conserto é configurar.
  const v = avaliarProntidao({ ...saudavel, segredoDoCronConfigurado: false, agendadorParado: true });
  assert.equal(v.estado, "not_configured");
});

test("BANCO FORA vence até a pausa — nada é confiável sem ele", () => {
  const v = avaliarProntidao({ ...saudavel, bancoOk: false, pausada: true });
  assert.equal(v.estado, "unhealthy");
});

test("unknown NÃO se disfarça de healthy quando não há falha conhecida", () => {
  // A armadilha clássica: não consegui ler a fila, não vi falha, logo "está bem".
  const v = avaliarProntidao({ ...saudavel, filaMedida: false, itensComFalha: 0, agendadorParado: false });
  assert.notEqual(v.estado, "healthy");
  assert.equal(v.estado, "unknown");
});

test("todo estado tem explicação escrita para a tela", () => {
  for (const estado of ["healthy", "degraded", "paused_by_kill_switch", "not_configured", "unhealthy", "unknown"]) {
    assert.ok(EXPLICACAO_DO_ESTADO[estado], `${estado} sem explicação`);
    assert.ok(EXPLICACAO_DO_ESTADO[estado].length > 20, `${estado} com explicação curta demais para servir`);
  }
});

test("a explicação da pausa diz explicitamente que NÃO é pane", () => {
  // É a frase que impede alguém de tratar governança como incidente.
  assert.match(EXPLICACAO_DO_ESTADO.paused_by_kill_switch, /não é pane|nao e pane/i);
});

test("a explicação de unknown nega que seja 'tudo bem'", () => {
  assert.match(EXPLICACAO_DO_ESTADO.unknown, /NÃO significa que está tudo bem/i);
});

test("nenhum motivo vaza segredo, valor ou prefixo", () => {
  const casos = [
    saudavel,
    { ...saudavel, segredoDoCronConfigurado: false },
    { ...saudavel, pausada: true },
    { ...saudavel, bancoOk: false },
    { ...saudavel, filaMedida: false },
    { ...saudavel, agendadorParado: true },
    { ...saudavel, itensComFalha: 7 },
  ];
  for (const caso of casos) {
    const { motivo } = avaliarProntidao(caso);
    // O nome da variável pode aparecer (é público); o VALOR nunca chega aqui,
    // porque a observação só carrega booleanos.
    assert.doesNotMatch(motivo, /Bearer|eyJ|sk-|senha|password/i, `motivo suspeito: ${motivo}`);
  }
});
