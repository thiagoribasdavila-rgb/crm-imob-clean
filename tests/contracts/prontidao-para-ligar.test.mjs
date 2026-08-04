/**
 * Contrato da PRONTIDÃO PARA LIGAR A IA.
 *
 * O que este contrato protege não é a existência dos itens — é a REGRA que dá
 * sentido à tela: ausência nunca vira saúde, falha de leitura nunca vira zero,
 * e sintoma nunca vira tarefa.
 *
 * Cada asserção aqui corresponde a uma forma de mentir que a tela poderia ter.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  CATALOGO_DE_PRONTIDAO,
  EXPLICACAO_DO_ESTADO,
  EXPLICACAO_DO_GERAL,
  FILTRO_DE_CHAMADA_REAL,
  QUEM_RESOLVE,
  medirContagem,
  medirRetornoDeFuncao,
  medirVariaveisDeAmbiente,
  resumirProntidaoParaLigar,
} from "../../lib/ai/prontidao-para-ligar.ts";

/** Uma medida boa, para os testes tirarem UMA coisa de cada vez. */
const ok = (valor = 1) => ({ valor, fonte: "banco", comoFoiMedido: "contagem de teste" });
const naoLido = (motivo = "banco não respondeu") => ({
  valor: null,
  fonte: "banco",
  comoFoiMedido: "leitura tentada",
  motivoSemMedida: motivo,
});

/** Todo item medido e suficiente. */
const tudoPronto = Object.fromEntries(CATALOGO_DE_PRONTIDAO.map((i) => [i.id, ok(i.minimoParaLigar)]));

/* ── O ESTADO DE CADA ITEM ─────────────────────────────────────────────────── */

test("tudo medido e suficiente é `pronta`", () => {
  const v = resumirProntidaoParaLigar(tudoPronto);
  assert.equal(v.estado, "pronta");
  assert.equal(v.bloqueios, 0);
  assert.equal(v.naoMedidos, 0);
  assert.equal(v.primeiroPasso, null);
});

test("zero em item de causa própria BLOQUEIA — não é número neutro", () => {
  const v = resumirProntidaoParaLigar({ ...tudoPronto, template_aprovado: ok(0) });
  const item = v.itens.find((i) => i.id === "template_aprovado");
  assert.equal(item.estado, "bloqueia");
  assert.equal(v.estado, "bloqueada");
  // A frase precisa carregar o dono: bloqueio sem cadeira é bloqueio que ninguém pega.
  assert.match(item.frase, /Resolve:/);
});

test("todo item bloqueado nomeia QUEM resolve, e o nome é do catálogo", () => {
  for (const alvo of CATALOGO_DE_PRONTIDAO) {
    const v = resumirProntidaoParaLigar({ ...tudoPronto, [alvo.id]: ok(0) });
    const item = v.itens.find((i) => i.id === alvo.id);
    // Sintoma não precisa de dono; causa precisa.
    if (item.estado !== "bloqueia") continue;
    assert.ok(QUEM_RESOLVE[item.quemResolve], `${alvo.id} sem responsável conhecido`);
    assert.equal(v.porQuemResolve[item.quemResolve] >= 1, true);
  }
});

/* ── A REGRA CENTRAL: LEITURA FALHA NÃO É ZERO ─────────────────────────────── */

test("medida `null` vira `nao_medido` — nunca `bloqueia`, nunca `pronto`", () => {
  const v = resumirProntidaoParaLigar({ ...tudoPronto, template_aprovado: naoLido() });
  const item = v.itens.find((i) => i.id === "template_aprovado");
  assert.equal(item.estado, "nao_medido");
  assert.notEqual(item.estado, "bloqueia");
  assert.notEqual(item.estado, "pronto");
});

test("item que a rota ESQUECEU de reportar não nasce pronto", () => {
  // O modo de falha mais silencioso possível: a rota deixa de mandar uma medida
  // (renomearam a chave, a consulta caiu) e o item some ou fica verde.
  const semTemplate = { ...tudoPronto };
  delete semTemplate.template_aprovado;
  const v = resumirProntidaoParaLigar(semTemplate);
  const item = v.itens.find((i) => i.id === "template_aprovado");
  assert.ok(item, "o item sumiu da lista");
  assert.equal(item.estado, "nao_medido");
  assert.equal(item.medida.valor, null);
});

test("sem NENHUMA leitura o geral é `sem_leitura`, e não `bloqueada`", () => {
  const nada = Object.fromEntries(CATALOGO_DE_PRONTIDAO.map((i) => [i.id, naoLido()]));
  const v = resumirProntidaoParaLigar(nada);
  assert.equal(v.estado, "sem_leitura");
  assert.equal(v.bloqueios, 0, "não li nada, então não posso afirmar bloqueio");
  assert.match(v.frase, /não li nada|não conseguiu olhar/i);
});

