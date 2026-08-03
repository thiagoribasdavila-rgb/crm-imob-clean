/**
 * Contrato do CRIATIVO QUE NASCE COM LASTRO.
 *
 * `creative_assets` tinha ZERO linhas na produção. Não por falta de código — o
 * estúdio, o estrategista, a rotação e a composição já estavam escritos — mas
 * porque o caminho até o banco estava partido em dois pontos de esquema, e
 * porque nada conferia o número que a peça citava contra o estoque real.
 *
 * Este portão prova quatro coisas, e cada uma nasceu de um defeito medido na
 * produção em 02/08/2026:
 *
 *   1. O NÚMERO VEM DE `properties`, NÃO DE `developments.total_units`.
 *      Spin Mood tem total_units = 30 e apenas 24 unidades disponíveis. Um
 *      anúncio com "30 unidades" vende 6 apartamentos que não estão à venda.
 *
 *   2. A CONFERÊNCIA MORDE — e deixa passar o que é verdade. Portão que só
 *      testa o lado negativo aceita uma implementação que recusa tudo; portão
 *      que só testa o positivo aceita uma que aprova tudo. Os dois lados, sempre.
 *
 *   3. A PEÇA NÃO PODE NASCER APONTANDO PARA A TABELA ERRADA.
 *      `creative_assets.campaign_id` referencia `campaigns(id)` — tabela com 0
 *      linhas — e não `marketing_campaigns(id)`, que tem 8. Gravar o id da
 *      segunda naquela coluna dá SQLSTATE 23503, e foi isso que impediu toda
 *      peça de existir. A asserção aponta para a PROPRIEDADE (a coluna sai
 *      nula e o vínculo real viaja em metadata), não para a linha de código.
 *
 *   4. NADA NASCE APROVADO NEM PUBLICADO. Nível 2 do catálogo de autonomia:
 *      "escreve e DEIXA salvo para revisão". Publicar é ato humano.
 *
 * Rodar: node --experimental-strip-types --test tests/contracts/criativo-nasce-com-lastro.test.mjs
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

import {
  MODO_COM_LASTRO,
  MODO_BRIEFING_E_COPIES,
  MODOS_DE_GERACAO,
  modoDaRequisicao,
} from "../../lib/marketing/modo-de-geracao.ts";
import {
  montarFicha,
  conferirNumeros,
  fichaEmTexto,
  fonteUtilizavel,
  deFonteExterna,
  STATUS_ANUNCIAVEL,
} from "../../lib/marketing/fatos-do-empreendimento.ts";
import {
  avaliarVariacoes,
  planejarGravacao,
  normalizarVariacoes,
  hashDoConteudo,
  podeIrParaMeta,
  ANGULOS,
  PERSONAS,
  ETAPAS,
  FORMATO_PADRAO,
} from "../../lib/marketing/criativo-com-lastro.ts";

// ---------------------------------------------------------------------------
// Cenário espelhado da produção: Spin Mood, onde o cadastro e o estoque divergem.
// ---------------------------------------------------------------------------

const DEV = {
  id: "546bb8b1-b465-4b21-907b-1d0e681f5b5b",
  organization_id: "7c8c71c1-e963-464c-be5c-ff8c7936f51a",
  name: "Spin Mood",
  developer_name: "Spin",
  neighborhood: "Perdizes",
  city: "São Paulo",
  total_units: 30, // o cadastro diz 30…
  price_min: 235000,
};

/** …mas `properties` tem 24 disponíveis e 6 reservadas. */
const PROPS = [
  ...Array.from({ length: 24 }, (_, i) => ({
    status: "available",
    typology: "STUDIO 27m2",
    area: 26.56 + i * 0.5,
    price: 235000 + i * 10000,
  })),
  ...Array.from({ length: 6 }, () => ({
    status: "reserved",
    typology: "STUDIO 29m2",
    area: 29.32,
    price: 315000,
  })),
];

const ficha = () => montarFicha(DEV, PROPS, []);

