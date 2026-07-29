/**
 * Contrato: RISCO DA DIRETORIA TEM DESTINO, E O DESTINO CONFERE.
 *
 * ── O DEFEITO QUE ISTO FIXA ──────────────────────────────────────────────────
 *
 * O bloco "Decisões que exigem a diretoria" é o único da central desenhado para
 * a decisão do diretor, e o texto que ele exibe já é imperativo: "Distribuir a
 * fila hoje — lead sem dono não recebe ligação". Todos os cinco riscos
 * apontavam para o mesmo lugar: "/reports" — 335 linhas sem um único link para
 * /leads, /pipeline ou /distribution. A pessoa lia a ordem, clicava, e tinha
 * que recomeçar a navegação pelo menu.
 *
 * O elo que faltava não era o link: era a lista saber ler a URL. Nenhuma tela
 * de app/(crm) usava parâmetro de endereço, então mesmo um href certo abriria
 * /leads com o último filtro salvo — mostrando um número diferente do que o
 * risco acabou de afirmar.
 *
 * ── A ARMADILHA ──────────────────────────────────────────────────────────────
 *
 * Link certo com predicado divergente é PIOR que link nenhum: a central afirma
 * 429 e a lista abre 443, e uma tela pega mentindo uma vez deixa de ser
 * consultada. Por isso os dois lados contam por coluna, e por isso existe
 * scripts/prova-numero-bate-com-o-clique.mjs — que compara os dois contra o
 * banco (442 = 442 = 442 na execução de 2026-07-28).
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

const central = ler("app", "(crm)", "command-center", "page.tsx");
const listaLeads = ler("app", "(crm)", "leads", "page.tsx");
const rotaLeads = ler("app", "api", "v1", "crm", "leads", "route.ts");
const rotaDiretoria = ler("app", "api", "v1", "analytics", "director-daily", "route.ts");

test("cada risco da diretoria tem seu próprio destino", () => {
  assert.match(central, /const DESTINO_DO_RISCO: Record<string, string> = \{/,
    "sem o mapa, todo risco volta a desembocar em /reports");
  assert.match(central, /href: DESTINO_DO_RISCO\[risk\.area\] \?\? "\/reports"/,
    "o destino precisa sair do mapa, com /reports só como último recurso");
  for (const area of ["Comercial", "Distribuição", "Execução", "Campanhas", "Governança"]) {
    assert.ok(central.includes(`${area.includes(" ") || /[^\w]/.test(area) ? `"${area}"` : area}:`)
      || central.includes(`${area}:`),
      `a área "${area}" precisa ter destino declarado`);
  }
});

test("os destinos usam vocabulário que a API realmente aceita", () => {
  // Link para um filtro que a rota recusa devolve lista vazia, e lista vazia
  // é lida como "não há trabalho" — o oposto do que o risco está dizendo.
  const filtrosNoMapa = [...central.matchAll(/\/leads\?attention=(\w+)/g)].map((m) => m[1]);
  assert.ok(filtrosNoMapa.length >= 2, "esperava ao menos dois destinos de lista filtrada");
  const permitidos = rotaLeads.match(/const allowedAttentionFilters = new Set\(\[([^\]]+)\]\)/)?.[1] ?? "";
  for (const filtro of filtrosNoMapa) {
    assert.ok(permitidos.includes(`"${filtro}"`),
      `o destino usa attention=${filtro}, que a rota de leads não aceita`);
  }
});

test("a lista de leads lê a URL, e a URL vence o que estava salvo", () => {
  assert.match(listaLeads, /new URLSearchParams\(window\.location\.search\)/,
    "sem ler a URL o link é decorativo: a lista abre com o último filtro salvo");
  const posSessionStorage = listaLeads.indexOf("sessionStorage.getItem(FILTER_STORAGE_KEY)");
  const posUrl = listaLeads.indexOf("new URLSearchParams(window.location.search)");
  assert.ok(posSessionStorage !== -1 && posUrl > posSessionStorage,
    "a leitura da URL precisa vir DEPOIS da restauração salva — quem vem depois vence");
  assert.match(listaLeads, /setFiltersOpen\(true\)/,
    "chegando por link filtrado, o painel abre: filtro invisível faz a base parecer que encolheu");
});

test("parâmetro inventado na URL não vira filtro silencioso", () => {
  assert.match(listaLeads, /const ATTENTION_VALIDOS = \[/,
    "a tela precisa ter a lista fechada de valores aceitos");
  assert.match(listaLeads, /valor && \(validos as readonly string\[\]\)\.includes\(valor\)/,
    "valor fora da lista tem que ser descartado, não repassado à API");
});

test("a diretoria conta primeiro contato pela mesma coluna que o filtro", () => {
  assert.match(rotaDiretoria, /activeLeads\.filter\(\(lead\) => !lead\.first_contacted_at\)\.length/,
    "contar por etapa (status novo há 15 min) dava 429 contra os 443 da coluna");
  assert.doesNotMatch(rotaDiretoria, /firstContactOverdue = activeLeads\.filter\(\(lead\) => normalize\(lead\.status\) === "novo"/,
    "o predicado por etapa não pode voltar: é ele que desmente o clique");
  assert.match(rotaDiretoria, /first_contacted_at/,
    "a coluna precisa estar no select, senão o número sai nulo para sempre");
});

test("o filtro por coluna não é aplicado em base que não tem a coluna", () => {
  assert.match(rotaLeads, /attention === "never_contacted" && comSla/,
    'devolver a base inteira sob o rótulo "nunca contatados" seria pior que recusar');
});