test("`incerta` NÃO se disfarça de `pronta` quando falta ler um item", () => {
  // A armadilha clássica, na forma exata: não achei bloqueio, logo está pronto.
  const v = resumirProntidaoParaLigar({ ...tudoPronto, provedor_generativo: naoLido() });
  assert.equal(v.bloqueios, 0);
  assert.notEqual(v.estado, "pronta");
  assert.equal(v.estado, "incerta");
});

test("bloqueio medido vence item não lido — o acionável não espera o escuro", () => {
  const v = resumirProntidaoParaLigar({
    ...tudoPronto,
    template_aprovado: ok(0),
    provedor_generativo: naoLido(),
  });
  assert.equal(v.estado, "bloqueada");
  assert.equal(v.naoMedidos, 1, "o não lido continua contado, mesmo sem vencer");
});

/* ── CAUSA × SINTOMA ───────────────────────────────────────────────────────── */

test("jornada em zero com causa bloqueada é `consequencia`, não tarefa", () => {
  const v = resumirProntidaoParaLigar({
    ...tudoPronto,
    template_aprovado: ok(0),
    jornadas_de_venda: ok(0),
  });
  const jornada = v.itens.find((i) => i.id === "jornadas_de_venda");
  assert.equal(jornada.estado, "consequencia");
  assert.deepEqual(jornada.bloqueadoPor, ["template_aprovado"]);
  assert.match(jornada.frase, /consequência/i);
});

test("a frase da consequência nomeia o TÍTULO do antecedente, não o id", () => {
  // `consentimento_legivel` é nome de chave. O dono não deveria ter de traduzir
  // um id para descobrir o que está esperando — e `bloqueadoPor` continua com a
  // chave estável para quem consome o JSON.
  const v = resumirProntidaoParaLigar({
    ...tudoPronto,
    template_aprovado: ok(0),
    jornadas_de_venda: ok(0),
  });
  const jornada = v.itens.find((i) => i.id === "jornadas_de_venda");
  const titulo = CATALOGO_DE_PRONTIDAO.find((i) => i.id === "template_aprovado").titulo;
  assert.ok(jornada.frase.includes(titulo), `frase sem o título legível: ${jornada.frase}`);
  assert.doesNotMatch(jornada.frase, /template_aprovado/, "id cru vazou para a tela");
  assert.deepEqual(jornada.bloqueadoPor, ["template_aprovado"], "o id some do JSON");
});

test("SINTOMA NÃO ENTRA NA FILA DE NINGUÉM", () => {
  // A razão de `consequencia` existir: se o zero da jornada contasse como
  // pendência, o painel mandaria alguém "resolver as jornadas" — que é
  // impossível enquanto o template não existir.
  const v = resumirProntidaoParaLigar({
    ...tudoPronto,
    template_aprovado: ok(0),
    jornadas_de_venda: ok(0),
  });
  assert.equal(v.bloqueios, 1, "só a causa conta como bloqueio");
  assert.equal(v.consequencias, 1);
  const somaDasFilas = Object.values(v.porQuemResolve).reduce((a, b) => a + b, 0);
  assert.equal(somaDasFilas, 1, "a soma das filas conta causas, nunca sintomas");
});

test("com TODAS as causas prontas, o mesmo zero volta a ser causa própria", () => {
  // O outro lado do filtro: `consequencia` não pode virar desculpa permanente.
  // Se template, número e consentimento estão prontos e a jornada segue em zero,
  // aí sim existe defeito próprio — e ele precisa reaparecer como bloqueio.
  const v = resumirProntidaoParaLigar({ ...tudoPronto, jornadas_de_venda: ok(0) });
  const jornada = v.itens.find((i) => i.id === "jornadas_de_venda");
  assert.equal(jornada.estado, "bloqueia");
  assert.deepEqual(jornada.bloqueadoPor, []);
});

test("antecedente NÃO LIDO também explica o zero — e o geral não vira pronta", () => {
  const v = resumirProntidaoParaLigar({
    ...tudoPronto,
    template_aprovado: naoLido(),
    jornadas_de_venda: ok(0),
  });
  const jornada = v.itens.find((i) => i.id === "jornadas_de_venda");
  assert.equal(jornada.estado, "consequencia");
  assert.equal(v.estado, "incerta");
});

