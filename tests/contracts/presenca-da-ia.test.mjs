/**
 * Contrato da PRESENÇA DA IA — o robô do canto.
 *
 * Duas promessas, e a segunda é a que este arquivo existe para segurar:
 *
 *   1. o robô só se mexe quando a IA está trabalhando de verdade;
 *   2. quando a IA trabalha, ele se mexe — em TODOS os chamadores.
 *
 * A segunda é a que apodrece sozinha. Um indicador ligado a um único chamador
 * fica parado quase sempre, e um indicador que fica parado quando deveria
 * acender é pior que indicador nenhum: ensina a pessoa a não olhar para ele.
 * Este teste falha quando alguém adiciona uma chamada de IA na interface sem
 * anunciá-la.
 *
 * Rodar: node --test tests/contracts/presenca-da-ia.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { stripTypeScriptTypes } from "node:module";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const fonte = fs.readFileSync(path.join(raiz, "lib", "ai", "presence.ts"), "utf8");
const { anunciarTrabalhoDeIa, comPresencaDeIa, trabalhosEmAndamento, observarPresencaDaIa } =
  await import(`data:text/javascript,${encodeURIComponent(stripTypeScriptTypes(fonte))}`);

// O módulo publica por evento no `window`; em Node não existe. Um alvo mínimo
// basta e mantém o teste sem navegador.
if (typeof globalThis.window === "undefined") {
  const ouvintes = new Map();
  globalThis.window = {
    addEventListener: (nome, fn) => ouvintes.set(fn, [nome, fn]),
    removeEventListener: (fn) => ouvintes.delete(fn),
    dispatchEvent: (evento) => {
      for (const [nome, fn] of ouvintes.values()) if (nome === evento.type) fn(evento);
      return true;
    },
  };
  globalThis.CustomEvent = class extends Event {
    constructor(tipo, init = {}) { super(tipo); this.detail = init.detail; }
  };
}

// ── Comportamento ───────────────────────────────────────────────────────────

test("nada em andamento quando ninguém anunciou", () => {
  assert.deepEqual(trabalhosEmAndamento(), []);
});

test("anunciar acende, encerrar apaga", () => {
  const encerrar = anunciarTrabalhoDeIa("Lendo a carteira");
  assert.equal(trabalhosEmAndamento().length, 1);
  assert.equal(trabalhosEmAndamento()[0].rotulo, "Lendo a carteira");
  encerrar();
  assert.deepEqual(trabalhosEmAndamento(), []);
});

test("encerrar duas vezes é seguro", () => {
  // O padrão de uso é `finally`, e componente desmontado costuma encerrar de
  // novo por precaução. O segundo encerramento não pode apagar outro trabalho.
  const a = anunciarTrabalhoDeIa("A");
  const b = anunciarTrabalhoDeIa("B");
  a();
  a();
  assert.equal(trabalhosEmAndamento().length, 1, "o segundo encerramento de A não pode levar B junto");
  b();
});

test("trabalhos simultâneos aparecem do mais antigo para o mais novo", () => {
  const a = anunciarTrabalhoDeIa("Primeiro");
  const b = anunciarTrabalhoDeIa("Segundo");
  assert.deepEqual(trabalhosEmAndamento().map((t) => t.rotulo), ["Primeiro", "Segundo"]);
  a(); b();
});

test("comPresencaDeIa encerra mesmo quando a chamada FALHA", () => {
  // Sem isto, uma chamada que estoura prende o robô em "trabalhando" para
  // sempre — o indicador vira a mentira que ele existe para evitar.
  return comPresencaDeIa("Vai falhar", async () => { throw new Error("502"); })
    .then(
      () => assert.fail("o erro tinha que propagar"),
      (erro) => {
        assert.equal(erro.message, "502", "o erro precisa chegar a quem chamou");
        assert.deepEqual(trabalhosEmAndamento(), [], "e o trabalho tem que ter encerrado");
      },
    );
});

test("comPresencaDeIa devolve o resultado e encerra no sucesso", async () => {
  const valor = await comPresencaDeIa("Vai dar certo", async () => 42);
  assert.equal(valor, 42);
  assert.deepEqual(trabalhosEmAndamento(), []);
});

test("quem assina recebe o estado ATUAL, não só o próximo", () => {
  // Um componente que monta no meio de uma chamada precisa saber que ela corre.
  const encerrar = anunciarTrabalhoDeIa("Já correndo");
  let visto = null;
  const cancelar = observarPresencaDaIa((t) => { visto = t; });
  assert.equal(visto?.length, 1, "a assinatura entrega o que já está em andamento");
  cancelar();
  encerrar();
});

// ── Estrutura: o indicador não pode voltar a ser decorativo ─────────────────

test("TODA chamada de IA da interface anuncia presença", () => {
  const componentes = [
    ["components/AtlasCopilotDock.tsx", "o copiloto"],
    ["components/atlas/NextBestActionPanel.tsx", "a próxima melhor ação"],
    ["components/atlas/ProactiveNudgesPanel.tsx", "os sinais proativos"],
    ["components/atlas/developer-weekly-report.tsx", "o relatório do parceiro"],
  ];
  const semAnuncio = componentes.filter(([arquivo]) => {
    const texto = fs.readFileSync(path.join(raiz, arquivo), "utf8");
    return !/comPresencaDeIa|anunciarTrabalhoDeIa/.test(texto);
  });
  assert.deepEqual(
    semAnuncio.map(([, nome]) => nome),
    [],
    "chamador de IA sem anúncio deixa o robô parado enquanto a IA trabalha — e um indicador que não acende ensina a não olhar para ele",
  );
});

test("o robô lê o estado, não o inventa", () => {
  const dock = fs.readFileSync(path.join(raiz, "components", "atlas", "ai-presence-dock.tsx"), "utf8");
  assert.match(dock, /observarPresencaDaIa/, "o dock precisa assinar a presença real");
  assert.match(dock, /data-trabalhando=\{trabalhando/, "o estado visual vem do sinal, não de um timer");
  assert.ok(
    !/setInterval|Math\.random/.test(dock),
    "animação por temporizador é decoração fingindo ser telemetria: continuaria girando com a IA travada",
  );
});

test("a presença é de interface e não substitui a medição de custo", () => {
  // Comentários fora antes de afirmar coisas sobre o CÓDIGO: o próprio arquivo
  // EXPLICA o uso com `() => fetch(...)` no exemplo, e um portão que lê prosa
  // mede a documentação. O remédio óbvio — apagar o exemplo — deixaria o código
  // pior, então quem se ajusta é o portão.
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.ok(
    !/supabase|ai_usage_events|fetch\(/.test(codigo),
    "custo e contagem de chamadas se apuram no banco, por quem decide verba — não num contador de aba",
  );
});
