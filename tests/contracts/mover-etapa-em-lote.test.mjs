/**
 * Contrato de MOVER ETAPA EM LOTE.
 *
 * As 174 leads do Inside não estão em "novo" porque ninguém as trabalhou —
 * estão porque o CRM nunca soube. O histórico vive fora dele, e o corretor vem
 * trazer isso para dentro.
 *
 * Uma a uma seriam 174 telas abertas. O que se perde aí não é tempo: é a
 * vontade de manter o CRM em dia, que não volta depois que se perde.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");
const rota = ler("app", "api", "v1", "crm", "leads", "bulk-stage", "route.ts");
const tela = ler("app", "(crm)", "leads", "page.tsx");

test("fechar lead NÃO pode ser feito em massa", () => {
  // `ganho` e `perdido` disparam evento de conversão para a Meta. Marcar 50
  // vendas por engano ensina o algoritmo a caçar o público errado, e não há
  // desfazer: o aprendizado já aconteceu.
  assert.match(rota, /const ETAPAS_EM_LOTE = new Set\(\["novo", "contato", "qualificacao", "visita", "proposta", "contrato"\]\)/);
  assert.ok(!/ETAPAS_EM_LOTE[^)]*"ganho"/.test(rota));
  assert.ok(!/ETAPAS_EM_LOTE[^)]*"perdido"/.test(rota));
  assert.match(rota, /STAGE_NOT_BULKABLE/);
  assert.match(rota, /não tem desfazer/);
});

test("a tela também não oferece fechar em massa", () => {
  const seletor = tela.slice(tela.indexOf('Mover para etapa'), tela.indexOf("Mover {selected.size}"));
  for (const proibida of ["ganho", "perdido"]) {
    assert.ok(!new RegExp(`value="${proibida}"`).test(seletor),
      `"${proibida}" não pode aparecer no seletor de lote`);
  }
});

test("a organização entra no WHERE, não só na leitura", () => {
  // Sem isso, um id de outra organização passaria batido no meio de 200.
  assert.match(rota, /\.in\("id", leadIds\)\s*\n\s*\.eq\("organization_id", organizationId\)/);
});

test("o que NÃO moveu é declarado", () => {
  // Silenciar a diferença faria o operador achar que foram todas e descobrir
  // na semana seguinte.
  assert.match(rota, /const naoMovidas = leadIds\.filter/);
  assert.match(rota, /aviso: naoMovidas\.length/);
  assert.match(tela, /payload\.data\?\.aviso/);
});

test("existe teto por chamada", () => {
  assert.match(rota, /const MAXIMO = 200;/);
  assert.match(rota, /TOO_MANY/);
  assert.match(rota, /divida a seleção e confira o que está movendo/);
});

test("mexer em várias leads é ato de quem responde pela carteira", () => {
  assert.match(rota, /roles: \["admin", "director", "superintendent", "manager"\]/);
});

test("a etapa passa pelo vocabulário canônico", () => {
  // Aceitar string crua deixaria "Visita", "visita " e "VISITA" virarem três
  // etapas diferentes no banco.
  assert.match(rota, /canonicalPipelineStage\(body\.stage\)/);
  assert.match(rota, /STAGE_INVALID/);
});

test("a ação em lote faz UMA coisa", () => {
  // Uma ação em lote que mexe em dono, tarefa e consentimento junto é uma ação
  // que ninguém consegue prever.
  const codigo = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
  assert.ok(!/assigned_to|assigned_user_id|metadata/.test(codigo));
  assert.equal([...codigo.matchAll(/\.update\(/g)].length, 1);
});