const variacao = (over = {}) => ({
  conceito: "Conceito",
  angulo: "location",
  persona: "first_home",
  etapa: "consideration",
  titulo: "Studios em Perdizes",
  textoPrincipal: "Studios prontos em Perdizes, com plantas compactas e lazer no prédio.",
  descricao: "Perdizes, São Paulo",
  chamada: "Saiba mais",
  objecao: "Quero entender a metragem antes de visitar.",
  ...over,
});

const ctx = (over = {}) => ({
  ficha: ficha(),
  objetivo: "gerar_leads",
  criadoPor: "11111111-1111-4111-8111-111111111111",
  geracao: {
    variacoes: [],
    provedor: "openai",
    modelo: "gpt-test",
    tokens: 100,
    custoUsd: 0.01,
    geradoEm: "2026-08-02T00:00:00.000Z",
    semModelo: false,
  },
  marketingCampaignId: "f1250a63-056b-4c5f-baec-925548e47e72",
  ...over,
});

// ---------------------------------------------------------------------------
// 1. O número vem do estoque, não do cadastro
// ---------------------------------------------------------------------------

test("o estoque anunciável é o de properties disponíveis, não total_units", () => {
  const f = ficha();
  assert.equal(f.unidadesDisponiveis, 24, "reservado não é estoque à venda");
  assert.notEqual(f.unidadesDisponiveis, DEV.total_units,
    "usar total_units anunciaria unidades que não estão à venda");
  assert.equal(STATUS_ANUNCIAVEL, "available");
});

test("a divergência entre cadastro e estoque fica VISÍVEL, não silenciosa", () => {
  const f = ficha();
  assert.ok(f.divergenciasDeCadastro.length >= 1,
    "30 no cadastro contra 24 no estoque precisa aparecer para quem aprova");
  assert.match(f.divergenciasDeCadastro.join(" "), /total_units/);
});

test("cada fato carrega origem: tabela, coluna, filtro e quantas linhas o sustentam", () => {
  const f = ficha();
  assert.ok(f.fatos.length > 0);
  for (const fato of f.fatos) {
    assert.ok(fato.origem.tabela, `fato ${fato.chave} sem tabela de origem`);
    assert.ok(fato.origem.coluna, `fato ${fato.chave} sem coluna de origem`);
    assert.ok(fato.origem.linhas > 0, `fato ${fato.chave} sem linha que o sustente`);
  }
  const preco = f.fatos.find((x) => x.chave === "preco_min");
  assert.equal(preco.origem.tabela, "properties", "preço de anúncio vem do estoque");
  assert.match(preco.origem.filtro, /available/);
});

test("empreendimento sem unidade disponível não produz fato numérico nenhum", () => {
  // Zero desenhado como saúde é proibido: a ficha precisa DIZER o que falta.
  const f = montarFicha(DEV, [{ status: "sold", typology: "X", area: 30, price: 400000 }], []);
  assert.equal(f.unidadesDisponiveis, 0);
  assert.equal(f.precoMin, null);
  assert.ok(f.ausentes.length >= 1, "a ausência precisa ser declarada, não inferida do zero");
  assert.ok(!f.fatos.some((x) => x.unidade === "BRL"),
    "sem estoque não pode existir fato de preço");
});

// ---------------------------------------------------------------------------
// 2. A conferência morde — e deixa passar a verdade
// ---------------------------------------------------------------------------

test("recusa preço FORA da faixa disponível", () => {
  const f = ficha();
  assert.ok(conferirNumeros("t", "Studios a partir de R$ 150.000.", f).length > 0, "abaixo do menor");
  assert.ok(conferirNumeros("t", "Unidades por R$ 2.000.000.", f).length > 0, "acima do maior");
});

test('"a partir de" exige o MENOR preço, não um valor qualquer da faixa', () => {
  const f = ficha();
  const meio = f.precoMax;
  const d = conferirNumeros("t", `Unidades a partir de R$ ${meio.toLocaleString("pt-BR")}.`, f);
  assert.ok(d.length > 0, '"a partir de" com o maior preço da faixa é enganoso');
  assert.match(d[0].motivo, /MENOR pre/);
});

