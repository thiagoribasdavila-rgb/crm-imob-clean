/**
 * Contrato da PRONTIDÃO DA AQUISIÇÃO na central.
 *
 * ── O QUE ISTO TORNA VISÍVEL ─────────────────────────────────────────────────
 *
 * O fato mais caro da empresa em 2026-07-28 não existia em tela nenhuma: as 4
 * campanhas ATIVAS publicam numa Página que o CRM não conhece, e o teto de
 * gasto está esgotado (R$ 5.271 de R$ 5.271). Isso só aparecia se alguém
 * rodasse `scripts/meta-prontidao-campanhas.mjs` no terminal.
 *
 * Enquanto isso o painel de Marketing mostrava CPL "—" com "Custo não medido",
 * indistinguível de "ainda não gastamos" — e o diretor supunha que leads novas
 * entrariam por cima das 469 paradas. Não entra nenhuma.
 *
 * ── A ARMADILHA QUE ESTE CONTRATO GUARDA ─────────────────────────────────────
 *
 * Leitura que falha não pode virar verde nem sumir. É a classe de defeito que
 * este repositório já pagou várias vezes: ausência não declarada é
 * indistinguível de zero. Aqui ela seria pior que em qualquer outro lugar —
 * "nenhum bloqueio" lido como "pode recarregar a verba" custa dinheiro real,
 * porque a lead comprada cai em meta_leads_sem_destino e a tela fica verde.
 *
 * Prova viva contra a Graph API: scripts/prova-prontidao-na-central.mjs (8/8 em
 * 2026-07-28 — teto, esgotamento, 19 anúncios e a página desconhecida batendo
 * com o que o terminal já dizia).
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

const lib = ler("lib", "meta", "marketing", "campaign-readiness.ts");
const rota = ler("app", "api", "v1", "analytics", "campaign-quality", "route.ts");
const central = ler("app", "(crm)", "command-center", "page.tsx");

test("falha de leitura vira 'não medido', nunca ausência e nunca verde", () => {
  assert.match(lib, /return \{ medido: false, motivo: bruto\.motivo, lidoEm: agora\(\) \}/,
    "a Graph fora do ar precisa produzir um estado declarado, não um objeto vazio");
  assert.match(lib, /if \(!input\.token \|\| !input\.contaId\)/,
    "sem credencial também é 'não medido' — não é 'tudo certo'");
  assert.match(central, /Prontidão das campanhas não medida/,
    "e a tela precisa DIZER isso: um estado que ninguém renderiza é igual a não existir");
});

test("erro nunca entra no cache", () => {
  assert.match(lib, /isCacheable: \(valor\) => !valor\.falhou/,
    "cachear a falha congelaria 'não medido' por 10 minutos depois da Meta voltar");
});

test("a leitura é só leitura", () => {
  // Uma lib de diagnóstico que escreve na Meta é uma lib que pode gastar
  // dinheiro por engano. O único método permitido é GET.
  assert.doesNotMatch(lib, /method:\s*["'](POST|DELETE|PUT|PATCH)["']/,
    "nenhuma escrita na Graph: esta lib diagnostica, não opera");
});

/**
 * A varredura do criativo e a detecção de página desconhecida NÃO são
 * testadas aqui por grep — elas vivem em `prontidao-derivada.test.mjs`, que
 * EXECUTA a derivação. A versão por grep deste arquivo foi o ponto cego que a
 * mutação M27 encontrou: com o `if` trocado por `if (false)`, a string
 * continuava no arquivo e a suíte ficava verde. Foi por isso que a derivação
 * saiu deste módulo (que tem `server-only` e não pode ser importado por teste)
 * para um módulo puro.
 */
test("a derivação mora onde pode ser exercitada", () => {
  assert.match(lib, /from "@\/lib\/meta\/marketing\/prontidao-derivada"/,
    "a regra precisa continuar fora do server-only, senão volta a só poder ser grepada");
  assert.match(lib, /return derivarProntidao\(\{/,
    "a lib de rede delega a decisão; ela não decide sozinha");
});

test("viaja numa resposta que a diretoria já busca, sem chamada nova", () => {
  assert.match(rota, /lerProntidaoDeAquisicao\(\{/,
    "a prontidão precisa nascer dentro de campaign-quality");
  assert.match(rota, /readiness,/,
    "e ser publicada no payload");
  const fetchesNaCentral = [...central.matchAll(/fetch\("\/api\//g)].length;
  assert.ok(fetchesNaCentral <= 12,
    `a central faz ${fetchesNaCentral} chamadas; a prontidão não pode ter somado mais uma`);
});

test("o bloqueio entra na fila de exceção que o diretor já lê", () => {
  assert.match(central, /const bloqueios = readiness\?\.medido/,
    "cartão novo ao lado dos outros treina o olho a passar batido");
  assert.match(central, /items: \[\.\.\.bloqueios, \.\.\.riscos\]/,
    "os bloqueios vêm antes: eles decidem se os outros riscos se resolvem com o que já existe");
  assert.match(central, /const DESTINO_DO_BLOQUEIO: Record<string, string>/,
    "cada bloqueio precisa de destino próprio, senão vira mais um número sem porta");
  assert.match(central, /DESTINO_DO_BLOQUEIO\[bloqueio\.codigo\]/,
    "chaveado pelo código, não pelo texto — o resumo carrega números que mudam");
});
