/**
 * Contrato do PISO DE CARTEIRA na listagem de leads.
 *
 * ── O DEFEITO QUE ISTO FIXA ──────────────────────────────────────────────────
 *
 * Medido em 2026-07-28 com um corretor descartável de ZERO leads: a rota
 * `GET /api/v1/crm/leads` devolvia as 200 leads da imobiliária. O filtro de
 * dono só existia quando o CLIENTE pedia (`assigned_to`/`team_owner`) — quem
 * não pedisse via a carteira inteira dos colegas.
 *
 * O Kanban (`GET /api/v1/pipeline`) já tinha o piso desde a correção anterior.
 * Duas telas do MESMO dado com regras opostas é a divergência que atravessou
 * esta sessão inteira; aqui ela não confundia, vazava.
 *
 * Prova comportamental viva: scripts/prova-fronteira-do-corretor.mjs — corretor
 * sem leads recebe 0, com 2 leads recebe exatamente 2, liderança recebe 200.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

const rotaLeads = ler("app", "api", "v1", "crm", "leads", "route.ts");
const rotaPipeline = ler("app", "api", "v1", "pipeline", "route.ts");

test("a listagem aplica piso de carteira sem o cliente pedir", () => {
  assert.match(rotaLeads, /const soAMinhaCarteira =/,
    "o piso precisa existir independentemente dos filtros da URL");
  assert.match(rotaLeads, /else if \(soAMinhaCarteira\) \{/,
    "o piso entra na cadeia de filtros de dono, como último recurso");
  assert.match(rotaLeads, /filtroDaMinhaCarteira\(access\.access\.user\.id\)/,
    "o filtro de posse vem do módulo compartilhado");
});

test("lead sem dono continua visível para todos", () => {
  // Escondê-la de quem não é liderança a deixaria parada até alguém abrir um
  // relatório: ela precisa ser vista para ser adotada.
  const modulo = ler("lib", "crm", "escopo-de-leitura.ts");
  assert.match(modulo, /and\(assigned_user_id\.is\.null,assigned_to\.is\.null\)/);
  assert.match(modulo, /assigned_user_id\.eq\.\$\{userId\},assigned_to\.eq\.\$\{userId\}/,
    "as DUAS colunas de posse — a base tem histórico nos dois lados");
});

test("liderança NÃO perde a visão do todo", () => {
  // Um piso bom demais quebra a gestão em silêncio — e silêncio aqui significa
  // um gestor achando que a operação encolheu.
  const modulo = ler("lib", "crm", "escopo-de-leitura.ts");
  assert.match(modulo, /"director", "superintendent", "manager", "admin"/);
  assert.match(modulo, /input\.role === "admin"/,
    "admin sem papel comercial definido continua sendo liderança");
});

test("existe UMA definição de quem vê o funil inteiro", () => {
  // A primeira versão deste teste comparava o TEXTO do conjunto nas duas
  // rotas — e reprovou por ordem diferente dos mesmos papéis. O susto foi
  // útil: enquanto forem duas cópias, elas PODEM divergir de verdade, e um
  // contrato só detecta depois do estrago. A regra virou módulo único.
  const modulo = ler("lib", "crm", "escopo-de-leitura.ts");
  assert.match(modulo, /VE_O_FUNIL_INTEIRO = new Set\(\["director", "superintendent", "manager", "admin"\]\)/);
  assert.match(modulo, /export function leLiderancaInteira/);
  assert.match(modulo, /export function filtroDaMinhaCarteira/);

  // E as duas rotas CONSOMEM o módulo, em vez de reimplementar.
  for (const [nome, codigo] of [["listagem", rotaLeads], ["Kanban", rotaPipeline]]) {
    assert.match(codigo, /from "@\/lib\/crm\/escopo-de-leitura"/, `${nome} precisa importar a regra`);
    assert.ok(!/new Set\(\["director"/.test(codigo),
      `${nome} voltou a ter cópia própria do conjunto de papéis`);
  }
  assert.match(rotaLeads, /leSoAPropriaCarteira\(access\.access\.profile\)/);
  assert.match(rotaPipeline, /leLiderancaInteira\(identity\)/);
});

test("a resposta declara o recorte que aplicou", () => {
  // Sem isto a tela diz "todos os leads" mostrando parte deles — e ausência
  // não declarada é indistinguível de zero, o defeito que mais se repetiu aqui.
  assert.match(rotaLeads, /escopo: soAMinhaCarteira \? "carteira" : "organizacao"/);
});
