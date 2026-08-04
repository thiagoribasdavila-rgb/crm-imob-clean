/**
 * Contrato do VIGIA DA INGESTÃO PARADA.
 *
 * O caso que motivou o arquivo: 03/08/2026, `meta_lead_events` parou às 15:29 e
 * seis leads reais (16:16 → 21:52) nunca entraram. Nada acendeu, porque o
 * painel media integração CONFIGURADA e não integração PRODUZINDO.
 *
 * A maioria dos casos abaixo é sobre NÃO acender: um vigia que toca toda
 * madrugada é um vigia que ninguém lê em uma semana, e aí ele não serve nem
 * para o dia em que deveria tocar.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { avaliarIngestao, historicoPorHora } from "../../lib/integrations/ingestao-parada.ts";

const HORA = 60 * 60_000;
const AGORA = Date.parse("2026-08-03T21:00:00Z");

/** Faixa movimentada: entrou lead nesta hora em 13 dos últimos 14 dias. */
const movimentada = (hora) => ({ hora, diasComEntrada: 13, diasObservados: 14 });
/** Faixa morta: madrugada, 1 dia em 14. */
const morta = (hora) => ({ hora, diasComEntrada: 1, diasObservados: 14 });

const fatos = (over = {}) => ({
  agora: AGORA,
  ultimoEventoEm: AGORA - 30 * 60_000,
  horaAgora: 21,
  historico: [movimentada(21)],
  processados: 0,
  falhados: 0,
  ...over,
});

// ── O CASO REAL ─────────────────────────────────────────────────────────────

test("seis horas de silêncio numa faixa movimentada acende", () => {
  const v = avaliarIngestao(fatos({ ultimoEventoEm: AGORA - 6 * HORA }));
  assert.equal(v.acende, true);
  assert.equal(v.motivo, "silencio_anomalo");
  assert.equal(v.silencioEmMinutos, 360);
  assert.match(v.porque, /6 h sem nenhum evento/);
  assert.match(v.porque, /13 dos últimos 14 dias/);
  // A frase precisa dizer O QUE CONFERIR, na ordem. Alarme sem próximo passo
  // vira alarme que se aprende a fechar.
  assert.match(v.porque, /backfill rodou\?.*token.*Página/s);
});

// ── QUANDO NÃO PODE ACENDER ─────────────────────────────────────────────────

test("madrugada quieta não acende — é rotina, não defeito", () => {
  const v = avaliarIngestao(fatos({
    ultimoEventoEm: AGORA - 6 * HORA,
    horaAgora: 4,
    historico: [morta(4)],
  }));
  assert.equal(v.acende, false);
  assert.match(v.porque, /raramente tem movimento/);
  // Mesmo sem acender, o número aparece: "não julguei" é diferente de "está ok".
  assert.equal(v.silencioEmMinutos, 360);
});

test("silêncio curto não acende nem em faixa movimentada", () => {
  // Uma hora pode ser só a espera pela próxima passagem do backfill (33 * * * *).
  const v = avaliarIngestao(fatos({ ultimoEventoEm: AGORA - 1 * HORA }));
  assert.equal(v.acende, false);
  assert.match(v.porque, /dentro do normal/);
});

test("faixa sem histórico nenhum não é julgada", () => {
  const v = avaliarIngestao(fatos({ ultimoEventoEm: AGORA - 8 * HORA, historico: [] }));
  assert.equal(v.acende, false);
  assert.equal(v.confiancaDaFaixa, 0);
});

test("fim de semana não cala o vigia em dia útil", () => {
  // 10 de 14 dias = 0,71, acima do piso de 0,6. Dois fins de semana sem
  // movimento não podem transformar a faixa em 'quieta por natureza'.
  const v = avaliarIngestao(fatos({
    ultimoEventoEm: AGORA - 5 * HORA,
    historico: [{ hora: 21, diasComEntrada: 10, diasObservados: 14 }],
  }));
  assert.equal(v.acende, true);
});

// ── ENTRA E NÃO VIRA ────────────────────────────────────────────────────────

test("evento chegando e morrendo acende mesmo sem silêncio nenhum", () => {
  // Este é o modo que o critério de silêncio JAMAIS pegaria: os eventos entram,
  // então não há silêncio — e nenhuma lead nasce.
  const v = avaliarIngestao(fatos({ processados: 20, falhados: 15 }));
  assert.equal(v.acende, true);
  assert.equal(v.motivo, "entra_e_nao_vira");
  assert.match(v.porque, /15 de 20/);
  assert.match(v.porque, /não a conexão da Página/);
});

test("a dedupe normal da base NÃO acende", () => {
  // 42 de 123 em três dias na base real = 34%, abaixo do teto de 40%. Um teto
  // mais apertado acenderia sobre o funcionamento normal.
  const v = avaliarIngestao(fatos({ processados: 123, falhados: 42 }));
  assert.equal(v.acende, false);
});

test("amostra pequena não vira alarme de taxa", () => {
  // 2 de 3 é 67%, mas três eventos não sustentam conclusão nenhuma.
  const v = avaliarIngestao(fatos({ processados: 3, falhados: 2 }));
  assert.equal(v.acende, false);
});

test("falha vence silêncio quando os dois valem", () => {
  const v = avaliarIngestao(fatos({ ultimoEventoEm: AGORA - 6 * HORA, processados: 20, falhados: 15 }));
  assert.equal(v.motivo, "entra_e_nao_vira", "a causa mais específica é a que se investiga primeiro");
});

// ── NUNCA PRODUZIU ──────────────────────────────────────────────────────────

test("integração que nunca trouxe evento não passa por saudável", () => {
  const v = avaliarIngestao(fatos({ ultimoEventoEm: null }));
  assert.equal(v.acende, true);
  assert.equal(v.motivo, "nunca_produziu");
  assert.equal(v.silencioEmMinutos, null, "sem primeiro evento não há silêncio a medir");
  assert.match(v.porque, /configurar não é o mesmo que funcionar/);
});

// ── O HISTÓRICO ─────────────────────────────────────────────────────────────

test("o histórico conta DIAS distintos, não eventos", () => {
  // Vinte eventos no mesmo dia e na mesma hora são UM dia com entrada. Contar
  // eventos faria um único dia movimentado parecer hábito de duas semanas.
  const horaDe = (ms) => new Date(ms).getUTCHours();
  const mesmoDia = Array.from({ length: 20 }, (_, i) => Date.parse("2026-08-01T21:10:00Z") + i * 1000);
  const h = historicoPorHora(mesmoDia, AGORA, 14, horaDe);
  const faixa = h.find((x) => x.hora === 21);
  assert.equal(faixa.diasComEntrada, 1);
  assert.equal(faixa.diasObservados, 14);
});

test("carimbo fora da janela observada é descartado", () => {
  const horaDe = (ms) => new Date(ms).getUTCHours();
  const antigo = [Date.parse("2026-06-01T21:00:00Z")];
  const h = historicoPorHora(antigo, AGORA, 14, horaDe);
  assert.equal(h.find((x) => x.hora === 21).diasComEntrada, 0);
});

test("as 24 faixas sempre existem, mesmo sem nenhum evento", () => {
  const h = historicoPorHora([], AGORA, 14, (ms) => new Date(ms).getUTCHours());
  assert.equal(h.length, 24);
  assert.ok(h.every((x) => x.diasComEntrada === 0 && x.diasObservados === 14));
});
