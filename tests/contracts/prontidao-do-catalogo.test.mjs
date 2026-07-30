/**
 * Contrato da PRONTIDÃO DO CATÁLOGO — o bloqueio que faltava na central.
 *
 * ── O QUE ISTO TORNA VISÍVEL ────────────────────────────────────────────────
 *
 * Medido no banco vivo em 2026-07-30: `developments` tem 4 linhas e preço em
 * ZERO delas; `development_typologies` tem 6 linhas, preço em zero, e as 6 são
 * todas de UM único empreendimento; `units`, `inventory_units` e `properties`
 * têm zero linhas. O motor de compatibilidade recomenda para **12 de 482 leads**.
 *
 * E a inversão: Perdizes tem 174 de demanda revelada e ZERO tipologias;
 * Aclimação tem ZERO demanda e as 6 tipologias. O único empreendimento com
 * catálogo completo é o único que ninguém procura.
 *
 * Nada disso aparecia em tela. A central tinha fila de bloqueios alimentada só
 * pela prontidão da Meta — e catálogo sem preço impede mais que verba esgotada:
 * sem verba o corretor trabalha o que já entrou; sem preço ele não tem o que
 * dizer a ninguém.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { bloqueiosDoCatalogo } from "../../lib/atlas/prontidao-do-catalogo.ts";

/** O catálogo REAL de 2026-07-30, para o contrato falar da base e não de exemplo. */
const REAL = {
  empreendimentos: [
    { id: "a", nome: "Inside Perdizes", bairro: "Perdizes", temPreco: false, tipologias: 0, tipologiasComPreco: 0 },
    { id: "b", nome: "Paraíso", bairro: "Paraíso", temPreco: false, tipologias: 0, tipologiasComPreco: 0 },
    { id: "c", nome: "Aclimação", bairro: "Aclimação", temPreco: false, tipologias: 6, tipologiasComPreco: 0 },
    { id: "d", nome: "Sem bairro", bairro: null, temPreco: false, tipologias: 0, tipologiasComPreco: 0 },
  ],
  unidades: 0,
  demandaPorBairro: { Perdizes: 174, Paraíso: 11, Aclimação: 0 },
};

const codigos = (bs) => bs.map((b) => b.codigo);

test("o catálogo real de hoje produz o bloqueio de preço, e ele é crítico", () => {
  const bs = bloqueiosDoCatalogo(REAL);
  const preco = bs.find((b) => b.codigo === "catalogo_sem_preco");
  assert.ok(preco, "sem preço em 4 de 4, o bloqueio precisa existir");
  assert.equal(preco.gravidade, "critical");
});

test("a ação NOMEIA o empreendimento de maior demanda, não o primeiro da lista", () => {
  /**
   * "Cadastre preços" é conselho. "Comece por Inside Perdizes, 174 leads procuram
   * esse bairro" é trabalho. A ordenação por demanda é a propriedade — sem ela o
   * diretor cadastra o primeiro que vê, que é o que ninguém procura.
   */
  const acao = bloqueiosDoCatalogo(REAL).find((b) => b.codigo === "catalogo_sem_preco").acao;
  assert.match(acao, /Inside Perdizes/);
  assert.match(acao, /174/);
  assert.doesNotMatch(acao, /Aclimação/, "Aclimação tem zero demanda: começar por ela é o erro que o bloqueio evita");
});

test("a inversão demanda × oferta é dita, porque isolada nenhuma metade é notícia", () => {
  const inv = bloqueiosDoCatalogo(REAL).find((b) => b.codigo === "demanda_sem_oferta_cadastrada");
  assert.ok(inv, "174 procurando onde não há tipologia, e 6 tipologias onde ninguém procura");
  assert.match(inv.resumo, /Perdizes/);
  assert.match(inv.resumo, /Aclimação/);
});

test("catálogo COM preço não gera bloqueio de preço — o outro lado", () => {
  // Sem isto, uma regra que sempre acusa passaria nos testes acima e encheria a
  // fila do diretor com bloqueio que ele não pode resolver.
  const comPreco = {
    ...REAL,
    empreendimentos: REAL.empreendimentos.map((e) => ({ ...e, temPreco: true })),
  };
  assert.ok(!codigos(bloqueiosDoCatalogo(comPreco)).includes("catalogo_sem_preco"));
});

