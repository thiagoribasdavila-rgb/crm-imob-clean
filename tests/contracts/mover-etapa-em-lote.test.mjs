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

/** Sem comentários: eles CITAM as etapas proibidas ao explicar a proibição. */
const rotaSemComentarios = rota.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

test("fechar lead NÃO pode ser feito em massa", () => {
  // `ganho` e `perdido` disparam evento de conversão para a Meta. Marcar 50
  // vendas por engano ensina o algoritmo a caçar o público errado, e não há
  // desfazer: o aprendizado já aconteceu.
  assert.match(rota, /const ETAPAS_EM_LOTE = new Set\(\["novo", "contato", "qualificacao", "visita", "proposta", "contrato"\]\)/);
  assert.ok(!/ETAPAS_EM_LOTE[^)]*"ganho"/.test(rotaSemComentarios));
  assert.ok(!/ETAPAS_EM_LOTE[^)]*"perdido"/.test(rotaSemComentarios));
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

test("o corretor move em lote — mas só a própria carteira", () => {
  // A versão anterior deste teste fixava o lote como ato exclusivo de
  // liderança, herdado do bulk-transfer. Confundia dois atos: TRANSFERIR muda
  // o dono (alçada de carteira), MOVER DE ETAPA é o trabalho diário de quem
  // atende — e quem tem 174 leads em "novo" é o corretor, não o gestor.
  //
  // O que ESTE contrato protege agora são as duas fronteiras que tornam a
  // liberação segura:
  assert.match(rota, /roles: \["admin", "director", "superintendent", "manager", "broker"\]/);
  // 1) o dono entra no WHERE do update (não em checagem prévia — corrida):
  //    lote de corretor só alcança lead da carteira dele;
  assert.match(rota, /soAsMinhas/);
  assert.match(rota, /assigned_user_id\.eq\.\$\{dono\},assigned_to\.eq\.\$\{dono\}/,
    "o filtro de dono cobre as DUAS colunas de posse — filtrar uma só vaza a outra");
  // 2) papel COMERCIAL decide, com o role de acesso como reserva — a mesma
  //    precedência do resto do CRM (commercialRole ?? role).
  assert.match(rota, /access\.profile\.commercialRole \|\| access\.access\.profile\.role/);
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
  //
  // A versão anterior proibia as colunas de dono em QUALQUER posição — e o
  // filtro de carteira do corretor precisa LÊ-las no WHERE. O invariante real
  // sempre foi sobre o que a ação ESCREVE: o payload do update muda etapa e
  // carimbo, e nada mais. Dono no filtro restringe; dono no payload transfere.
  assert.match(rotaSemComentarios, /\.update\(\{ status: stage, updated_at: agora \}\)/,
    "o payload é exatamente etapa + carimbo — qualquer campo a mais é uma segunda ação");
  assert.ok(!/metadata/.test(rotaSemComentarios), "consentimento e formulário ficam intocados");
  assert.equal([...rotaSemComentarios.matchAll(/\.update\(/g)].length, 1);
});

test("a tela dá o lote ao corretor sem lhe dar a transferência", () => {
  // A API liberada de nada valia: a barra de seleção inteira (caixas + seletor
  // de etapa) estava atrás de `canTransfer`, e o corretor não via nem as
  // caixas. As capacidades agora são distintas — e este contrato impede que
  // uma volte a engolir a outra.
  assert.match(tela, /const podeMoverEmLote = canTransfer \|\| currentRole === "broker"/,
    "selecionar e mover etapa é de todos; a rota prende o corretor à carteira dele");
  assert.match(tela, /\{podeMoverEmLote && selected\.size \? \(/,
    "a barra abre para quem pode mover, não só para quem pode transferir");
  // E a transferência NÃO acompanha: o bloco do alvo/motivo/confirmar
  // permanece atrás de canTransfer dentro da barra.
  const barra = tela.slice(tela.indexOf("podeMoverEmLote && selected.size"), tela.indexOf("Cancelar"));
  assert.match(barra, /\{canTransfer \? \(<>/,
    "o corretor recebe só a metade de mover etapa — transferir segue sendo alçada de carteira");
});
