/**
 * Contrato de USABILIDADE do Kanban.
 *
 * Três defeitos que não quebram teste nenhum e mesmo assim fazem o corretor
 * desistir da tela. Ficam fixados aqui porque são fáceis de reintroduzir: nada
 * no build reclama de uma mensagem genérica ou de um `window.prompt`.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const pagina = fs.readFileSync(path.join(raiz, "app", "(crm)", "pipeline", "page.tsx"), "utf8");
/** Sem comentários: eles CITAM os defeitos para explicar por que sumiram. */
const codigo = pagina.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("a mensagem do servidor chega ao corretor", () => {
  // A rota explica exatamente o que faltou: motivo fora da taxonomia, lead já
  // movida por outra pessoa, confirmação humana pendente. Trocar tudo por uma
  // frase única obrigava a adivinhar — e adivinhar errado é abandonar a lead.
  //
  // A REGRA vive em `extrairRecusa` e é exercitada de verdade em
  // pipeline-caminho-de-volta.test.mjs. Aqui resta o que é da página: que ela
  // use a função e propague o erro que voltou dela.
  assert.match(codigo, /const recusa = extrairRecusa\(payload\);/);
  assert.match(codigo, /throw new Error\(recusa\.erro\)/,
    "o erro mostrado tem que ser o que a rota disse, não uma frase fixa da tela");
});

test("resposta sem JSON não vira erro mudo", () => {
  // Um 502 do proxy devolve HTML. Sem o catch, `.json()` estoura e o corretor
  // vê a exceção do parser no lugar do que aconteceu.
  assert.match(codigo, /response\.json\(\)\.catch\(/);
});

test("nenhuma caixa nativa do navegador pede texto", () => {
  // `window.prompt` pode ser bloqueado pelo navegador — e aí a etapa não
  // acontece, sem explicação. Fora que jogava o texto fora ao validar.
  assert.ok(!/window\.(prompt|confirm|alert)\s*\(/.test(codigo),
    "diálogo nativo ao lado de um painel desenhado: use o painel");
});

test("'comprou em outro lugar' pergunta num painel, como o descarte", () => {
  assert.match(codigo, /setFollowUpDraft\(\{ leadId: id/);
  assert.match(codigo, /aria-labelledby="followup-panel-title"/);
  assert.match(codigo, /<textarea/, "é texto livre de várias linhas, não um campo de uma linha");
});

test("os dois painéis fecham com Escape e por fora", () => {
  // Painel que só fecha no botão prende quem abriu por engano.
  const escapes = codigo.match(/event\.key === "Escape"/g) ?? [];
  assert.ok(escapes.length >= 2, `esperado Escape nos dois painéis, achei ${escapes.length}`);
  assert.match(codigo, /onClick=\{\(\) => setFollowUpDraft\(null\)\}/);
});

test("o botão diz quanto falta em vez de só ficar apagado", () => {
  // Botão desabilitado sem explicação é a versão silenciosa do bloqueio: o
  // corretor não sabe se é bug ou regra.
  assert.match(codigo, /Faltam \$\{10 - followUpDraft\.description\.trim\(\)\.length\} caractere/);
  assert.match(codigo, /disabled=\{followUpDraft\.description\.trim\(\)\.length < 10/);
});

test("cancelar não move a lead", () => {
  // Vale para os dois painéis: a lead só muda de coluna depois de confirmada.
  assert.match(codigo, /if \(stage === "comprou_outro" && !reversalOf && !followUp\) \{[\s\S]{0,320}?return;/);
  assert.match(codigo, /if \(stage === "perdido" && !reversalOf && !discard\) \{[\s\S]{0,320}?return;/);
});

test("o mínimo da tela é o mesmo mínimo da rota", () => {
  // Divergir aqui devolve a lead de coluna depois de o corretor ter escrito.
  const rota = fs.readFileSync(path.join(raiz, "app", "api", "v1", "pipeline", "route.ts"), "utf8");
  assert.match(rota, /stage === "comprou_outro" && followUpDescription\.length < 10/);
  assert.match(codigo, /followUpDraft\.description\.trim\(\)\.length < 10/);
});

test("o desfazer procura o movimento nas DUAS tabelas", () => {
  // A RPC grava em `pipeline_stage_moves`; o caminho compensatório, em
  // `pipeline_history`. A trava olhava só a segunda — e como a primeira é a que
  // roda, o desfazer devolvia 409 sempre. O botão aparecia e nunca funcionava.
  const rota = fs.readFileSync(path.join(raiz, "app", "api", "v1", "pipeline", "route.ts"), "utf8");
  const guarda = rota.slice(rota.indexOf("if (reversalOf) {"), rota.indexOf("PIPELINE_STAGE_CONFLICT", rota.indexOf("if (reversalOf) {")));
  assert.match(guarda, /from\("pipeline_stage_moves"\)/, "a tabela do caminho atômico");
  assert.match(guarda, /from\("pipeline_history"\)/, "a tabela do caminho compensatório");
  // Cada tabela tem seu par de colunas; trocar um pelo outro devolve undefined
  // e derruba o desfazer de novo, silenciosamente.
  assert.match(guarda, /from_stage[\s\S]{0,40}to_stage/, "colunas de pipeline_stage_moves");
  assert.match(guarda, /old_status[\s\S]{0,40}new_status/, "colunas de pipeline_history");
});

test("desfazer um desfazer é barrado", () => {
  // Sem isso, o par de movimentos vira vaivém e o histórico deixa de contar o
  // que aconteceu de fato com a lead.
  const rota = fs.readFileSync(path.join(raiz, "app", "api", "v1", "pipeline", "route.ts"), "utf8");
  assert.match(rota, /jaDesfeito/);
});

test("o desfazer aceita as duas chaves que a rota pode mandar", () => {
  // A rota tem dois caminhos (atômico e compensatório) e eles devolvem chaves
  // diferentes. Ler só uma fazia a lead mover sem a tela confirmar nada.
  assert.match(codigo, /payload\.move\?\.id \?\? payload\.move\?\.moveId \?\? payload\.moveId/);
});
