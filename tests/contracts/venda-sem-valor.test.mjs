/**
 * Contrato: VENDA FECHADA SEM VALOR É COBRADA, NÃO ESQUECIDA.
 *
 * ── O DEFEITO QUE ISTO FIXA ─────────────────────────────────────────────────
 *
 * `app/api/v1/pipeline/route.ts` grava `sale_value_brl` só quando o valor vem no
 * pedido (`if (saleValue !== null)`). O desenho está certo — fechar a venda não
 * pode travar porque o corretor ainda não tem o número, e a CAPI não deve emitir
 * `Purchase` sem valor. O defeito era **nada cobrar depois**.
 *
 * MEDIDO em 2026-07-30: 1 lead em `status='ganho'` com `sale_value_brl` NULO. No
 * painel ela aparece verdinha e resolvida. E uma linha assim quebra QUATRO coisas
 * ao mesmo tempo:
 *   VGV = R$ 0 · ROI não calculável · nenhum baseline para previsão ·
 *   evento Purchase nunca emitido para a Meta.
 *
 * Com a primeira venda real prevista para 2026-07-31, esta era a única peça que
 * podia fazer o evento se perder no dia em que ele finalmente existisse.
 */

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  aguardandoValorDaVenda,
  avaliarCobrancaDeValor,
  valorDaVendaAceitavel,
  DIAS_PARA_COBRANCA_CRITICA,
} from "../../lib/crm/venda-sem-valor.ts";

const AGORA = Date.parse("2026-07-30T12:00:00.000Z");
const diasAtras = (d) => new Date(AGORA - d * 86_400_000).toISOString();

test("venda fechada sem valor é cobrada", () => {
  for (const status of ["ganho", "won", "vendido", "GANHO"]) {
    assert.equal(
      aguardandoValorDaVenda({ status, sale_value_brl: null }),
      true,
      `"${status}" é venda fechada e precisa entrar na cobrança`,
    );
  }
});

test("venda com valor informado sai da cobrança — o outro lado", () => {
  // Sem isto, uma regra que devolve `true` para tudo passaria no teste acima e
  // encheria a fila do diretor com vendas já informadas.
  assert.equal(aguardandoValorDaVenda({ status: "ganho", sale_value_brl: 450000 }), false);
  assert.equal(aguardandoValorDaVenda({ status: "ganho", sale_value_brl: "450000" }), false);
});

test("lead que não é venda nunca entra na cobrança", () => {
  for (const status of ["novo", "contato", "qualificacao", "perdido", "arquivado", "comprou_outro"]) {
    assert.equal(aguardandoValorDaVenda({ status, sale_value_brl: null }), false);
  }
});

test("zero e valor ilegível contam como AUSENTE, não como informado", () => {
  /**
   * Venda de zero real não existe, e tratar `NaN` como informado esconderia dado
   * corrompido atrás de um verde. Foi por confiar num campo preenchido-mas-inválido
   * que esta base já publicou "delivered" para um evento que nunca saiu.
   */
  for (const valor of [0, "0", "", "abc", NaN, undefined]) {
    assert.equal(
      aguardandoValorDaVenda({ status: "ganho", sale_value_brl: valor }),
      true,
      `${JSON.stringify(valor)} tem de contar como valor ausente`,
    );
  }
});

test("a cobrança vira crítica no limiar, e a fronteira está onde o limiar diz", () => {
  const noLimiar = avaliarCobrancaDeValor(
    { status: "ganho", sale_value_brl: null, updated_at: diasAtras(DIAS_PARA_COBRANCA_CRITICA) },
    AGORA,
  );
  const antes = avaliarCobrancaDeValor(
    { status: "ganho", sale_value_brl: null, updated_at: diasAtras(DIAS_PARA_COBRANCA_CRITICA - 1) },
    AGORA,
  );
  assert.equal(noLimiar?.critico, true, "no limiar já é crítico");
  assert.equal(antes?.critico, false, "um dia antes ainda é 'não informou ainda' — o fim de semana cabe aqui");
});

test("sem âncora de tempo, NÃO inventa atraso", () => {
  /**
   * `dias === null` não pode virar crítico. Afirmar atraso sem saber desde quando
   * é inventar o dado que falta — e este repositório tem regra explícita contra
   * isso. A venda aparece na fila, sem prioridade forjada.
   */
  const semData = avaliarCobrancaDeValor({ status: "ganho", sale_value_brl: null }, AGORA);
  assert.ok(semData, "ela continua na cobrança");
  assert.equal(semData.dias, null);
  assert.equal(semData.critico, false, "sem âncora, criticidade seria invenção");
});

test("a consequência é dita, não subentendida", () => {
  const c = avaliarCobrancaDeValor({ status: "ganho", sale_value_brl: null, updated_at: diasAtras(1) }, AGORA);
  // O corretor não tem como saber que o número dele alimenta a otimização da Meta.
  // Cobrança sem motivo é burocracia; com motivo é trabalho.
  assert.match(c.consequencia, /VGV/);
  assert.match(c.consequencia, /Purchase|Meta/);
});