test("`nao_medido` nunca é rebaixado a consequência", () => {
  // Explicar um número que eu NÃO LI pela causa de outro item seria inventar a
  // razão de um valor desconhecido.
  const v = resumirProntidaoParaLigar({
    ...tudoPronto,
    template_aprovado: ok(0),
    jornadas_de_venda: naoLido(),
  });
  const jornada = v.itens.find((i) => i.id === "jornadas_de_venda");
  assert.equal(jornada.estado, "nao_medido");
  assert.deepEqual(jornada.bloqueadoPor, []);
});

/* ── O QUE AINDA DÁ PARA FAZER ─────────────────────────────────────────────── */

test("todo item do catálogo diz o que ainda dá para fazer sem ele", () => {
  for (const item of CATALOGO_DE_PRONTIDAO) {
    assert.ok(item.semEleDaPara && item.semEleDaPara.length > 20, `${item.id} sem saída declarada`);
    assert.ok(item.oQueFazer && item.oQueFazer.length > 20, `${item.id} sem ação declarada`);
  }
});

test("havendo bloqueio, a tela SEMPRE tem o que oferecer", () => {
  const v = resumirProntidaoParaLigar({ ...tudoPronto, template_aprovado: ok(0) });
  assert.ok(v.oQueDaParaFazerHoje.length > 0, "bloqueio sem saída ensina a fechar a aba");
});

test("o primeiro passo é a primeira CAUSA na ordem em que o motor tropeça", () => {
  // O consentimento é a primeira porta do laço por lead, antes da consulta ao
  // template. Se o primeiro passo apontasse o template, o dono resolveria a
  // parte cara e continuaria com zero jornadas.
  const v = resumirProntidaoParaLigar({
    ...tudoPronto,
    consentimento_legivel: ok(0),
    template_aprovado: ok(0),
  });
  assert.equal(v.primeiroPasso.id, "consentimento_legivel");
  const ordem = CATALOGO_DE_PRONTIDAO.map((i) => i.id);
  assert.ok(
    ordem.indexOf("consentimento_legivel") < ordem.indexOf("template_aprovado"),
    "a ordem do catálogo precisa seguir a ordem real das portas",
  );
});

/* ── COERÊNCIA DO CATÁLOGO ─────────────────────────────────────────────────── */

test("todo antecedente declarado existe no catálogo", () => {
  const ids = new Set(CATALOGO_DE_PRONTIDAO.map((i) => i.id));
  for (const item of CATALOGO_DE_PRONTIDAO) {
    for (const antecedente of item.decorreDe) {
      assert.ok(ids.has(antecedente), `${item.id} depende de ${antecedente}, que não existe`);
    }
    assert.ok(!item.decorreDe.includes(item.id), `${item.id} depende de si mesmo`);
  }
});

test("nenhum item depende de item POSTERIOR — a ordem carrega a causalidade", () => {
  const posicao = new Map(CATALOGO_DE_PRONTIDAO.map((item, i) => [item.id, i]));
  for (const item of CATALOGO_DE_PRONTIDAO) {
    for (const antecedente of item.decorreDe) {
      assert.ok(
        posicao.get(antecedente) < posicao.get(item.id),
        `${item.id} depende de ${antecedente}, que vem depois dele`,
      );
    }
  }
});

test("todo estado tem explicação escrita para a tela", () => {
  for (const estado of ["pronto", "bloqueia", "consequencia", "nao_medido"]) {
    assert.ok(EXPLICACAO_DO_ESTADO[estado]?.length > 20, `${estado} sem explicação utilizável`);
  }
  for (const estado of ["sem_leitura", "bloqueada", "incerta", "pronta"]) {
    assert.ok(EXPLICACAO_DO_GERAL[estado]?.length > 20, `${estado} sem explicação utilizável`);
  }
});

test("a explicação de `nao_medido` nega explicitamente que seja zero ou saúde", () => {
  assert.match(EXPLICACAO_DO_ESTADO.nao_medido, /NÃO significa que está tudo bem/);
  assert.match(EXPLICACAO_DO_ESTADO.nao_medido, /NÃO significa zero/);
});

test("a explicação de `consequencia` nega que seja tarefa", () => {
  assert.match(EXPLICACAO_DO_ESTADO.consequencia, /NÃO é uma tarefa/);
});

/* ── O FALLBACK LOCAL NÃO É PROVA DE IA VIVA ───────────────────────────────── */

test("o filtro de chamada real exclui provedor E modelo do fallback", () => {
  // A dupla exclusão é a lição de `prontidao-generativa.ts`: o roteador grava o
  // fallback determinístico como uso normal. Contar "existe linha recente"
  // declararia a IA viva justamente quando nenhuma respondeu.
  assert.match(FILTRO_DE_CHAMADA_REAL, /provider <> 'local'/);
  assert.match(FILTRO_DE_CHAMADA_REAL, /model <> 'deterministic-safe-fallback'/);
});