test("recusa metragem e contagem de unidades que o estoque não sustenta", () => {
  const f = ficha();
  assert.ok(conferirNumeros("t", "Apartamentos de 90 m².", f).length > 0);
  assert.ok(conferirNumeros("t", "São 30 unidades disponíveis.", f).length > 0,
    "30 é o total_units do cadastro; disponíveis são 24");
});

test("DEIXA PASSAR o número verdadeiro — senão o portão só aprova peça sem número", () => {
  const f = ficha();
  const bom = `Studios a partir de R$ ${f.precoMin.toLocaleString("pt-BR")}, de ${f.areaMin} a ${Math.floor(f.areaMax)} m². São ${f.unidadesDisponiveis} unidades.`;
  assert.deepEqual(conferirNumeros("t", bom, f), [],
    "o texto que cita exatamente o estoque real precisa passar");
});

test("sem preço no CRM, NENHUM valor pode ser citado", () => {
  const semPreco = montarFicha(DEV, PROPS.map((p) => ({ ...p, price: null })), []);
  assert.ok(conferirNumeros("t", "A partir de R$ 235.000.", semPreco).length > 0);
});

// ---------------------------------------------------------------------------
// 3. A peça não nasce apontando para a tabela errada
// ---------------------------------------------------------------------------

test("campaign_id sai NULO: a FK aponta para campaigns, e o vínculo real vai em metadata", () => {
  const avaliadas = avaliarVariacoes([variacao()], ficha());
  const plano = planejarGravacao(avaliadas, ctx());
  assert.equal(plano.pecas.length, 1);
  const { asset } = plano.pecas[0];
  assert.equal(asset.campaign_id, null,
    "creative_assets.campaign_id referencia campaigns(id) — id de marketing_campaigns ali dá 23503");
  assert.equal(asset.metadata.marketingCampaignId, "f1250a63-056b-4c5f-baec-925548e47e72",
    "o vínculo verdadeiro não pode se perder: ele vai para metadata");
});

test("a peça sai com procedência completa: modelo, versão do prompt e fatos usados", () => {
  const plano = planejarGravacao(avaliarVariacoes([variacao()], ficha()), ctx());
  const p = plano.pecas[0].asset.metadata.procedencia;
  assert.ok(p.promptVersao, "sem versão de prompt, duas peças diferentes viram mistério");
  assert.equal(p.provedor, "openai");
  assert.equal(p.modelo, "gpt-test");
  assert.ok(Array.isArray(p.fatosDoCRM) && p.fatosDoCRM.length > 0,
    "quais fatos do CRM entraram tem que ficar gravado");
  assert.ok(p.fatosDoCRM.every((x) => x.origem && x.origem.tabela),
    "fato gravado sem origem é fato que ninguém consegue conferir depois");
  assert.ok(Array.isArray(p.fontesWeb), "o formato da fonte web existe mesmo quando vazio");
  assert.equal(p.conferencia.estoqueNoMomento, 24,
    "o estoque do instante da geração fica congelado na peça");
});

test("a versão nasce com taxonomia que o CHECK do banco aceita", () => {
  const plano = planejarGravacao(avaliarVariacoes([variacao()], ficha()), ctx());
  const v = plano.pecas[0].versao;
  assert.ok(ANGULOS.includes(v.message_angle));
  assert.ok(PERSONAS.includes(v.persona_moment));
  assert.ok(ETAPAS.includes(v.funnel_stage));
  assert.equal(v.format, FORMATO_PADRAO);
  assert.match(v.content_hash, /^[a-f0-9]{64}$/, "content_hash tem CHECK de formato no banco");
  assert.ok(v.primary_promise.length >= 10 && v.primary_promise.length <= 500);
  assert.ok(v.objection_addressed.length >= 5 && v.objection_addressed.length <= 500);
  assert.ok(v.hook.length >= 5 && v.hook.length <= 300);
});

