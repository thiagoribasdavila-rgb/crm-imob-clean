/**
 * Contrato da ÁREA MÍNIMA DE TOQUE — WCAG 2.2 AA, critério 2.5.8.
 *
 * MEDIDO em 2026-07-31, no navegador, contra build de PRODUÇÃO, em `/pipeline`:
 *
 *   antes ..... 104 alvos interativos abaixo de 24 × 24 px
 *   depois .... 0, em 360 × 800 E em 768 × 1024
 *
 * O número era IDÊNTICO nos dois viewports antes da correção — não era problema
 * de breakpoint, eram os mesmos controles pequenos em qualquer tela.
 *
 * Este contrato não mede pixel (isso exige navegador). Ele guarda a REGRA: que
 * ela existe, que expande a área sem mexer no layout, e que a exceção é
 * declarada em vez de silenciosa.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8");
const bloco = css.slice(css.indexOf("ÁREA MÍNIMA DE TOQUE"));

test("a regra de área mínima existe e vale 24px", () => {
  assert.ok(bloco.length > 200, "o bloco de área mínima de toque sumiu do globals.css");
  assert.match(bloco, /max\(100%,\s*24px\)/);
});

test("expande a ÁREA e não o layout — sem min-width/min-height no controle", () => {
  // Aumentar min-width transformaria ícones de 16px em blocos de 24px, quebraria
  // grades e mataria a densidade em 104 lugares. O pseudo-elemento expande só o
  // alvo do dedo, sem ocupar espaço no fluxo.
  const regra = bloco.slice(bloco.indexOf("button:not("));
  assert.match(regra, /::after/);
  assert.match(regra, /position:\s*absolute/);
  assert.doesNotMatch(regra, /min-width:\s*24px/);
  assert.doesNotMatch(regra, /min-height:\s*24px/);
});

test("o alvo fica CENTRADO no controle — canto quebraria o alinhamento", () => {
  assert.match(bloco, /top:\s*50%/);
  assert.match(bloco, /left:\s*50%/);
  assert.match(bloco, /translate\(-50%,\s*-50%\)/);
});

test("recebe o toque mesmo quando o pai restringe pointer-events", () => {
  assert.match(bloco, /pointer-events:\s*auto/);
});

test("a exceção é DECLARADA no HTML, não escondida no CSS", () => {
  // `data-alvo-livre` é a saída para casos onde a expansão sobreporia outro
  // controle. Quem usar precisa justificar, e a exceção fica visível na marcação.
  assert.match(bloco, /\[data-alvo-livre\]/);
  const alvos = (bloco.match(/:not\(\[data-alvo-livre\]\)/g) || []).length;
  assert.ok(alvos >= 10, `a exceção precisa valer para todos os seletores (achei ${alvos})`);
});

test("a regra cobre os papéis ARIA, não só os elementos nativos", () => {
  // Um `<div role="button">` é tão clicável quanto um `<button>`, e é onde
  // controles pequenos costumam se esconder.
  for (const papel of ['[role="button"]', '[role="tab"]', '[role="checkbox"]']) {
    assert.ok(bloco.includes(papel), `${papel} ficou de fora da regra`);
  }
});

test("as 5 rotas principais têm fronteira de carregamento própria", () => {
  // Medido: FCP 280ms contra LCP 4.080ms em /pipeline. A casca é rápida, o dado
  // é lento — e sem loading.tsx a rota inteira espera a consulta mais lenta.
  for (const rota of ["leads", "pipeline", "command-center", "tasks", "properties"]) {
    const arquivo = readFileSync(`app/(crm)/${rota}/loading.tsx`, "utf8");
    assert.match(arquivo, /aria-busy/, `${rota}: "carregando" precisa chegar ao leitor de tela`);
    assert.match(arquivo, /sr-only/, `${rota}: sem texto para leitor de tela`);
    // Blocos com altura reservada, não spinner: spinner não reserva espaço e o
    // layout salta quando o dado chega. O CLS medido (0,012–0,038) depende disso.
    assert.match(arquivo, /animate-pulse/, `${rota}: esqueleto sem forma`);
  }
});
