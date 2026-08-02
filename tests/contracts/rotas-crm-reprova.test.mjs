/**
 * PROVA DE QUE A CLASSIFICAÇÃO DE ROTAS REPROVA — fase 021, reapontada 02/08/2026.
 *
 * O que a fase 021 chamava de "Todas as rotas CRM foram classificadas" era
 * `inventory.counts.crmRoutes === config.topology.crmRoutes && === 139`: dois
 * totais comparados entre si. E "Buckets fecham o inventário" somava cinco
 * campos do config para comparar com um sexto campo do MESMO config — o
 * boletim conferindo a si mesmo, sem o disco entrar na conta.
 *
 * A propriedade que entrou no lugar tem de poder acender vermelho, e é isso
 * que se prova aqui: rota órfã, balde vazando e família inventada.
 *
 * Também se prova o contrário — que a árvore REAL de rotas passa. Uma regra
 * que reprova tudo é tão inútil quanto uma que aprova tudo, e este repositório
 * já produziu as duas.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { classificarRotasCrm, familiaDaRota } from "../../scripts/lib/rotas-crm.mjs";

const CANONICAS = ["/leads", "/pipeline", "/marketing", "/settings"];

test("a árvore real de rotas passa: zero órfã, zero duplicada, baldes fechados", () => {
  const inventario = JSON.parse(
    execFileSync(process.execPath, ["scripts/inventory-navigation-architecture.mjs"], { encoding: "utf8" }),
  );
  assert.deepEqual(inventario.orphanRoutes, [], "rota sem família no produto vivo");
  assert.deepEqual(inventario.duplicatedRouteBuckets, []);
  assert.equal(inventario.bucketsCloseOnMeasuredTotal, true);
  assert.equal(inventario.routes.length, inventario.counts.crmRoutes);
});

test("rota profunda sem família é ÓRFÃ — o defeito que nenhum total pegava", () => {
  /* Uma página em `app/(crm)/relatorios-novos/detalhe/page.tsx` sem
     `/relatorios-novos` no catálogo nem entre as superfícies de topo é uma
     tela que só existe para quem digitar a URL. Com o total congelado em 139,
     bastava outra rota ter saído no mesmo commit para o portão nem piscar. */
  const saudavel = classificarRotasCrm(["/", "/leads", "/leads/import", "/marketing"], CANONICAS);
  assert.deepEqual(saudavel.orfas, []);

  const comOrfa = classificarRotasCrm(
    ["/", "/leads", "/relatorios-novos/detalhe", "/marketing"],
    CANONICAS,
  );
  assert.deepEqual(comOrfa.orfas, ["/relatorios-novos/detalhe"]);
  assert.equal(comOrfa.fecha, true, "o total continua fechando — é por isso que o total não bastava");
});

test("rota dinâmica sob família inexistente também é órfã", () => {
  const r = classificarRotasCrm(["/", "/leads", "/relatorios-novos/[id]"], CANONICAS);
  assert.deepEqual(r.orfas, ["/relatorios-novos/[id]"]);
});

test("acrescentar sub-página numa família que existe NÃO é defeito", () => {
  /* Causa medida do vermelho de 02/08/2026:
     `app/(crm)/marketing/campanhas-criativos-proposta/page.tsx`, sub-página de
     `/marketing`. Caso normal. O portão parava tudo sem conseguir dizer o quê. */
  const r = classificarRotasCrm(
    ["/", "/leads", "/marketing", "/marketing/campanhas-criativos-proposta"],
    CANONICAS,
  );
  assert.deepEqual(r.orfas, []);
  assert.equal(r.baldes.apoio.length, 1);
  assert.equal(r.fecha, true);
});

test("os baldes particionam: cada rota em exatamente um, e a soma é o total MEDIDO", () => {
  const rotas = ["/", "/leads", "/leads/[id]", "/leads/import", "/kanban", "/marketing"];
  const r = classificarRotasCrm(rotas, CANONICAS);
  const somaDosBaldes = Object.values(r.baldes).flat();
  assert.equal(somaDosBaldes.length, rotas.length);
  assert.deepEqual([...somaDosBaldes].sort(), [...rotas].sort());
  assert.deepEqual(r.duplicadas, []);
  assert.equal(r.fecha, true);

  /* Rota repetida na entrada: o total mente e a partição denuncia. */
  const repetida = classificarRotasCrm([...rotas, "/leads"], CANONICAS);
  assert.deepEqual(repetida.duplicadas, ["/leads"]);
  assert.equal(repetida.fecha, false);
});

test("um destino canônico é canônico, e nunca cai no balde de apoio", () => {
  const r = classificarRotasCrm(["/leads/import", "/leads/nightly-handoffs"], ["/leads/import"]);
  assert.deepEqual(r.baldes.canonicas, ["/leads/import"]);
  assert.deepEqual(r.baldes.apoio, ["/leads/nightly-handoffs"]);
});

test("família ignora convenção de arquivo do App Router — e o erro que eu cometi", () => {
  /* Slot paralelo e interceptação não são segmentos de URL. Na primeira versão
     eu descartava o segmento INTEIRO quando ele tinha parênteses, e `(.)leads`
     não casa com `^\(.*\)$` — a lâmina da ficha do lead virou órfã de uma
     família `/(.)leads` que nunca existiu. A asserção teria acusado um defeito
     inventado, que é o outro modo de falhar de um portão. */
  assert.equal(familiaDaRota("/@ficha/(.)leads/[id]"), "/leads");
  assert.equal(familiaDaRota("/(crm)/pipeline/discards"), "/pipeline");
  assert.equal(familiaDaRota("/marketing/campanhas-criativos-proposta"), "/marketing");
  assert.equal(familiaDaRota("/"), "/");

  const r = classificarRotasCrm(["/leads", "/@ficha/(.)leads/[id]"], ["/leads"]);
  assert.deepEqual(r.orfas, []);
});

test("superfície de topo declarada também serve de família", () => {
  /* `/kanban` não está no catálogo canônico — é superfície de topo. Uma
     sub-página dela não é órfã. */
  const r = classificarRotasCrm(["/kanban", "/kanban/arquivadas"], CANONICAS);
  assert.deepEqual(r.baldes.topo, ["/kanban"]);
  assert.deepEqual(r.orfas, []);
});