test("saída livre do modelo sempre cai dentro do vocabulário do banco", () => {
  const bruto = [{ ...variacao(), angulo: "vibe", persona: "millennials", etapa: "meio-do-funil" }];
  const [n] = normalizarVariacoes(bruto, "gerar_leads");
  assert.ok(ANGULOS.includes(n.angulo), "ângulo inventado pelo modelo daria 23514 no CHECK");
  assert.ok(PERSONAS.includes(n.persona));
  assert.ok(ETAPAS.includes(n.etapa));
});

test("o hash distingue peças diferentes e repete para a mesma peça", () => {
  const c = ctx();
  const a = hashDoConteudo(variacao(), c);
  assert.equal(a, hashDoConteudo(variacao(), c), "mesma peça, mesmo hash");
  assert.notEqual(a, hashDoConteudo(variacao({ titulo: "Outro título" }), c),
    "UNIQUE(organization_id, content_hash) descartaria uma peça nova como duplicata");
});

// ---------------------------------------------------------------------------
// 4. Nada nasce aprovado, publicado, nem sem modelo
// ---------------------------------------------------------------------------

test("toda peça nasce rascunho e declara que exige revisão humana", () => {
  const plano = planejarGravacao(avaliarVariacoes([variacao()], ficha()), ctx());
  for (const { asset } of plano.pecas) {
    assert.equal(asset.status, "draft");
    assert.equal(asset.metadata.aprovacao.exigeRevisaoHumana, true);
    assert.equal(asset.metadata.aprovacao.publicadoNaMeta, false);
  }
});

test("só versão APROVADA pela diretoria pode ir para a Meta", () => {
  assert.equal(podeIrParaMeta("approved"), true);
  for (const estado of ["draft", "rejected", "archived", "", null, undefined]) {
    assert.equal(podeIrParaMeta(estado), false, `${estado} não autoriza publicação`);
  }
});

test("variação com número sem lastro é RECUSADA — não corrigida em silêncio", () => {
  const ruim = variacao({ textoPrincipal: "Studios em Perdizes a partir de R$ 99.000, aproveite." });
  const [a] = avaliarVariacoes([ruim], ficha());
  assert.equal(a.aprovada, false);
  assert.ok(a.divergencias.length > 0);
  const plano = planejarGravacao([a], ctx());
  assert.equal(plano.pecas.length, 0, "peça com número falso não pode nascer");
  assert.equal(plano.recusadas.length, 1, "e a recusa precisa ser contada, não sumir");
  assert.ok(plano.impedimentos.length > 0, "zero peças sem motivo declarado é zero desenhado como saúde");
});

test("fallback local não vira peça: template fixo não é texto de modelo", () => {
  const c = ctx({ geracao: { ...ctx().geracao, semModelo: true, provedor: "local" } });
  const plano = planejarGravacao(avaliarVariacoes([variacao()], ficha()), c);
  assert.ok(plano.impedimentos.some((m) => /fallback local/i.test(m)),
    "sem provedor não houve texto gerado por modelo — gravar isso seria mentir na procedência");
});

test("a política de HOUSING continua valendo sobre o texto gerado", () => {
  // Reusa `validateCopy` de creative-strategist: a régua de política é uma só.
  const ruim = variacao({ textoPrincipal: "Ideal para famílias que querem sair do aluguel em Perdizes." });
  const [a] = avaliarVariacoes([ruim], ficha());
  assert.equal(a.aprovada, false, "'ideal para famílias' descreve quem lê — vetado pela Meta");
  assert.ok(a.violacoes.length > 0);
});

// ---------------------------------------------------------------------------
// 5. A ponte com a frente da web — combinada pelo FORMATO
// ---------------------------------------------------------------------------

test("fonte web só entra com url, publicador, data e trecho", () => {
  assert.equal(fonteUtilizavel({ url: "https://x.com/a", publicador: "X", publicadoEm: "2026-01-01", trecho: "t" }), true);
  assert.equal(fonteUtilizavel({ url: "nao-e-url", publicador: "X", publicadoEm: "2026-01-01", trecho: "t" }), false);
  assert.equal(fonteUtilizavel({ url: "https://x.com/a", publicador: "", publicadoEm: "2026-01-01", trecho: "t" }), false);
  assert.equal(fonteUtilizavel({ url: "https://x.com/a", publicador: "X", publicadoEm: null, trecho: "t" }), false);
  assert.equal(fonteUtilizavel({ url: "https://x.com/a", publicador: "X", publicadoEm: "2026-01-01", trecho: "" }), false);
});

