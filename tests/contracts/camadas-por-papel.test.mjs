/**
 * CONTRATO: cada papel abre a sala de comando na camada que é o trabalho dele.
 *
 * Decisão do dono em 02/08/2026: a sala de comando é tela DE TODOS. Não se
 * esconde seção por papel — o que muda é o que já vem aberto.
 *
 * Antes disto os três papéis recebiam exatamente a mesma página: mesma ordem,
 * mesmas camadas abertas. "Tela de todos" virava "tela de ninguém em
 * particular": o corretor rolava a operação inteira para chegar na fila dele, e
 * o diretor abria a fila de um corretor que não é o trabalho dele.
 *
 * O que este contrato guarda, e cada caso existe por um motivo:
 *
 *   · o DIRETOR abre com a medição — é a operação inteira, e é o que ele usa
 *     para decidir. Se algum dia isto virar `true`, a tela volta a esconder
 *     dele justamente o que ele veio ver.
 *   · o CORRETOR abre com a fila, não com a medição — a medição é o maior bloco
 *     da página e não muda decisão nenhuma que ele toma hoje.
 *   · papel desconhecido NÃO recebe padrão. Palpite sobre quem está olhando é
 *     pior que o padrão genérico, porque ninguém consegue explicar depois por
 *     que a tela abriu daquele jeito.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { camadasDoPapel } from "../../lib/atlas/camadas-da-sala-de-comando.ts";

test("o diretor abre com a MEDIÇÃO: é a operação inteira que ele veio decidir", () => {
  const d = camadasDoPapel("director");
  assert.equal(d.medicao, false, "medicao recolhida esconde do diretor o que ele veio ver");
  assert.equal(d.fila, true, "a fila do corretor não é o trabalho do diretor");
});

test("admin é tratado como diretor — é o papel que enxerga tudo", () => {
  assert.deepEqual(camadasDoPapel("admin"), camadasDoPapel("director"));
});

test("o corretor abre com a FILA e sem a medição", () => {
  const c = camadasDoPapel("broker");
  assert.equal(c.fila, false, "a fila é o trabalho dele");
  assert.equal(c.medicao, true, "o maior bloco da página não muda decisão que ele toma hoje");
});

test("o gestor abre com as DUAS: decide sobre pessoas e precisa do número", () => {
  const g = camadasDoPapel("manager");
  assert.equal(g.fila, false);
  assert.equal(g.medicao, false);
});

test("superintendente segue o gestor", () => {
  assert.deepEqual(camadasDoPapel("superintendent"), camadasDoPapel("manager"));
});

test("papel desconhecido NÃO recebe padrão — palpite é pior que o genérico", () => {
  for (const papel of ["", "convidado", "qualquer-coisa"]) {
    assert.deepEqual(camadasDoPapel(papel), {}, `${papel} não pode receber padrão inventado`);
  }
});

test("nenhum papel recolhe TUDO: a tela é de todos, e todos veem alguma coisa", () => {
  for (const papel of ["director", "manager", "broker", "admin", "superintendent"]) {
    const c = camadasDoPapel(papel);
    const abertas = Object.values(c).filter((v) => v === false).length;
    assert.ok(abertas >= 1, `${papel} abriria a sala de comando com tudo recolhido`);
  }
});
