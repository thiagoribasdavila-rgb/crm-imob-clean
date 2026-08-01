/**
 * A PRIMEIRA PERGUNTA É A QUE DESTRAVA MAIS OFERTAS — não a de maior peso.
 *
 * ── O DEFEITO QUE ISTO EXISTE PARA IMPEDIR ──────────────────────────────────
 *
 * `recomendarPara` já calculava `destravaOfertas` para cada pergunta — quantas
 * ofertas ficariam avaliáveis se o cliente respondesse aquilo — e **jogava o
 * número fora** na ordenação, que usava só `decisivo` e `peso`.
 *
 * Medido no catálogo vivo em 2026-07-30, organização real:
 *
 *   preço cadastrado ......... 1 de 4 empreendimentos   (critério de peso 25)
 *   bairro cadastrado ........ 4 de 4 empreendimentos   (critério de peso 18)
 *
 * Com a ordem por peso, "Qual faixa de valor você considera?" (destrava 1) vinha
 * na frente de "Em quais bairros você quer morar?" (destrava 4). O corretor
 * gastava o único toque da ligação na pergunta de MENOR rendimento — e das 4
 * ofertas, 3 sequer teriam preço com que comparar a resposta arrancada.
 *
 * Isto importa porque o toque é escasso: medido na mesma base, 473 leads estão
 * com o SLA de primeiro contato vencido SEM nenhum contato registrado, e há 9
 * ligações e 7 mensagens de WhatsApp no histórico inteiro. A ordem da pergunta
 * não é detalhe de tela — é a decisão de o que fazer com a única chance.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { recomendarPara } from "../../lib/crm/compatibilidade-imovel.ts";

/**
 * A FORMA DO CATÁLOGO REAL: bairro em todas, preço em uma só.
 * Sem essa assimetria o teste não distingue ordenar por peso de ordenar por
 * destrave — as duas dariam a mesma resposta, e o contrato passaria sem provar.
 */
const CATALOGO = [
  {
    id: "spin-mood",
    name: "Spin Mood",
    neighborhood: "Perdizes / Vila Madalena / Vila Anglo Brasileira",
    city: "São Paulo",
    price_min: 235000,
    price_max: 470000,
    bedrooms_max: 1,
    updated_at: new Date().toISOString(),
  },
  { id: "inside-perdizes", name: "Inside Perdizes", neighborhood: "Perdizes", city: "São Paulo", updated_at: new Date().toISOString() },
  { id: "arvo", name: "Arvo Teixeira da Silva", neighborhood: "Paraíso", city: "São Paulo", bedrooms_min: 1, bedrooms_max: 1, updated_at: new Date().toISOString() },
  { id: "tie", name: "Tiê Aclimação", neighborhood: "Aclimação", city: "São Paulo", updated_at: new Date().toISOString() },
];

/** O caso de 469 das 482 leads: não respondeu nada. */
const CLIENTE_MUDO = { id: "lead-1", name: "Lead sem resposta" };

const chaves = (r) => r.perguntasQueDestravam.map((p) => p.chave);

test("a primeira pergunta é BAIRRO, e não faixa de preço, mesmo preço pesando mais", () => {
  const r = recomendarPara(CLIENTE_MUDO, CATALOGO);
  const primeira = r.perguntasQueDestravam[0];
  assert.equal(
    primeira.chave,
    "bairro",
    `a primeira pergunta veio "${primeira.chave}" (destrava ${primeira.destravaOfertas}); ` +
      `com preço em 1 de 4 e bairro em 4 de 4, perguntar preço primeiro gasta o toque na de menor rendimento`,
  );
});

test("a ordem segue destravaOfertas em queda, dentro dos decisivos", () => {
  const decisivas = recomendarPara(CLIENTE_MUDO, CATALOGO).perguntasQueDestravam.filter((p) => p.decisivo);
  for (let i = 1; i < decisivas.length; i += 1) {
    assert.ok(
      decisivas[i - 1].destravaOfertas >= decisivas[i].destravaOfertas,
      `"${decisivas[i - 1].chave}" destrava ${decisivas[i - 1].destravaOfertas} e vem antes de ` +
        `"${decisivas[i].chave}", que destrava ${decisivas[i].destravaOfertas}`,
    );
  }
});

test("bairro destrava as 4 ofertas e preço destrava 1 — a assimetria é o ponto", () => {
  // Se este teste começar a falhar porque os dois números ficaram iguais, o teste
  // acima deixou de provar qualquer coisa: seria peso e destrave dando a mesma
  // ordem por acidente.
  const r = recomendarPara(CLIENTE_MUDO, CATALOGO);
  const bairro = r.perguntasQueDestravam.find((p) => p.chave === "bairro");
  const preco = r.perguntasQueDestravam.find((p) => p.chave === "faixaDePreco");
  assert.equal(bairro.destravaOfertas, 4);
  assert.equal(preco.destravaOfertas, 1);
  assert.ok(preco.peso > bairro.peso, "e preço continua pesando MAIS — é isso que torna o caso adversarial");
});

test("decisivo continua vindo antes de não decisivo", () => {
  /**
   * O outro lado: ordenar só por destrave poria uma pergunta acessória que
   * destrava 4 na frente de uma decisiva que destrava 3 — e critério não decisivo
   * não abre recomendação nenhuma, por mais ofertas que toque.
   */
  const ordem = recomendarPara(CLIENTE_MUDO, CATALOGO).perguntasQueDestravam;
  const ultimoDecisivo = ordem.map((p) => p.decisivo).lastIndexOf(true);
  const primeiroAcessorio = ordem.findIndex((p) => !p.decisivo);
  if (ultimoDecisivo >= 0 && primeiroAcessorio >= 0) {
    assert.ok(
      ultimoDecisivo < primeiroAcessorio,
      "toda pergunta decisiva precisa vir antes de qualquer acessória",
    );
  }
});

test("empate em destrave é desempatado pelo PESO", () => {
  // Catálogo simétrico: bairro e preço cadastrados nas MESMAS duas ofertas.
  // Aí as duas perguntas destravam 2, e quem decide é o peso — preço, 25.
  const simetrico = [
    { id: "a", name: "A", neighborhood: "Perdizes", price_min: 200000, price_max: 400000, updated_at: new Date().toISOString() },
    { id: "b", name: "B", neighborhood: "Pinheiros", price_min: 300000, price_max: 600000, updated_at: new Date().toISOString() },
  ];
  const perguntas = recomendarPara(CLIENTE_MUDO, simetrico).perguntasQueDestravam.filter((p) => p.decisivo);
  const bairro = perguntas.find((p) => p.chave === "bairro");
  const preco = perguntas.find((p) => p.chave === "faixaDePreco");
  assert.equal(bairro.destravaOfertas, preco.destravaOfertas, "o cenário precisa mesmo empatar");
  assert.equal(
    perguntas[0].chave,
    "faixaDePreco",
    "empatado o destrave, a pergunta que decide mais da nota vem primeiro",
  );
});

test("cliente que já respondeu bairro não recebe a pergunta de bairro de novo", () => {
  // O outro lado do filtro: uma regra que sempre pergunta tudo passaria nos
  // testes acima e faria o corretor repetir na ligação o que a pessoa já disse.
  const r = recomendarPara({ ...CLIENTE_MUDO, preferred_neighborhoods: ["Perdizes"] }, CATALOGO);
  assert.ok(!chaves(r).includes("bairro"), "bairro respondido sai da fila de perguntas");
});
