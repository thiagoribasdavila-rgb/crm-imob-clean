/**
 * Contrato do PIPELINE: nenhum número grande sem base que o sustente.
 *
 * A base real desta operação expõe os três defeitos que este arquivo protege:
 *
 *   217 leads · 18 com orçamento (8%) · 205 na etapa "novo" (94%)
 *
 * 1. "Pipeline bruto" e "Forecast" somavam `budget_max` de 8% da carteira e
 *    eram lidos como o total. É o mesmo defeito do CPL do marketing, ao
 *    contrário: lá o zero fingia de medido; aqui a amostra finge de total.
 * 2. Toda coluna mostrava "R$ 0,00" quando ninguém preencheu orçamento — lê-se
 *    "esta etapa não vale nada" em vez de "o campo está vazio".
 * 3. A coluna "novo" desenhava 205 cards arrastáveis. A décima quinta lead já
 *    não é encontrada; a centésima não existe na prática.
 *
 * Rodar: node --test tests/contracts/pipeline-numeros-honestos.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const pagina = fs.readFileSync(path.join(raiz, "app", "(crm)", "pipeline", "page.tsx"), "utf8");

test("valor de pipeline exige cobertura mínima de orçamento", () => {
  assert.match(pagina, /COBERTURA_MINIMA_DE_ORCAMENTO\s*=\s*0\.4/,
    "sem piso declarado, uma amostra de 8% volta a virar total");
  assert.match(pagina, /const orcamentoConfiavel = cobertura >= COBERTURA_MINIMA_DE_ORCAMENTO/);
});

test("abaixo do piso, pipeline e forecast são null — não zero", () => {
  assert.match(pagina, /const pipeline = orcamentoConfiavel[\s\S]{0,160}: null;/,
    "R$ 0 diz que a carteira não vale nada; null vira '—' e a explicação vem junto");
  assert.match(pagina, /const forecast = orcamentoConfiavel[\s\S]{0,300}: null;/);
});

test("quando o número não sai, a tela diz o que falta preencher", () => {
  assert.match(pagina, /sem orçamento — some com a base atual seria chute/,
    "a ausência precisa virar tarefa, não mistério");
  assert.match(pagina, /sobre \$\{Math\.round\(metrics\.coberturaDeOrcamento \* 100\)\}% da carteira/,
    "quando sai, o número tem que declarar sobre quanto da carteira foi apurado");
});

test("a coluna não anuncia R$ 0,00 quando ninguém preencheu orçamento", () => {
  assert.match(pagina, /value: comOrcamento\.length[\s\S]{0,140}: null,/);
  assert.match(pagina, /orçamento não informado/,
    "'R$ 0,00' no topo da coluna lê como 'esta etapa não vale nada'");
});

test("a coluna desenha um número limitado de cards", () => {
  assert.match(pagina, /LIMITE_DE_CARDS_POR_COLUNA\s*=\s*25/);
  assert.match(pagina, /visiveis: items\.slice\(0, LIMITE_DE_CARDS_POR_COLUNA\)/);
  assert.match(pagina, /\{stage\.visiveis\.map\(\(lead\)/,
    "renderizar stage.items inteiro traz os 205 cards de volta");
  assert.ok(
    !/\{stage\.items\.map\(\(lead\)/.test(pagina),
    "sobrou um map sobre a lista completa",
  );
});

test("o corte é DECLARADO, com caminho para o resto", () => {
  // Coluna que desenha 25 de 205 sem avisar é pior que uma que desenha 205:
  // passa a impressão de que aquilo é tudo.
  assert.match(pagina, /stage\.ocultos > 0 \?/);
  assert.match(pagina, /\+\{stage\.ocultos\}/);
  assert.match(pagina, /Abrir a fila completa/);
  assert.match(pagina, /href=\{`\/leads\?status=\$\{encodeURIComponent\(stage\.key\)\}/,
    "o link tem que levar à etapa certa, não à lista genérica");
});

test("a ordenação por prioridade vem ANTES do corte", () => {
  // Cortar os 25 primeiros só é defensável se os 25 primeiros forem os mais
  // urgentes. Se o corte viesse antes da ordenação, seriam 25 aleatórios.
  const posOrdenacao = pagina.indexOf("const visibleLeads");
  const posCorte = pagina.indexOf("visiveis: items.slice");
  assert.ok(posOrdenacao > 0 && posOrdenacao < posCorte,
    "visibleLeads (já ordenado) precisa existir antes do fatiamento");
});

test("saiu a métrica que valia zero e não mudava decisão", () => {
  assert.ok(
    !/label="Perfis compradores"/.test(pagina),
    "comprou_outro vale 0 nesta base e a lista já aparece na seção própria — métrica que não muda decisão é ruído",
  );
  assert.match(pagina, /2xl:grid-cols-5/, "cinco métricas, não seis");
});