test("fonte PENDENTE de revisão não vira lastro de anúncio", () => {
  const pendente = { sourceUrl: "https://fipe.org.br/x", publisher: "FipeZap", referenceDate: "2026-06-01", summary: "m² a R$ 14 mil", reviewStatus: "pending" };
  assert.deepEqual(deFonteExterna([pendente]), [],
    "pendente é o estado em que a coleta automática nasce — não é fonte conferida");
  assert.equal(deFonteExterna([{ ...pendente, reviewStatus: "verified" }]).length, 1);
});

test("a ficha em texto proíbe explicitamente o que o nível 5 já proíbe", () => {
  const texto = fichaEmTexto(ficha());
  assert.match(texto, /Não garanta preço, disponibilidade/i, "garantir_preco_ou_estoque");
  assert.match(texto, /Não prometa aprovação de crédito/i, "prometer_financiamento");
  assert.match(texto, /estoque real, não o total do empreendimento/i);
});

// ---------------------------------------------------------------------------
// 6. CAMINHO DE EXECUÇÃO — a regra certa que ninguém alcança não vale nada
// ---------------------------------------------------------------------------
//
// Este bloco existe porque a entrega anterior foi REPROVADA por isto: o gerador
// estava escrito, testado e correto, e os únicos importadores dele eram um
// script de ensaio e este próprio contrato. Zero rota, zero tela. Módulo órfão
// não muda o produto — muda só a contagem de arquivos.
//
// A asserção NÃO é "a linha de import existe". Ela caminha o GRAFO de imports a
// partir do arquivo da rota e pergunta se o gerador é alcançável. Reagrupar
// imports, trocar de barril, mover o módulo de lugar: tudo isso continua verde
// enquanto o caminho existir, e fica vermelho no instante em que ele sumir — que
// é exatamente quando um portão deve falar.

const RAIZ = path.resolve(import.meta.dirname, "..", "..");