test("o valor recusa o impossível e aceita a venda grande", () => {
  assert.equal(valorDaVendaAceitavel(0).ok, false, "zero não é venda");
  assert.equal(valorDaVendaAceitavel(-10).ok, false, "negativo não é venda");
  assert.equal(valorDaVendaAceitavel("abc").ok, false, "texto não é valor");
  assert.equal(valorDaVendaAceitavel(null).ok, false);
  assert.equal(valorDaVendaAceitavel(450000).ok, true);
  assert.equal(valorDaVendaAceitavel("450000.50").ok, true, "string numérica é o que o corpo JSON entrega");
  // NÃO existe teto: inventar limite superior recusaria a venda grande de verdade,
  // e o dono deste produto proibiu inventar informação comercial. Erro de digitação
  // é problema de CONFIRMAÇÃO na tela — o servidor não sabe qual número é o certo.
  assert.equal(valorDaVendaAceitavel(98_000_000).ok, true, "venda de 98 milhões é possível e não cabe a nós recusar");
});

/**
 * A FIAÇÃO. A regra pode estar perfeita e a cobrança nunca chegar a ninguém.
 * Foi assim que `firstContactOverdue` viveu nesta base: calculado, tipado,
 * devolvido pela API e nunca renderizado.
 */
const raiz = path.resolve(import.meta.dirname, "..", "..");
const rota = fs.readFileSync(
  path.join(raiz, "app", "api", "v1", "crm", "vendas-sem-valor", "route.ts"),
  "utf8",
);

test("a rota usa a regra compartilhada e aplica o piso de carteira nos DOIS verbos", () => {
  assert.match(rota, /avaliarCobrancaDeValor/, "a leitura precisa CHAMAR a regra, não reimplementá-la");
  assert.match(rota, /valorDaVendaAceitavel/, "a escrita precisa validar pela regra compartilhada");
  /**
   * O piso importa mais aqui que em qualquer outra rota: valor de venda é a base
   * da comissão. Informar o valor da venda de um colega mexe no dinheiro dele.
   *
   * ── A PRIMEIRA VERSÃO DESTA ASSERÇÃO NÃO PEGAVA NADA ──────────────────────
   *
   * Ela contava ocorrências de `estaNaMinhaCarteira` (`>= 4`). A mutação M99
   * trocou `if (!leLiderancaInteira(...) && !daMinhaCarteira) {` por `if (false) {`
   * e SOBREVIVEU: o identificador continuava nas linhas que CALCULAM
   * `daMinhaCarteira`, então a contagem seguia em 4 com a trava desligada.
   *
   * É a terceira vez que esta classe morde nesta sessão — a mesma de M49, onde o
   * identificador sobrevivia na linha do `import`. Contar ocorrência prova que a
   * palavra existe; nunca que a DECISÃO acontece.
   *
   * Agora a asserção casa a CONDIÇÃO que recusa, dentro da região do POST, e
   * proíbe a forma neutralizada. Ancorada na região e não na linha, porque
   * asserção presa a formatação quebra no primeiro reflow.
   */
  const inicioDoPost = rota.indexOf("export async function POST");
  assert.ok(inicioDoPost > 0, "sem o POST não há escrita para proteger");
  const regiaoDoPost = rota.slice(inicioDoPost);

  assert.match(
    regiaoDoPost,
    /if\s*\(\s*!\s*leLiderancaInteira\([^)]*\)\s*&&\s*!\s*daMinhaCarteira\s*\)/,
    "o POST precisa RECUSAR quem não é liderança nem dono — a condição, não a menção",
  );
  assert.doesNotMatch(
    regiaoDoPost,
    /if\s*\(\s*(false|0)\s*\)/,
    "a trava do POST foi neutralizada: `if (false)` deixa qualquer corretor informar o valor da venda de um colega",
  );
  assert.match(regiaoDoPost, /VENDA_FORA_DA_CARTEIRA/, "a recusa precisa ter código próprio, não cair no genérico");
  // E o GET também recorta — os dois verbos, cada um com as duas formas de id.
  const regiaoDoGet = rota.slice(rota.indexOf("export async function GET"), inicioDoPost);
  assert.match(regiaoDoGet, /estaNaMinhaCarteira\([^)]*profile\.id/, "o GET filtra pelo id do perfil");
  assert.match(regiaoDoGet, /estaNaMinhaCarteira\([^)]*user\.id/, "e também pelo id do auth — as duas formas");
});

test("falha de leitura não vira 'nenhuma venda pendente'", () => {
  // Zero silencioso aqui faria o diretor concluir que está tudo informado.
  assert.match(rota, /VENDAS_SEM_VALOR_INDISPONIVEL/);
  assert.match(rota, /status: 503/);
});

test("a resposta carrega o denominador", () => {
  // "3 de 5 informadas" é auditável; "faltam 2" não diz se são 2 de 2 ou 2 de 200.
  // Foi a falta de denominador que fez "442 leads" virar um número sem significado.
  assert.match(rota, /vendasFechadas/);
});

test("as duas colunas do valor são gravadas juntas", () => {
  /**
   * `sale_value_brl` sem `sale_value_recorded_at` criaria a terceira variante do
   * mesmo fato — e é exatamente a classe de defeito dominante desta base. A rota
   * do pipeline grava as duas juntas; esta grava do mesmo jeito.
   */
  assert.match(rota, /sale_value_brl: validacao\.valor,\s*sale_value_recorded_at:/);
});
