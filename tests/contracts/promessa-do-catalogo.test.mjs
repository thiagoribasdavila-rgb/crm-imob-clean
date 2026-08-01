/**
 * Contrato: O CATÁLOGO PROMETE, A TELA CUMPRE.
 *
 * ── O DEFEITO QUE ISTO FIXA ──────────────────────────────────────────────────
 *
 * `lib/atlas/navigation.ts` declara uma ação primária por destino, cada uma com
 * o resultado comercial que deve produzir. Nove carregam parâmetro na URL.
 * Medido em 2026-07-29: as NOVE telas de destino ignoravam o parâmetro. A
 * pessoa clicava em "Nova tarefa" e chegava em /tasks com nada aberto; clicava
 * em "Abrir fila sem responsável" e via a fila inteira.
 *
 * Promessa decorativa é pior que promessa nenhuma: o botão ensina que aquele
 * caminho não funciona, e depois disso nem o que funciona é usado. E nada disso
 * aparecia em teste, porque a tela ABRIA — só não fazia o que o botão dizia.
 *
 * ── O QUE ESTE CONTRATO GUARDA ───────────────────────────────────────────────
 *
 * Ele não confere pixel: confere que TODA promessa com parâmetro tem, na tela
 * de destino, alguém que lê a intenção pelo módulo compartilhado. É a fiação —
 * a mesma que faltou em `firstContactOverdue`, que era calculado, tipado,
 * devolvido pela API e nunca desenhado.
 *
 * Se alguém acrescentar um destino novo com parâmetro e esquecer a tela, isto
 * acusa antes de a promessa chegar a um corretor.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import {
  lerIntencaoDaUrl,
  pedeCriar,
  alvoDaIntencao,
} from "../../lib/atlas/intencao-da-url.ts";
import { ehVinculoValido } from "../../lib/crm/vinculo-do-cliente.ts";

const raiz = path.resolve(import.meta.dirname, "..", "..");
const ler = (...p) => fs.readFileSync(path.join(raiz, ...p), "utf8");

/**
 * OS CATÁLOGOS SÃO EXECUTADOS, NÃO GREPADOS.
 *
 * `lib/atlas/core-v2/page-registry.ts` importa `./page-contract` e
 * `../navigation` sem extensão — o resolvedor de ESM do Node recusa isso, então
 * `import()` direto não funciona. Em vez de desistir e conferir por expressão
 * regular, o módulo é transpilado para CommonJS e ligado à mão: assim o
 * contrato compara OBJETOS reais. Um catálogo que ainda compila mas monta o
 * href errado passaria batido por qualquer regex — foi exatamente assim que
 * `/pipeline` ficou sem `?focus=priority` em um dos três lugares.
 */
const modulosCarregados = new Map();