/** `import x from "y"`, `export * from "y"`, `import("y")`, `import "y"`. */
const ESPECIFICADORES = [
  /(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g,
  /\bimport\s+["']([^"']+)["']/g,
];

/** Resolve como o empacotador do repo resolve: alias `@/`, relativo, sem extensão. */
function resolverModulo(especificador, deArquivo) {
  let alvo;
  if (especificador.startsWith("@/")) alvo = path.join(RAIZ, especificador.slice(2));
  else if (especificador.startsWith(".")) alvo = path.resolve(path.dirname(deArquivo), especificador);
  else return null; // pacote (react, next, node:crypto) — fora do grafo do repo
  for (const sufixo of ["", ".ts", ".tsx", ".mjs", "/index.ts", "/index.tsx"]) {
    const tentativa = alvo + sufixo;
    if (existsSync(tentativa) && !tentativa.endsWith(path.sep)) {
      try {
        if (readFileSync(tentativa, "utf8") !== undefined) return tentativa;
      } catch { /* diretório: segue para o próximo sufixo */ }
    }
  }
  return null;
}

/** Todos os arquivos do repo alcançáveis a partir de `entrada`, transitivamente. */
function alcancaveisDe(entrada) {
  const inicio = path.join(RAIZ, entrada);
  assert.ok(existsSync(inicio), `ponto de partida inexistente: ${entrada}`);
  const vistos = new Set([inicio]);
  const fila = [inicio];
  while (fila.length) {
    const atual = fila.pop();
    let fonte;
    try { fonte = readFileSync(atual, "utf8"); } catch { continue; }
    for (const re of ESPECIFICADORES) {
      for (const m of fonte.matchAll(re)) {
        const destino = resolverModulo(m[1], atual);
        if (!destino || vistos.has(destino)) continue;
        vistos.add(destino);
        fila.push(destino);
      }
    }
  }
  return new Set([...vistos].map((f) => path.relative(RAIZ, f)));
}

const ROTA = "app/api/v1/marketing/creative-studio/route.ts";
const TELA = "app/(crm)/marketing/campanhas-criativos-proposta/page.tsx";

test("a ROTA viva alcança o gerador, a regra e a ficha de fatos", () => {
  const alcancados = alcancaveisDe(ROTA);
  for (const modulo of [
    "lib/marketing/gerador-de-criativos.ts",
    "lib/marketing/criativo-com-lastro.ts",
    "lib/marketing/fatos-do-empreendimento.ts",
  ]) {
    assert.ok(
      alcancados.has(modulo),
      `${modulo} NÃO é alcançável a partir de ${ROTA}. ` +
      "Regra que nenhuma rota chama é módulo órfão: o produto continua exatamente como estava.",
    );
  }
});

test("a TELA viva chama a rota, e pede o modo com lastro", () => {
  const fonte = readFileSync(path.join(RAIZ, TELA), "utf8");
  assert.match(fonte, /\/api\/v1\/marketing\/creative-studio/,
    "a tela precisa CHAMAR a rota — sem a chamada, a rota é uma porta sem corredor");
  // A URL é string dos dois lados por natureza (HTTP), então o portão confere
  // que ela aponta para um arquivo que existe. URL sem rota é 404 em produção.
  assert.ok(existsSync(path.join(RAIZ, ROTA)), `${ROTA} não existe: a URL da tela é um 404`);

  // O NOME DO MODO não é conferido por string: os dois lados importam a mesma
  // constante, e o portão confere que os dois alcançam o módulo dela. Renomear
  // o valor quebra os dois juntos, que é o que um contrato precisa garantir.
  assert.ok(alcancaveisDe(TELA).has("lib/marketing/modo-de-geracao.ts"),
    "a tela precisa importar o modo, não digitá-lo");
  assert.ok(alcancaveisDe(ROTA).has("lib/marketing/modo-de-geracao.ts"),
    "a rota precisa importar o modo, não digitá-lo");
  assert.match(fonte, /MODO_COM_LASTRO/,
    "a tela precisa PEDIR o modo com lastro; sem ele a rota devolve o briefing de sempre");
});

test("modo ausente é o de sempre; modo desconhecido é ERRO, nunca o padrão", () => {
  assert.equal(modoDaRequisicao(undefined), MODO_BRIEFING_E_COPIES,
    "corpo antigo, sem `modo`, não pode mudar de comportamento");
  assert.equal(modoDaRequisicao(null), MODO_BRIEFING_E_COPIES);
  assert.equal(modoDaRequisicao(MODO_COM_LASTRO), MODO_COM_LASTRO);
  for (const errado of ["com_lastro", "lastro", "VARIACOES_COM_LASTRO", "briefing", 7, {}]) {
    assert.equal(modoDaRequisicao(errado), null,
      `"${String(errado)}" cair no padrão devolveria peça SEM conferência de número ` +
      "com cara de peça conferida");
  }
  assert.deepEqual([...MODOS_DE_GERACAO], [MODO_BRIEFING_E_COPIES, MODO_COM_LASTRO]);
});

test("o caminhador de grafo REPROVA quando o caminho não existe", () => {
  // Portão que só testa o lado positivo aceita um caminhador que devolve o
  // universo. Este arquivo de contrato não importa o gerador de I/O — e não
  // pode passar a importar, porque `gerador-de-criativos.ts` carrega
  // `server-only`. Então ele é o negativo natural.
  const desteContrato = alcancaveisDe("tests/contracts/criativo-nasce-com-lastro.test.mjs");
  assert.ok(desteContrato.has("lib/marketing/criativo-com-lastro.ts"), "o positivo precisa valer");
  assert.ok(!desteContrato.has("lib/marketing/gerador-de-criativos.ts"),
    "o caminhador não pode alcançar o que ninguém importa — senão ele aprova qualquer coisa");
});
