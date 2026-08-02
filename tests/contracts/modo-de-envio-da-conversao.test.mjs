/**
 * Contrato do MODO DE ENVIO DA CONVERSÃO.
 *
 * ── A pinça que este contrato existe para impedir de voltar ─────────────────
 *
 * Medido em 02/08/2026, no banco de produção: uma linha em
 * `meta_conversion_configs`, `enabled = true`, `mode = 'test'`. E o sistema
 * fechava dos dois lados:
 *
 *   - EM TESTE, o evento sai com `test_event_code`. A Meta recebe, mostra na
 *     aba de teste do Gerenciador de Eventos e NÃO usa para otimizar entrega.
 *     O dataset recebe e não aprende.
 *   - FORA DO TESTE, `lib/meta/conversions.ts` não enfileirava. Não enfileirar
 *     era o caminho de SUCESSO do `return`: nenhum erro, nenhum log, nenhuma
 *     linha morta na fila. O sintoma seria "a Meta parou de melhorar", meses
 *     depois, sem nada apontando para cá.
 *
 * Não havia estado em que o sinal chegasse valendo. E existe rota de diretoria
 * (`conversion_go_live`) cuja única função é criar exatamente o estado que
 * parava o envio.
 *
 * As asserções abaixo apontam para o COMPORTAMENTO. As que ainda leem texto
 * leem a AUSÊNCIA do que causava o defeito — um portão que exige a volta do
 * texto antigo para falhar é mais forte que um portão removido.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { deveEnviarCodigoDeTeste, normalizarModoDeEnvio } from "../../lib/meta/modo-de-envio.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

const fila = ler("lib", "meta", "conversions.ts");
const worker = ler("app", "api", "v2", "outbox", "process", "route.ts");
const janela = ler("lib", "integrations", "meta", "capi-window.ts");

test("só existem dois modos, e o desconhecido cai para TESTE", () => {
  assert.equal(normalizarModoDeEnvio("live"), "live");
  assert.equal(normalizarModoDeEnvio("test"), "test");
  // Errar para o teste custa um evento não contabilizado; errar para o outro
  // lado contamina a otimização real com dado que ninguém validou.
  for (const estranho of [undefined, null, "", "LIVE", "Live", " live ", "producao", "production", 1, true, {}]) {
    assert.equal(normalizarModoDeEnvio(estranho), "test", `"${String(estranho)}" não pode virar produção`);
  }
});

test("o MESMO predicado decide exigir o código e mandar o código", () => {
  assert.equal(deveEnviarCodigoDeTeste("test"), true);
  assert.equal(deveEnviarCodigoDeTeste("live"), false);
  // Se as duas perguntas fossem respondidas em lugares diferentes, uma metade
  // do acidente basta: exigir e não mandar manda o ensaio como PRODUÇÃO.
  const guarda = "deveEnviarCodigoDeTeste(modoDeEnvio) && !config.test_event_code";
  const corpo = "deveEnviarCodigoDeTeste(modoDeEnvio) ? { test_event_code: config.test_event_code }";
  assert.ok(worker.includes(guarda), "a exigência do código precisa vir do predicado compartilhado");
  assert.ok(worker.includes(corpo), "o corpo enviado precisa vir do MESMO predicado");
});

test("enfileirar NÃO depende do modo — a metade silenciosa da pinça", () => {
  assert.ok(!/config\.mode/.test(fila),
    "a fila voltou a ler o modo: sair do teste para de alimentar o outbox sem um único erro");
  assert.ok(!fila.includes("conversion_test_disabled"),
    "a razão de recusa não pode voltar a citar teste — quem recusa é `enabled`");
  assert.ok(fila.includes('reason: "conversion_disabled"'),
    "a recusa precisa nomear o que de fato recusou");
});

test("a regra do modo mora em UM lugar só", () => {
  // Esta era a terceira cópia da mesma decisão, e cópias de regra de modo foi
  // como o remetente e a fila passaram a discordar em primeiro lugar.
  assert.ok(janela.includes("normalizarModoDeEnvio(data.mode)"),
    "o leitor de config da janela precisa delegar, não repetir o ternário");
  for (const [nome, arquivo] of [["fila", fila], ["worker", worker], ["janela", janela]]) {
    assert.ok(!/mode === "live" \? "live" : "test"/.test(arquivo),
      `${nome} tem cópia própria da regra de modo`);
  }
});

test("sair do modo de teste não pode voltar a ser um erro do worker", () => {
  assert.ok(!worker.includes("Conversões Meta permanecem bloqueadas fora do modo de teste."),
    "produção deixou de ser bloqueio: promover o dataset é gesto de diretoria, não defeito");
  // O que continua estourando é o único acidente real: teste sem código, que
  // mandaria o ensaio para a otimização de verdade.
  assert.ok(worker.includes("mode='test' sem test_event_code"),
    "teste sem código precisa falhar FECHADO, e a frase precisa dizer o que fazer");
});

test("o banco aceita os dois modos conhecidos e recusa o resto", () => {
  const migracao = ler("supabase", "migrations", "20260802230000_modo_de_producao_aceito_no_capi.sql");
  assert.ok(migracao.includes("check (mode in ('test', 'live'))"),
    "sem isto o `conversion_go_live` termina em erro de constraint");
  // Sem restrição nenhuma, um 'production' digitado à mão viraria teste em
  // silêncio pela normalização — e o dono juraria estar em produção.
  assert.ok(migracao.includes("drop constraint if exists meta_conversion_configs_mode_check"));
});