function carregar(...partes) {
  const alvo = path.join(raiz, ...partes);
  const arquivo = fs.existsSync(alvo) ? alvo : `${alvo}.ts`;
  if (modulosCarregados.has(arquivo)) return modulosCarregados.get(arquivo);

  const saida = ts.transpileModule(fs.readFileSync(arquivo, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modulo = { exports: {} };
  // Registrado ANTES de executar: se um dia houver ciclo, ele encontra um
  // objeto parcial em vez de recarregar para sempre.
  modulosCarregados.set(arquivo, modulo.exports);
  const requerer = (especificador) =>
    carregar(path.relative(raiz, path.resolve(path.dirname(arquivo), especificador)));
  new Function("exports", "module", "require", saida)(modulo.exports, modulo, requerer);
  modulosCarregados.set(arquivo, modulo.exports);
  return modulo.exports;
}

// ── A REGRA, EXECUTADA ──────────────────────────────────────────────────────

test("cada chave conhecida vira a intenção certa", () => {
  assert.deepEqual(lerIntencaoDaUrl("?create=1"), { tipo: "criar" });
  assert.deepEqual(lerIntencaoDaUrl("?focus=priority"), { tipo: "focar", alvo: "priority" });
  assert.deepEqual(lerIntencaoDaUrl("?view=forecast"), { tipo: "visao", alvo: "forecast" });
  assert.deepEqual(lerIntencaoDaUrl("?queue=unassigned"), { tipo: "fila", alvo: "unassigned" });
});

test("chave inventada não vira comportamento", () => {
  // Parâmetro que a navegação não promete não pode mudar a tela: uma superfície
  // que reage a qualquer coisa é uma superfície que ninguém consegue auditar.
  assert.equal(lerIntencaoDaUrl("?xpto=1"), null);
  assert.equal(lerIntencaoDaUrl("?create=9"), null, "create só vale com 1");
  assert.equal(lerIntencaoDaUrl(""), null, "abrir pelo menu é o caso normal, não erro");
});

test("URL malformada não impede a tela de carregar", () => {
  assert.equal(lerIntencaoDaUrl("%%%"), null);
});

test("os auxiliares não confundem os tipos", () => {
  assert.equal(pedeCriar(lerIntencaoDaUrl("?create=1")), true);
  assert.equal(pedeCriar(lerIntencaoDaUrl("?view=forecast")), false);
  assert.equal(alvoDaIntencao(lerIntencaoDaUrl("?view=forecast"), "visao"), "forecast");
  assert.equal(alvoDaIntencao(lerIntencaoDaUrl("?view=forecast"), "fila"), null,
    "pedir o alvo do tipo errado devolve null, não o valor de outro tipo");
});

// ── A FIAÇÃO: toda promessa com parâmetro tem quem a cumpra ──────────────────

test("toda ação primária com parâmetro tem tela que lê a intenção", () => {
  const navegacao = ler("lib", "atlas", "navigation.ts");
  const promessas = [...navegacao.matchAll(/primaryAction: \{ label: "[^"]+", href: "(\/[a-z-]+)\?([^"]+)"/g)]
    .map((achado) => ({ rota: achado[1], parametro: achado[2] }));

  assert.ok(promessas.length >= 8,
    `esperava ao menos 8 promessas com parâmetro, achei ${promessas.length} — se o catálogo encolheu, confira se foi de propósito`);

  const semCumprir = [];
  for (const { rota, parametro } of promessas) {
    const arquivo = path.join(raiz, "app", "(crm)", rota.slice(1), "page.tsx");
    if (!fs.existsSync(arquivo)) continue; // destino sem página própria é outro problema, coberto pela fase 021
    const tela = fs.readFileSync(arquivo, "utf8");
    const leIntencao = tela.includes("intencao-da-url");
    if (!leIntencao) semCumprir.push(`${rota}?${parametro}`);
  }

  assert.deepEqual(semCumprir, [],
    `estas telas ignoram o parâmetro que o catálogo promete — o botão existe e não faz nada: ${semCumprir.join(", ")}`);
});

test("nenhuma chave de URL de /leads escapa da lista fechada", () => {
  /**
   * /leads foi a primeira tela a ler a URL, antes de o módulo compartilhado
   * existir, e por isso ainda tem leitura própria. O contrato não a obriga a
   * migrar — obriga a cumprir a MESMA regra.
   *
   * O motivo é um defeito real: `status` era a única chave sem porteiro. Ela ia
   * crua para a API, então /leads?status=xpto devolvia lista vazia — e lista
   * vazia se lê como "não há trabalho", que é a pior mensagem possível numa
   * operação com 443 leads paradas. A tela violava a regra que este mesmo
   * módulo impõe às outras nove.
   */
  const tela = ler("app", "(crm)", "leads", "page.tsx");
  const lidas = [...tela.matchAll(/url\.get\("([a-zA-Z]+)"\)/g)].map((achado) => achado[1]);
  const semPorteiro = lidas.filter((chave) => {
    const uso = new RegExp(`pegar\\(\\s*"${chave}"`);
    return !uso.test(tela);
  });
  assert.deepEqual(semPorteiro, [],
    `estas chaves vão cruas da URL para o estado, e valor inventado vira lista vazia: ${semPorteiro.join(", ")}`);
});

// ── O TERCEIRO CATÁLOGO: um destino, um dono ────────────────────────────────

/**
 * `lib/atlas/core-v2/page-registry.ts` declarava a PRÓPRIA ação primária por
 * página — o mesmo campo que `lib/atlas/navigation.ts` declara por destino. Em
 * 2026-07-29 os dois já tinham divergido em seis pontos, e o pior deles apagava
 * um parâmetro: a sala de comando prometia "abrir a prioridade" e mandava para
 * `/pipeline` sem `?focus=priority`, ou seja, para a lista inteira.
 *
 * Duas verdades não divergem por descuido: divergem porque só uma delas é
 * editada quando o produto muda. Estes contratos guardam a reconciliação.
 *
 * Os cinco contratos que NÃO derivam são destinos ausentes de `navigation.ts`:
 * `customers-360` herdou a rota /leads quando /customers morreu mas não é o
 * destino "Leads" do menu; `activity` e `reactivation` vivem no ⌘K; `copilot` e
 * `revenue-engine` saíram do menu (o copiloto virou dock global, a decisão de
 * receita virou /decision-center).
 */
const NAO_DERIVAM = ["activity", "copilot", "customers-360", "reactivation", "revenue-engine"];

test("o registro de páginas deriva a ação primária do destino, não a redeclara", () => {
  const { atlasCoreV2PageRegistry } = carregar("lib", "atlas", "core-v2", "page-registry.ts");
  const { atlasNavigation } = carregar("lib", "atlas", "navigation.ts");

  // /dashboard não é um destino: é compatibilidade de deep link que redireciona
  // para /command-center. O contrato guarda a rota antiga e a ação da nova.
  const compatibilidade = { "/dashboard": "/command-center" };

  const divergentes = [];
  let derivados = 0;
  for (const contrato of atlasCoreV2PageRegistry) {
    if (NAO_DERIVAM.includes(contrato.id)) continue;
    const href = compatibilidade[contrato.route] ?? contrato.route;
    const destino = atlasNavigation.find((item) => item.href === href);
    assert.ok(destino, `contrato "${contrato.id}" aponta ${href}, que não é destino do menu — ou ele deriva de algum destino, ou entra na lista de exceções com o motivo`);
    derivados += 1;
    const declarado = {
      label: contrato.primaryAction.label,
      href: contrato.primaryAction.href,
      outcome: contrato.primaryAction.outcome,
    };
    if (JSON.stringify(declarado) !== JSON.stringify({ ...destino.primaryAction })) {
      divergentes.push(`${contrato.id}: registro=${declarado.href} navegação=${destino.primaryAction.href}`);
    }
  }

  assert.deepEqual(divergentes, [],
    `estes contratos redeclaram a ação do destino em vez de derivá-la: ${divergentes.join(" | ")}`);
  // A PROPRIEDADE, não o número solto: todo contrato ou deriva de um destino do
  // menu, ou está na lista de exceções explicando por que não tem destino.
  assert.equal(derivados + NAO_DERIVAM.length, atlasCoreV2PageRegistry.length,
    "todo contrato de página precisa ter um dono: derivado do menu ou exceção nomeada");
});

test("nenhuma promessa dos três catálogos usa chave fora do vocabulário", () => {
  const { atlasNavigation } = carregar("lib", "atlas", "navigation.ts");
  const { atlasCoreV2PageRegistry } = carregar("lib", "atlas", "core-v2", "page-registry.ts");
  const { listOperationalWriteCapabilities } = carregar("lib", "atlas", "core-v2", "live-write-readiness.ts");

  const promessas = [
    ...atlasNavigation.map((item) => item.primaryAction.href),
    ...atlasCoreV2PageRegistry.map((contrato) => contrato.primaryAction.href),
    ...Object.values(listOperationalWriteCapabilities()).map((capacidade) => capacidade.href),
  ].filter((href) => href.includes("?"));

  assert.ok(promessas.length >= 10,
    `esperava ao menos 10 promessas com parâmetro nos três catálogos, achei ${promessas.length}`);

  const fora = [];
  for (const href of promessas) {
    const [rota, consulta] = href.split("?");
    // A REGRA DE VERDADE, executada — não uma cópia dela.
    if (lerIntencaoDaUrl(consulta)) continue;
    // Única exceção, e ela é de outra natureza: `vinculo` não é intenção de
    // abertura, é FILTRO da lista de leads, da mesma família de `attention` e
    // `status`. /leads tem porteiro próprio para esses (page.tsx:542) e o
    // contrato logo acima garante que nenhum deles escapa. Conferimos aqui que
    // o VALOR prometido é um vínculo que a tela sabe aplicar.
    if (rota === "/leads" && ehVinculoValido(new URLSearchParams(consulta).get("vinculo"))) continue;
    fora.push(href);
  }

  assert.deepEqual(fora, [],
    `estas promessas carregam chave que nenhuma tela sabe cumprir: ${fora.join(", ")}`);
});

test("toda promessa do registro com parâmetro tem tela que a cumpre", () => {
  const { atlasCoreV2PageRegistry } = carregar("lib", "atlas", "core-v2", "page-registry.ts");

  const semCumprir = [];
  for (const contrato of atlasCoreV2PageRegistry) {
    const href = contrato.primaryAction.href;
    if (!href.includes("?")) continue;
    const rota = href.split("?")[0];
    if (rota === "/leads") continue; // leitura própria, guardada pelo contrato acima
    const arquivo = path.join(raiz, "app", "(crm)", rota.slice(1), "page.tsx");
    if (!fs.existsSync(arquivo)) {
      semCumprir.push(`${href} (tela inexistente)`);
      continue;
    }
    if (!fs.readFileSync(arquivo, "utf8").includes("intencao-da-url")) semCumprir.push(href);
  }

  assert.deepEqual(semCumprir, [],
    `o registro promete um resultado e a tela ignora o parâmetro: ${semCumprir.join(", ")}`);
});

test("/activity só aceita um recorte que existe de verdade", () => {
  // O valor prometido pelo registro tem de ser um dos períodos que os chips
  // oferecem. `PERIODS` mora dentro do componente (JSX não dá para executar
  // aqui), então o valor é conferido no texto; a REGRA que o converte em
  // intenção é executada.
  const tela = ler("app", "(crm)", "activity", "page.tsx");
  assert.equal(alvoDaIntencao(lerIntencaoDaUrl("?view=today"), "visao"), "today");
  assert.ok(tela.includes('["today", "Hoje"]'),
    "o registro promete /activity?view=today; se o período 'today' sumir dos chips, a promessa vira decorativa");
  assert.ok(tela.includes("PERIODS.find"),
    "o valor da URL precisa ser validado contra a MESMA lista dos chips — valor inventado não pode virar recorte silencioso");
});

test("a prontidão de escrita não fixa rota à mão", () => {
  const { atlasNavigation } = carregar("lib", "atlas", "navigation.ts");
  const { acaoPrimariaDoModulo } = carregar("lib", "atlas", "core-v2", "page-registry.ts");
  const { listOperationalWriteCapabilities } = carregar("lib", "atlas", "core-v2", "live-write-readiness.ts");
  const capacidades = listOperationalWriteCapabilities();

  // A corrente inteira, ponta a ponta: menu → registro de páginas → prontidão
  // de escrita. Era aqui que moravam a quarta e a quinta cópia dos mesmos dois
  // hrefs, e cada cópia é uma chance a mais de o parâmetro se perder.
  const doMenu = (id) => atlasNavigation.find((item) => item.id === id).primaryAction.href;

  assert.equal(capacidades.pipeline.href, acaoPrimariaDoModulo("pipeline").href);
  assert.equal(capacidades.pipeline.href, doMenu("pipeline"));
  assert.equal(capacidades["tasks-and-agenda"].href, acaoPrimariaDoModulo("tasks-and-agenda").href);
  assert.equal(capacidades["tasks-and-agenda"].href, doMenu("tasks"));
});

test("ninguém faz leitura própria de URL nas telas de destino", () => {
  // Nove cópias da mesma regra divergem. A lista de chaves é fechada e mora num
  // lugar só; uma tela lendo window.location por conta própria escapa disso.
  const rotas = ["pipeline", "tasks", "calendar", "brokers", "distribution", "sales", "users", "external-sales", "settings"];
  const fora = rotas.filter((rota) => {
    const arquivo = path.join(raiz, "app", "(crm)", rota, "page.tsx");
    if (!fs.existsSync(arquivo)) return false;
    const tela = fs.readFileSync(arquivo, "utf8");
    return tela.includes("window.location.search") && !tela.includes("intencao-da-url");
  });
  assert.deepEqual(fora, [], `leitura de URL fora do módulo compartilhado em: ${fora.join(", ")}`);
});