/* ── A FRONTEIRA ONDE O ZERO FALSO NASCE ───────────────────────────────────
   Estes casos moram aqui porque a conversão mora no módulo puro. Enquanto ela
   viveu dentro da rota, nenhum contrato conseguia executá-la — e foi justamente
   lá que um `Number(null) === 0` passou despercebido nesta entrega. */

test("contagem do banco: `count` numérico vira medida", () => {
  const m = medirContagem({ count: 204, error: null }, "como", "o quê");
  assert.equal(m.valor, 204);
  assert.equal(m.fonte, "banco");
});

test("contagem do banco: erro vira `null` com motivo, NUNCA zero", () => {
  const m = medirContagem({ count: null, error: { code: "42501" } }, "como", "os templates");
  assert.equal(m.valor, null);
  assert.match(m.motivoSemMedida, /não é zero/i);
});

test("contagem do banco: `count` ausente não vira zero", () => {
  // `count ?? 0` era a escrita natural aqui, e teria afirmado uma contagem que
  // o PostgREST não devolveu.
  assert.equal(medirContagem({ error: null }, "como", "o quê").valor, null);
  assert.equal(medirContagem(null, "como", "o quê").valor, null);
  assert.equal(medirContagem(undefined, "como", "o quê").valor, null);
});

test("função SQL: número finito vira medida", () => {
  assert.equal(medirRetornoDeFuncao({ data: 0, error: null }, "como", "o quê").valor, 0);
  assert.equal(medirRetornoDeFuncao({ data: 204, error: null }, "como", "o quê").valor, 204);
});

test("função SQL: `data: null` SEM erro não vira zero — o caso do `Number(null)`", () => {
  // `Number(null)` é `0`. A conversão parecia equivalente a uma checagem de tipo
  // e teria publicado "0 leads com consentimento" para uma função que não
  // respondeu — dentro do painel feito para impedir exatamente isso.
  const m = medirRetornoDeFuncao({ data: null, error: null }, "como", "as leads");
  assert.equal(m.valor, null);
  assert.notEqual(m.valor, 0);
});

test("função SQL: string vazia e texto também não viram zero", () => {
  assert.equal(medirRetornoDeFuncao({ data: "", error: null }, "como", "x").valor, null);
  assert.equal(medirRetornoDeFuncao({ data: "204", error: null }, "como", "x").valor, null);
});

test("função SQL ausente: o motivo diz ONDE se instala", () => {
  // Um "não medido" sem endereço é um beco sem saída para quem lê.
  const m = medirRetornoDeFuncao({ data: null, error: { code: "42883" } }, "como", "x", "migration X");
  assert.equal(m.valor, null);
  assert.match(m.motivoSemMedida, /migration X/);
});

test("ambiente: só conta 1 quando TODAS as variáveis estão preenchidas", () => {
  const como = "presença";
  assert.equal(medirVariaveisDeAmbiente(["A", "B"], { A: "x", B: "y" }, como).valor, 1);
  assert.equal(medirVariaveisDeAmbiente(["A", "B"], { A: "x" }, como).valor, 0);
  // Espaço em branco não é configuração.
  assert.equal(medirVariaveisDeAmbiente(["A"], { A: "   " }, como).valor, 0);
  assert.equal(medirVariaveisDeAmbiente(["A"], { A: "" }, como).valor, 0);
});

test("ambiente: o VALOR da variável nunca aparece na medida", () => {
  const segredo = "EAAG-token-secreto-123";
  const m = medirVariaveisDeAmbiente(["WHATSAPP_ACCESS_TOKEN"], { WHATSAPP_ACCESS_TOKEN: segredo }, "presença das variáveis");
  assert.equal(JSON.stringify(m).includes(segredo), false, "token vazou na medida");
});

/* ── NENHUMA FRASE VAZA SEGREDO ────────────────────────────────────────────── */

test("nenhuma frase do painel carrega valor de credencial", () => {
  const casos = [
    tudoPronto,
    { ...tudoPronto, numero_oficial: ok(0) },
    { ...tudoPronto, provedor_generativo: ok(0) },
    Object.fromEntries(CATALOGO_DE_PRONTIDAO.map((i) => [i.id, naoLido()])),
  ];
  for (const caso of casos) {
    const v = resumirProntidaoParaLigar(caso);
    const texto = [v.frase, ...v.itens.map((i) => i.frase), ...v.oQueDaParaFazerHoje].join(" ");
    assert.doesNotMatch(texto, /Bearer |eyJ|sk-[A-Za-z0-9]|pplx-|EAA[A-Za-z0-9]/, `frase suspeita: ${texto}`);
  }
});
