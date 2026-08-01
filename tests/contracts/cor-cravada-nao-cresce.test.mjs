/**
 * Contrato: COR CRAVADA NÃO PODE VOLTAR A CRESCER.
 *
 * MEDIDO em 2026-07-31: **1.360** cores em hex dentro de `.tsx`, em 80 de 289
 * arquivos. Seis valores respondiam por **82,6%** do total, todos de texto ou
 * de estado:
 *
 *     #6b7890 408x · #e8eef8 352x · #aab6ca 197x
 *     #fb7185  74x · #f5b544  52x · #34d399  40x
 *
 * O defeito é específico e esta base já o pagou: o tema claro sobrescreve as
 * classes de texto do Tailwind, mas **não tem como sobrescrever um hex cravado
 * no arquivo**. `text-[#e8eef8]` — quase branco — continua quase branco sobre
 * fundo claro, e o texto some.
 *
 * A migração trocou **1.022** ocorrências por tokens semânticos, e os valores do
 * tema escuro são IDÊNTICOS aos hex antigos — de propósito: a substituição
 * precisava ser visualmente nula, senão seria mudança de design disfarçada de
 * refatoração.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const css = readFileSync("app/globals.css", "utf8");

test("os seis tokens existem, e no escuro valem exatamente os hex antigos", () => {
  // Se um valor mudasse, a refatoração teria alterado a aparência de centenas
  // de lugares — e ninguém saberia qual das 1.022 substituições causou.
  for (const [token, hex] of [
    ["--atlas-texto-forte", "#e8eef8"],
    ["--atlas-texto-medio", "#aab6ca"],
    /* `#6b7890` até 01/08/2026. Trocado por `#7a8799` por MEDIÇÃO, não por
       gosto: nos três fundos onde este token é usado (404 ocorrências) ele
       dava 3,95, 4,21 e 4,45 — os três abaixo do piso 4,5. O contrato existe
       para impedir mudança SILENCIOSA de valor; esta foi medida, tem motivo
       escrito e `contraste:check` a cobre nos dois temas. Congelar o número
       errado seria transformar o contrato em guardião do defeito. */
    ["--atlas-texto-fraco", "#7a8799"],
    ["--atlas-estado-perigo", "#fb7185"],
    ["--atlas-estado-atencao", "#f5b544"],
    ["--atlas-estado-sucesso", "#34d399"],
  ]) {
    assert.match(css, new RegExp(`${token}:\\s*${hex}`, "i"), `${token} precisa valer ${hex} no tema escuro`);
  }
});

test("o tema claro sobrescreve TODOS os seis — era o defeito original", () => {
  const claro = css.slice(css.lastIndexOf(':root[data-theme="light"] {'));
  for (const token of ["--atlas-texto-forte", "--atlas-texto-medio", "--atlas-texto-fraco",
                       "--atlas-estado-perigo", "--atlas-estado-atencao", "--atlas-estado-sucesso"]) {
    assert.ok(claro.includes(token), `${token} sem override no tema claro — o texto sumiria sobre fundo claro`);
  }
});

test("o tema claro NÃO repete os valores do escuro", () => {
  // Um override que copia o valor original não é override: é um token que
  // finge ser temático.
  const claro = css.slice(css.lastIndexOf(':root[data-theme="light"] {'));
  for (const hex of ["#e8eef8", "#aab6ca", "#7a8799"]) {
    assert.ok(!claro.includes(hex), `o tema claro repete ${hex} — não sobrescreve nada`);
  }
});

test("o portão de cor cravada existe e está registrado", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(pkg.scripts["cor-cravada:check"], "portão que ninguém chama não protege — esconde");
});

test("a contagem atual está dentro do teto", () => {
  // Executa o portão de verdade. Grep no fonte já sobreviveu a mutação nesta
  // base; o que vale é o comando rodando.
  const saida = execFileSync(process.execPath, ["scripts/check-cor-cravada.mjs"], { encoding: "utf8" });
  assert.match(saida, /nenhuma cor cravada nova|abaixo do teto/);
});