test("preço só na TIPOLOGIA já conta como preço", () => {
  // O preço real deste produto mora na tipologia, não no empreendimento. Exigir
  // as duas colunas manteria o bloqueio aceso depois de o trabalho estar feito.
  const so = {
    ...REAL,
    empreendimentos: [{ ...REAL.empreendimentos[2], tipologiasComPreco: 6 }],
    demandaPorBairro: { Aclimação: 0 },
  };
  assert.ok(!codigos(bloqueiosDoCatalogo(so)).includes("catalogo_sem_preco"));
});

test("leitura que FALHOU não vira catálogo em ordem", () => {
  /**
   * `null` é falha de leitura; `[]` é catálogo vazio. Tratar os dois igual é o
   * defeito que este repositório mais pagou: ausência não declarada é
   * indistinguível de zero, e aqui produziria uma central verde sobre um catálogo
   * que ninguém conseguiu ler.
   */
  const bs = bloqueiosDoCatalogo({ empreendimentos: null, unidades: null });
  assert.deepEqual(codigos(bs), ["catalogo_nao_medido"]);
  assert.match(bs[0].acao, /nem que não existe/, "precisa declarar que NÃO SABE, nos dois sentidos");
});

test("catálogo vazio manda cadastrar empreendimento, não preencher preço", () => {
  // Dizer "sem preço" a quem não cadastrou nada manda a pessoa à tela errada.
  const bs = bloqueiosDoCatalogo({ empreendimentos: [], unidades: 0 });
  assert.equal(bs.length, 1);
  assert.match(bs[0].resumo, /Nenhum empreendimento cadastrado/);
  assert.match(bs[0].acao, /Cadastre ao menos um/);
});

test("tipologia sem unidade contável avisa, sem afirmar esgotado", () => {
  const est = bloqueiosDoCatalogo(REAL).find((b) => b.codigo === "estoque_sem_unidade");
  assert.ok(est, "6 tipologias e zero unidades contáveis");
  assert.equal(est.gravidade, "attention", "não é crítico: dá para vender sem contagem, só não dá para AFIRMAR disponibilidade");
  /**
   * A asserção é pelo SIGNIFICADO, não pela palavra.
   *
   * A primeira versão proibia o literal `esgotado` — e reprovou o texto CERTO,
   * que usa a palavra justamente para negá-la ("não como esgotado nem como
   * disponível"). É a sexta vez que esta armadilha morde nesta sessão: guarda que
   * proíbe NOMEAR o problema reprova quem o explica, e o conserto tentador é
   * apagar a explicação.
   *
   * O que precisa ser verdade: a ação declara que ninguém contou, e nomeia OS
   * DOIS extremos que ela se recusa a afirmar. Zero unidade contada não é estoque
   * esgotado — e também não é disponível.
   */
  assert.match(est.acao, /ninguém contou/);
  assert.match(est.acao, /esgotado/, "precisa dizer que NÃO afirma esgotado");
  assert.match(est.acao, /disponível/, "e que NÃO afirma disponível — os dois extremos");
  assert.match(est.acao, /não é afirmável|não afirm/i, "a recusa de afirmar é o ponto");
});

test("sem demanda medida, ainda prioriza — pelo que tem tipologia", () => {
  // Cadastrar preço onde já existe tipologia é menos trabalho que começar do zero.
  const semDemanda = { ...REAL, demandaPorBairro: null };
  const acao = bloqueiosDoCatalogo(semDemanda).find((b) => b.codigo === "catalogo_sem_preco").acao;
  assert.match(acao, /Aclimação/, "sem demanda, o critério vira quem tem mais tipologia");
  assert.doesNotMatch(acao, /\d+ leads? procuram?/, "não pode inventar número de demanda que não foi medido");
});

test("a forma é a que a central já desenha", () => {
  /**
   * `{ codigo, gravidade, resumo, acao }` — idêntica à de
   * lib/meta/marketing/prontidao-derivada.ts. Se divergir, a fiação vira conceito
   * novo de tela em vez de uma linha, e o diretor ganha duas listas de bloqueio
   * com aparências diferentes para o mesmo tipo de problema.
   */
  for (const b of bloqueiosDoCatalogo(REAL)) {
    assert.deepEqual(Object.keys(b).sort(), ["acao", "codigo", "gravidade", "resumo"]);
    assert.ok(["critical", "attention"].includes(b.gravidade));
    assert.ok(b.resumo.length > 20 && b.acao.length > 20, "resumo e ação precisam dizer algo");
  }
});
